"""Message worker — watches DB queue and processes via Claude CLI.

Runs as a long-lived process (systemd service).
Polls message_queue for pending messages.
Calls Claude CLI with MCP server for tool access.
Supports session continuity (--resume) and coding tasks (long timeout).
"""

import asyncio
import fcntl
import json
import logging
import os
import re
import subprocess
import time
from pathlib import Path

from bot.config import (
    require_env, BOT_DIR, TELEGRAM_ALLOWED_USERS,
    CLAUDE_MODEL_SIMPLE, CLAUDE_MODEL_COMPLEX,
    CLAUDE_TIMEOUT_SIMPLE, CLAUDE_TIMEOUT_COMPLEX,
)
from bot import supabase_client as db
from bot import telegram_sender as tg

log = logging.getLogger("secretary.worker")

POLL_INTERVAL = 3  # seconds between queue checks
LOCK_FILE = BOT_DIR / "worker.lock"
MCP_CONFIG = BOT_DIR / "mcp.json"
CLAUDE_MD_SIMPLE = BOT_DIR / "CLAUDE_SIMPLE.md"
CLAUDE_MD_FULL = BOT_DIR / "CLAUDE_FULL.md"
SESSIONS_FILE = BOT_DIR / "sessions.json"
WORKSPACE_DIR = Path("/home/john/projects/workspace")
SESSION_TTL = 7 * 24 * 60 * 60  # 7 days — Claude CLI auto-compacts long sessions
DRAIN_WAIT = 0.5  # seconds to wait for additional messages
MAX_RETRIES = 3  # max retry attempts for failed messages
ZOMBIE_TIMEOUT = 1800  # seconds before a "processing" message is considered zombie

# Keywords that indicate a complex/long-running task → Opus routing
_COMPLEX_KEYWORDS = re.compile(
    r"코딩|구현|빌드|테스트|qa|리팩토|수정해|만들어|설치|배포|작성|"
    r"프로젝트|개발|implement|build|deploy|refactor|coding|"
    r"루프런|looprun|멈추지.?말|끝까지|될때까지|자러간다|"
    r"플래닝|시간표|계획.세워|리뷰.트리거",
    re.IGNORECASE,
)


def _get_model(content: str) -> str:
    """Route to Opus for complex tasks, Haiku for everything else."""
    if _COMPLEX_KEYWORDS.search(content):
        return CLAUDE_MODEL_COMPLEX
    return CLAUDE_MODEL_SIMPLE


def _get_timeout(content: str) -> int:
    """Return appropriate timeout based on routed model."""
    if _COMPLEX_KEYWORDS.search(content):
        return CLAUDE_TIMEOUT_COMPLEX
    return CLAUDE_TIMEOUT_SIMPLE


# ---------------------------------------------------------------------------
# Lock Management (fcntl-based, atomic)
# ---------------------------------------------------------------------------

_lock_fd = None


def acquire_lock() -> bool:
    """Acquire an OS-level file lock (atomic, no race conditions)."""
    global _lock_fd
    try:
        _lock_fd = open(LOCK_FILE, "w")
        fcntl.flock(_lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        _lock_fd.write(str(os.getpid()))
        _lock_fd.flush()
        return True
    except (OSError, IOError):
        if _lock_fd:
            _lock_fd.close()
            _lock_fd = None
        return False


def release_lock() -> None:
    """Release the file lock (only if we hold it)."""
    global _lock_fd
    if _lock_fd:
        try:
            fcntl.flock(_lock_fd, fcntl.LOCK_UN)
            _lock_fd.close()
        except Exception:
            pass
        _lock_fd = None
        LOCK_FILE.unlink(missing_ok=True)


# ---------------------------------------------------------------------------
# Session Management (fcntl-locked JSON file)
# ---------------------------------------------------------------------------

SESSIONS_LOCK = BOT_DIR / "sessions.lock"
_sessions_lock_fd = None


def _acquire_sessions_lock() -> None:
    """Acquire exclusive lock for sessions file operations."""
    global _sessions_lock_fd
    _sessions_lock_fd = open(SESSIONS_LOCK, "w")
    fcntl.flock(_sessions_lock_fd, fcntl.LOCK_EX)


def _release_sessions_lock() -> None:
    """Release sessions file lock."""
    global _sessions_lock_fd
    if _sessions_lock_fd:
        fcntl.flock(_sessions_lock_fd, fcntl.LOCK_UN)
        _sessions_lock_fd.close()
        _sessions_lock_fd = None


def _load_sessions_unlocked() -> dict:
    """Load sessions from disk. Caller must hold lock."""
    try:
        with open(SESSIONS_FILE, "r") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return {}


def _save_sessions_unlocked(data: dict) -> None:
    """Write sessions to disk atomically. Caller must hold lock."""
    tmp = SESSIONS_FILE.with_suffix(".tmp")
    with open(tmp, "w") as f:
        json.dump(data, f, indent=2)
        f.flush()
        os.fsync(f.fileno())
    tmp.rename(SESSIONS_FILE)


def get_session(chat_id: int) -> str | None:
    """Get session_id for a chat, or None if expired/missing."""
    _acquire_sessions_lock()
    try:
        data = _load_sessions_unlocked()
        key = str(chat_id)
        entry = data.get(key)
        if not entry:
            return None
        age_hours = (time.time() - entry.get("last_used", 0)) / 3600
        if age_hours > SESSION_TTL / 3600:
            log.info(
                "Session expired for chat_id=%s (age=%.1fh, ttl=%dh), starting fresh",
                chat_id, age_hours, SESSION_TTL // 3600,
            )
            del data[key]
            _save_sessions_unlocked(data)
            return None
        return entry.get("session_id")
    finally:
        _release_sessions_lock()


def set_session(chat_id: int, session_id: str) -> None:
    """Store session_id for a chat."""
    _acquire_sessions_lock()
    try:
        data = _load_sessions_unlocked()
        data[str(chat_id)] = {
            "session_id": session_id,
            "last_used": time.time(),
        }
        _save_sessions_unlocked(data)
    finally:
        _release_sessions_lock()


def clear_session(chat_id: int) -> None:
    """Remove session for a chat."""
    _acquire_sessions_lock()
    try:
        data = _load_sessions_unlocked()
        data.pop(str(chat_id), None)
        _save_sessions_unlocked(data)
    finally:
        _release_sessions_lock()


# ---------------------------------------------------------------------------
# Claude CLI Execution
# ---------------------------------------------------------------------------

def run_claude(message_content: str, chat_id: int) -> tuple[bool, str]:
    """Run Claude CLI with MCP server and session support.

    Returns (success, output).
    Uses --output-format json to extract session_id.
    Resumes existing sessions with --resume.
    Falls back to new session if resume fails.
    Routes to Haiku (simple) or Opus (complex) based on message content.
    """
    prompt = (
        f"새 텔레그램 메시지가 도착했습니다.\n"
        f"chat_id: {chat_id}\n"
        f"메시지 내용:\n{message_content}\n\n"
        f"위 워크플로우에 따라 처리해주세요."
    )

    model = _get_model(message_content)
    timeout = _get_timeout(message_content)
    session_id = get_session(chat_id)

    log.info("Routing to %s for message (timeout=%ds)", model, timeout)

    success, output = _invoke_claude(prompt, chat_id, session_id, timeout, model)

    # If resume failed, retry without session
    if not success and session_id:
        log.warning("Resume failed for chat_id=%s, retrying without session", chat_id)
        clear_session(chat_id)
        success, output = _invoke_claude(prompt, chat_id, session_id=None, timeout=timeout, model=model)

    return success, output


def _invoke_claude(
    prompt: str,
    chat_id: int,
    session_id: str | None,
    timeout: int,
    model: str = CLAUDE_MODEL_COMPLEX,
) -> tuple[bool, str]:
    """Low-level Claude CLI invocation."""
    # Select system prompt based on model
    system_prompt = CLAUDE_MD_FULL if model == CLAUDE_MODEL_COMPLEX else CLAUDE_MD_SIMPLE

    cmd = [
        "claude", "-p",
        "--model", model,
        "--dangerously-skip-permissions",
        "--mcp-config", str(MCP_CONFIG),
        "--append-system-prompt-file", str(system_prompt),
        "--output-format", "json",
    ]
    if session_id:
        cmd.extend(["--resume", session_id])
    cmd.append(prompt)

    env = os.environ.copy()
    env.pop("CLAUDE_CODE_ENTRY_POINT", None)
    env.pop("CLAUDECODE", None)

    log.info(
        "Executing Claude CLI (model=%s, resume=%s, timeout=%ds)...",
        model,
        session_id[:8] if session_id else "new",
        timeout,
    )

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd=str(WORKSPACE_DIR),
            env=env,
        )

        if result.returncode == 0:
            log.info("Claude CLI completed successfully")
            # Parse JSON output to extract session_id
            _extract_and_save_session(result.stdout, chat_id)
            return True, result.stdout

        log.warning(
            "Claude CLI failed (code=%d): stderr=%s",
            result.returncode,
            result.stderr[:500],
        )
        return False, result.stderr[:500] or f"exit_code={result.returncode}"

    except subprocess.TimeoutExpired:
        log.error("Claude CLI timed out after %ds", timeout)
        return False, "timeout"
    except FileNotFoundError:
        log.error("Claude CLI not found in PATH")
        return False, "claude_not_found"
    except Exception as e:
        log.error("Claude CLI error: %s", e)
        return False, str(e)


def _extract_and_save_session(raw_output: str, chat_id: int) -> None:
    """Parse JSON output from Claude CLI and save session_id."""
    try:
        data = json.loads(raw_output)
        sid = data.get("session_id")
        if sid:
            set_session(chat_id, sid)
            log.info("Saved session_id=%s for chat_id=%s", sid[:8], chat_id)
    except (json.JSONDecodeError, AttributeError):
        log.debug("Could not parse session_id from Claude output")


# ---------------------------------------------------------------------------
# Message Batching
# ---------------------------------------------------------------------------

async def drain_messages(chat_id: int, first_content: str) -> tuple[str, list[str]]:
    """Collect the first message plus any additional pending messages for the same chat.

    Waits briefly to allow rapid-fire messages to arrive.
    Returns (combined_prompt, list_of_queue_ids).
    Note: The first message's queue_id is NOT included — caller tracks it separately.
    """
    parts = [first_content]
    extra_queue_ids = []

    # Brief wait for more messages
    await asyncio.sleep(DRAIN_WAIT)

    # Drain additional pending messages for this chat (capped to prevent infinite loop)
    MAX_DRAIN = 20
    for _ in range(MAX_DRAIN):
        extra = await db.dequeue_message_for_chat(chat_id)
        if not extra:
            break
        extra_queue_ids.append(extra["id"])
        parts.append(extra["content"])
        log.info("Batched extra message queue_id=%s", extra["id"])

    combined = "\n".join(parts)
    return combined, extra_queue_ids


# ---------------------------------------------------------------------------
# Zombie Recovery & Retry Logic (#3, #4)
# ---------------------------------------------------------------------------

async def recover_zombie_messages() -> int:
    """Reset 'processing' messages that have been stuck (zombie recovery).

    Called on worker startup. Returns the number of recovered messages.
    """
    recovered = 0
    try:
        result = await db._request(
            "GET",
            "message_queue",
            params={"status": "eq.processing", "order": "created_at.asc"},
        )
        if not result:
            return 0

        for msg in result:
            log.warning(
                "Recovering zombie message queue_id=%s (created_at=%s)",
                msg["id"], msg.get("created_at"),
            )
            await db.requeue_message(msg["id"])
            recovered += 1

    except Exception as e:
        log.error("Zombie recovery failed: %s", e)

    if recovered:
        log.info("Recovered %d zombie message(s)", recovered)
    return recovered


async def retry_recent_failures() -> int:
    """Re-queue recently failed 'timeout' messages for retry (max MAX_RETRIES).

    Only retries messages with error_message='timeout' from the last hour.
    Returns the number of retried messages.
    """
    retried = 0
    try:
        result = await db._request(
            "GET",
            "message_queue",
            params={
                "status": "eq.failed",
                "error_message": "eq.timeout",
                "order": "created_at.desc",
                "limit": "5",
            },
        )
        if not result:
            return 0

        for msg in result:
            # Check retry count from metadata
            metadata = msg.get("metadata") or {}
            retry_count = metadata.get("retry_count", 0)

            if retry_count >= MAX_RETRIES:
                log.info(
                    "Skipping retry for queue_id=%s (already retried %d times)",
                    msg["id"], retry_count,
                )
                continue

            # Update retry count in metadata and requeue
            metadata["retry_count"] = retry_count + 1
            await db._request(
                "PATCH",
                "message_queue",
                params={"id": f"eq.{msg['id']}"},
                json_body={
                    "status": "pending",
                    "error_message": None,
                    "metadata": metadata,
                },
            )
            log.info(
                "Retrying message queue_id=%s (attempt %d/%d)",
                msg["id"], retry_count + 1, MAX_RETRIES,
            )
            retried += 1

    except Exception as e:
        log.error("Retry logic failed: %s", e)

    if retried:
        log.info("Retried %d failed message(s)", retried)
    return retried


# ---------------------------------------------------------------------------
# Message Processing
# ---------------------------------------------------------------------------

async def process_one() -> bool:
    """Try to process one message from the queue.

    Returns True if a message was processed (success or fail).
    Returns False if queue was empty.
    """
    msg = await db.dequeue_message()
    if not msg:
        return False

    queue_id = msg["id"]
    chat_id = msg["chat_id"]
    content = msg["content"]

    log.info("Processing message queue_id=%s chat_id=%s", queue_id, chat_id)

    # Validate chat_id against allowed users
    if TELEGRAM_ALLOWED_USERS and chat_id not in TELEGRAM_ALLOWED_USERS:
        log.warning("Rejected message from unauthorized chat_id=%s", chat_id)
        await db.fail_message(queue_id, "unauthorized_chat_id")
        return True

    # Send typing indicator
    await tg.send_typing_action(chat_id)

    # Batch messages from the same chat
    combined_content, extra_queue_ids = await drain_messages(chat_id, content)
    all_queue_ids = [queue_id] + extra_queue_ids

    if extra_queue_ids:
        log.info("Batched %d messages for chat_id=%s", len(all_queue_ids), chat_id)

    lock_acquired = False
    try:
        lock_acquired = acquire_lock()
        if not lock_acquired:
            log.info("Another worker is running, requeueing messages")
            for qid in all_queue_ids:
                await db.requeue_message(qid)
            return True

        success, output = await asyncio.to_thread(run_claude, combined_content, chat_id)

        if success:
            for qid in all_queue_ids:
                await db.complete_message(qid)
            log.info("Messages processed successfully queue_ids=%s", all_queue_ids)
        else:
            for qid in all_queue_ids:
                await db.fail_message(qid, output)
            # Only send error message for non-timeout failures
            # Timeout failures will be auto-retried
            if output != "timeout":
                await tg.send_message(
                    chat_id,
                    "⚠️ 메시지 처리 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요."
                )
            else:
                log.info("Timeout failure — will be auto-retried on next cycle")
            log.error("Message processing failed queue_ids=%s: %s", all_queue_ids, output[:100])

    except Exception as e:
        log.error("Unexpected error processing queue_ids=%s: %s", all_queue_ids, e, exc_info=True)
        for qid in all_queue_ids:
            await db.fail_message(qid, str(e))
        await tg.send_message(chat_id, "⚠️ 내부 오류가 발생했습니다.")

    finally:
        if lock_acquired:
            release_lock()

    return True


# ---------------------------------------------------------------------------
# Main Loop
# ---------------------------------------------------------------------------

async def main():
    require_env()
    WORKSPACE_DIR.mkdir(parents=True, exist_ok=True)
    log.info(
        "Starting message worker (poll=%ds, simple=%ds, complex=%ds, retries=%d)...",
        POLL_INTERVAL, CLAUDE_TIMEOUT_SIMPLE, CLAUDE_TIMEOUT_COMPLEX, MAX_RETRIES,
    )

    # #3: Recover zombie messages on startup
    await recover_zombie_messages()

    # #4: Retry recently timed-out messages
    await retry_recent_failures()

    try:
        while True:
            try:
                processed = await process_one()
                if processed:
                    await asyncio.sleep(1)
                else:
                    await asyncio.sleep(POLL_INTERVAL)

            except KeyboardInterrupt:
                raise
            except Exception as e:
                log.error("Worker loop error: %s", e, exc_info=True)
                await asyncio.sleep(POLL_INTERVAL)

    except KeyboardInterrupt:
        log.info("Worker shutting down...")
    finally:
        release_lock()
        await db.close()
        log.info("Worker stopped.")


if __name__ == "__main__":
    asyncio.run(main())

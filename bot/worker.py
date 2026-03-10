"""Message worker — watches DB queue and processes via Anthropic API.

Runs as a long-lived process (systemd service).
Polls message_queue for pending messages.
Calls Anthropic Messages API directly with agentic tool_use loop.
Routes to Haiku (simple) or Opus (complex) based on message content.
"""

import asyncio
import fcntl
import json
import logging
import os
import re
from pathlib import Path

import httpx

from bot.config import (
    require_env, BOT_DIR, TELEGRAM_ALLOWED_USERS,
    CLAUDE_MODEL_SIMPLE, CLAUDE_MODEL_COMPLEX,
    CLAUDE_TIMEOUT_SIMPLE, CLAUDE_TIMEOUT_COMPLEX,
    ANTHROPIC_API_URL,
)
from bot.oauth_client import oauth
from bot.mcp_server import TOOL_DEFINITIONS, dispatch_tool
from bot import supabase_client as db
from bot import telegram_sender as tg

log = logging.getLogger("secretary.worker")

POLL_INTERVAL = 3  # seconds between queue checks
LOCK_FILE = BOT_DIR / "worker.lock"
CLAUDE_MD_SIMPLE = BOT_DIR / "CLAUDE_SIMPLE.md"
CLAUDE_MD_FULL = BOT_DIR / "CLAUDE_FULL.md"
DRAIN_WAIT = 0.5  # seconds to wait for additional messages
MAX_RETRIES = 3  # max retry attempts for failed messages
MAX_TOOL_ITERATIONS = 20  # max agentic tool_use loop iterations

# Keywords that indicate a complex/long-running task → Opus routing
_COMPLEX_KEYWORDS = re.compile(
    r"코딩|구현|빌드|테스트|qa|리팩토|수정해|만들어|설치|배포|작성|"
    r"프로젝트|개발|implement|build|deploy|refactor|coding|"
    r"루프런|looprun|멈추지.?말|끝까지|될때까지|자러간다|"
    r"플래닝|시간표|계획.세워|리뷰.트리거",
    re.IGNORECASE,
)

# Module-level httpx client (reused across requests)
_api_client: httpx.AsyncClient | None = None


def _get_api_client() -> httpx.AsyncClient:
    global _api_client
    if _api_client is None or _api_client.is_closed:
        _api_client = httpx.AsyncClient(timeout=120.0)
    return _api_client


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
# Anthropic API Execution (agentic tool_use loop)
# ---------------------------------------------------------------------------

async def run_claude(message_content: str, chat_id: int) -> tuple[bool, str]:
    """Call Anthropic Messages API with agentic tool_use loop.

    Returns (success, output).
    Routes to Haiku (simple) or Opus (complex) based on message content.
    Handles tool_use responses by dispatching to mcp_server tools.
    """
    model = _get_model(message_content)
    timeout = _get_timeout(message_content)
    system_prompt_path = CLAUDE_MD_FULL if model == CLAUDE_MODEL_COMPLEX else CLAUDE_MD_SIMPLE
    system_prompt = system_prompt_path.read_text()

    prompt = (
        f"새 텔레그램 메시지가 도착했습니다.\n"
        f"chat_id: {chat_id}\n"
        f"메시지 내용:\n{message_content}\n\n"
        f"위 워크플로우에 따라 처리해주세요."
    )

    messages = [{"role": "user", "content": prompt}]

    log.info("Calling Anthropic API (model=%s, timeout=%ds)", model, timeout)

    client = _get_api_client()
    retries = 0

    for iteration in range(MAX_TOOL_ITERATIONS):
        try:
            headers = await oauth.get_headers()
            resp = await asyncio.wait_for(
                client.post(
                    ANTHROPIC_API_URL,
                    headers=headers,
                    json={
                        "model": model,
                        "max_tokens": 4096,
                        "system": system_prompt,
                        "messages": messages,
                        "tools": TOOL_DEFINITIONS,
                    },
                ),
                timeout=timeout,
            )

            # Handle HTTP errors with retry logic
            if resp.status_code == 401:
                log.warning("401 Unauthorized — forcing token refresh")
                oauth._expires_at = 0  # force refresh
                await oauth._refresh_if_needed()
                retries += 1
                if retries > MAX_RETRIES:
                    return False, "auth_failed"
                continue

            if resp.status_code == 429:
                retry_after = int(resp.headers.get("retry-after", "5"))
                log.warning("429 Rate limited — backing off %ds", retry_after)
                await asyncio.sleep(retry_after)
                retries += 1
                if retries > MAX_RETRIES:
                    return False, "rate_limited"
                continue

            if resp.status_code >= 500:
                log.warning("Server error %d — retrying", resp.status_code)
                await asyncio.sleep(2 ** retries)
                retries += 1
                if retries > MAX_RETRIES:
                    return False, f"server_error_{resp.status_code}"
                continue

            resp.raise_for_status()
            retries = 0  # reset on success

        except asyncio.TimeoutError:
            log.error("API call timed out after %ds", timeout)
            return False, "timeout"
        except httpx.ConnectError as e:
            log.error("Connection error: %s", e)
            retries += 1
            if retries > MAX_RETRIES:
                return False, "connection_error"
            await asyncio.sleep(2 ** retries)
            continue
        except Exception as e:
            log.error("API request error: %s", e)
            return False, str(e)

        data = resp.json()
        stop_reason = data.get("stop_reason")
        content = data.get("content", [])

        # Append assistant response to messages
        messages.append({"role": "assistant", "content": content})

        if stop_reason == "tool_use":
            # Dispatch all tool calls
            tool_results = []
            for block in content:
                if block.get("type") == "tool_use":
                    tool_name = block["name"]
                    tool_input = block["input"]
                    log.info("Tool call [%d]: %s", iteration + 1, tool_name)
                    try:
                        result = await dispatch_tool(tool_name, tool_input)
                        tool_results.append({
                            "type": "tool_result",
                            "tool_use_id": block["id"],
                            "content": result,
                        })
                    except Exception as e:
                        log.error("Tool %s failed: %s", tool_name, e, exc_info=True)
                        tool_results.append({
                            "type": "tool_result",
                            "tool_use_id": block["id"],
                            "content": json.dumps({"error": str(e)}, ensure_ascii=False),
                            "is_error": True,
                        })

            messages.append({"role": "user", "content": tool_results})
            continue

        # end_turn or max_tokens → extract final text
        final_text = "".join(
            b["text"] for b in content if b.get("type") == "text"
        )
        log.info("API completed (iterations=%d, stop=%s)", iteration + 1, stop_reason)
        return True, final_text

    log.warning("Reached max tool iterations (%d)", MAX_TOOL_ITERATIONS)
    return False, "max_iterations"


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

        success, output = await run_claude(combined_content, chat_id)

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
                    "\u26a0\ufe0f 메시지 처리 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요."
                )
            else:
                log.info("Timeout failure — will be auto-retried on next cycle")
            log.error("Message processing failed queue_ids=%s: %s", all_queue_ids, output[:100])

    except Exception as e:
        log.error("Unexpected error processing queue_ids=%s: %s", all_queue_ids, e, exc_info=True)
        for qid in all_queue_ids:
            await db.fail_message(qid, str(e))
        await tg.send_message(chat_id, "\u26a0\ufe0f 내부 오류가 발생했습니다.")

    finally:
        if lock_acquired:
            release_lock()

    return True


# ---------------------------------------------------------------------------
# Main Loop
# ---------------------------------------------------------------------------

async def main():
    require_env()
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
        # Close shared clients
        global _api_client
        if _api_client and not _api_client.is_closed:
            await _api_client.aclose()
        await db.close()
        log.info("Worker stopped.")


if __name__ == "__main__":
    asyncio.run(main())

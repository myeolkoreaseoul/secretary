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
import time
from pathlib import Path

import httpx

from bot.config import (
    require_env, BOT_DIR, TELEGRAM_ALLOWED_USERS,
    CLAUDE_MODEL_SIMPLE, CLAUDE_MODEL_COMPLEX,
    CLAUDE_TIMEOUT_SIMPLE, CLAUDE_TIMEOUT_COMPLEX,
    ANTHROPIC_API_URL,
)
from bot.oauth_client import oauth
from bot.credential_watcher import watch_credentials
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
ZOMBIE_AGE_MINUTES = 10  # only recover messages older than this

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


def _safe_int(value: str, default: int = 5, cap: int = 120) -> int:
    """Safely parse an integer from a string with fallback and cap."""
    try:
        return min(int(value), cap)
    except (ValueError, TypeError):
        return default


# ---------------------------------------------------------------------------
# Lock Management (fcntl-based, stable inode)
# ---------------------------------------------------------------------------

_lock_fd = None


def acquire_lock() -> bool:
    """Acquire an OS-level file lock (atomic, no race conditions).

    US-001 fix: open with 'a+' to avoid truncation before lock.
    """
    global _lock_fd
    try:
        _lock_fd = open(LOCK_FILE, "a+")
        fcntl.flock(_lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        _lock_fd.seek(0)
        _lock_fd.truncate()
        _lock_fd.write(str(os.getpid()))
        _lock_fd.flush()
        return True
    except (OSError, IOError):
        if _lock_fd:
            _lock_fd.close()
            _lock_fd = None
        return False


def release_lock() -> None:
    """Release the file lock (only if we hold it).

    US-001 fix: never unlink the lock file — keep stable inode.
    """
    global _lock_fd
    if _lock_fd:
        try:
            fcntl.flock(_lock_fd, fcntl.LOCK_UN)
            _lock_fd.close()
        except Exception:
            pass
        _lock_fd = None
        # DO NOT unlink — stable inode prevents split-lock race


# ---------------------------------------------------------------------------
# Anthropic API Execution (agentic tool_use loop)
# ---------------------------------------------------------------------------

def _build_context_block(history: list, relevant_context: list, categories: list) -> str:
    """Build context text to inject into system prompt."""
    parts = ["## 현재 컨텍스트\n"]
    if history:
        parts.append("### 최근 대화 히스토리")
        for h in history[-10:]:
            parts.append(f"- [{h['role']}] {h['content'][:500]}")
    if relevant_context:
        parts.append("\n### 관련 과거 맥락")
        for r in relevant_context[:5]:
            content = r.get("content", "")
            if content:
                parts.append(f"- {content[:200]}")
    if categories:
        parts.append("\n### 사용 가능한 카테고리")
        parts.append(", ".join(c["name"] for c in categories))
    return "\n".join(parts)


def _parse_response(text: str) -> tuple[str, dict]:
    """Split sub-model output into response text and classification JSON."""
    # 1) ```json ... ``` block
    match = re.search(r'```json\s*(\{.*?\})\s*```', text, re.DOTALL)
    if match:
        try:
            classification = json.loads(match.group(1))
            response_text = text[:match.start()].strip()
            if response_text:
                return response_text, classification
        except json.JSONDecodeError:
            pass

    # 2) Fallback: last {...} containing "category"
    match = re.search(r'\{[^{}]*"category"[^{}]*\}', text, re.DOTALL)
    if match:
        try:
            classification = json.loads(match.group())
            response_text = text[:match.start()].strip()
            if response_text:
                return response_text, classification
        except json.JSONDecodeError:
            pass

    # 3) Default classification
    return text, {"category": "기타", "title": "미분류", "summary": text[:50], "advice": "", "entities": []}


STREAM_THROTTLE = 1.5  # seconds between Telegram edits during streaming


async def run_claude(
    message_content: str, chat_id: int, on_stream=None,
) -> tuple[bool, str]:
    """Call Anthropic Messages API with streaming + agentic tool_use loop.

    Returns (success, response_text).
    Pre-injects context into system prompt (no prepare_context tool call).
    Post-processes: parses classification JSON, saves to DB (fire-and-forget).
    on_stream: async callback(text) called periodically with accumulated text.
    """
    from bot.mcp_server import run_prepare_context, run_respond_and_classify

    model = _get_model(message_content)
    timeout = _get_timeout(message_content)
    system_prompt_path = CLAUDE_MD_FULL if model == CLAUDE_MODEL_COMPLEX else CLAUDE_MD_SIMPLE

    # Context pre-injection: run prepare_context directly (saves API round-trip)
    ctx = await run_prepare_context(chat_id, message_content)
    user_message_id = ctx["user_message_id"]

    base_prompt = system_prompt_path.read_text()
    context_block = _build_context_block(ctx["history"], ctx["relevant_context"], ctx["categories"])
    system_prompt = base_prompt + "\n\n" + context_block

    messages = [{"role": "user", "content": message_content}]

    log.info("Calling Anthropic API (model=%s, timeout=%ds, stream=true)", model, timeout)

    client = _get_api_client()
    retries = 0

    for iteration in range(MAX_TOOL_ITERATIONS):
        # Per-iteration state
        stream_text = ""
        content_blocks = []
        tool_blocks = []
        block_text = ""
        current_block_type = None
        current_tool_id = None
        current_tool_name = None
        current_tool_json = ""
        stop_reason = None
        last_stream_time = 0.0

        try:
            headers = await oauth.get_headers()
            body = {
                "model": model,
                "max_tokens": 4096,
                "system": system_prompt,
                "messages": messages,
                "tools": TOOL_DEFINITIONS,
                "stream": True,
            }

            async with client.stream(
                "POST", ANTHROPIC_API_URL,
                headers=headers, json=body,
                timeout=httpx.Timeout(timeout, connect=30.0),
            ) as resp:
                # Handle HTTP errors
                if resp.status_code == 401:
                    await resp.aread()
                    retries += 1
                    log.warning("401 Unauthorized (attempt %d/%d)", retries, MAX_RETRIES)
                    oauth.mark_server_rejected()
                    oauth.reload_from_disk()
                    if retries > MAX_RETRIES:
                        return False, "auth_failed"
                    await asyncio.sleep(min(2 ** retries, 8))
                    continue

                if resp.status_code == 429:
                    await resp.aread()
                    retry_after = _safe_int(resp.headers.get("retry-after", "5"))
                    log.warning("429 Rate limited — backing off %ds", retry_after)
                    await asyncio.sleep(retry_after)
                    retries += 1
                    if retries > MAX_RETRIES:
                        return False, "rate_limited"
                    continue

                if resp.status_code >= 500:
                    await resp.aread()
                    log.warning("Server error %d — retrying", resp.status_code)
                    await asyncio.sleep(2 ** retries)
                    retries += 1
                    if retries > MAX_RETRIES:
                        return False, f"server_error_{resp.status_code}"
                    continue

                if resp.status_code != 200:
                    await resp.aread()
                    log.error("Unexpected status %d", resp.status_code)
                    return False, f"http_{resp.status_code}"

                retries = 0

                # Parse SSE stream
                async for line in resp.aiter_lines():
                    if not line.startswith("data: "):
                        continue
                    raw = line[6:]
                    if raw == "[DONE]":
                        break

                    try:
                        event = json.loads(raw)
                    except json.JSONDecodeError:
                        continue

                    etype = event.get("type")

                    if etype == "content_block_start":
                        block = event.get("content_block", {})
                        current_block_type = block.get("type")
                        if current_block_type == "tool_use":
                            current_tool_id = block.get("id")
                            current_tool_name = block.get("name")
                            current_tool_json = ""
                        elif current_block_type == "text":
                            block_text = ""

                    elif etype == "content_block_delta":
                        delta = event.get("delta", {})
                        if delta.get("type") == "text_delta":
                            chunk = delta.get("text", "")
                            block_text += chunk
                            stream_text += chunk
                            # Throttled stream update
                            if on_stream:
                                now = time.monotonic()
                                if now - last_stream_time >= STREAM_THROTTLE:
                                    try:
                                        await on_stream(stream_text)
                                    except Exception as e:
                                        log.warning("Stream update failed: %s", e)
                                    last_stream_time = now
                        elif delta.get("type") == "input_json_delta":
                            current_tool_json += delta.get("partial_json", "")

                    elif etype == "content_block_stop":
                        if current_block_type == "text":
                            content_blocks.append({"type": "text", "text": block_text})
                        elif current_block_type == "tool_use":
                            try:
                                tool_input = json.loads(current_tool_json) if current_tool_json else {}
                            except json.JSONDecodeError:
                                tool_input = {}
                            content_blocks.append({
                                "type": "tool_use", "id": current_tool_id,
                                "name": current_tool_name, "input": tool_input,
                            })
                            tool_blocks.append({
                                "id": current_tool_id,
                                "name": current_tool_name,
                                "input": tool_input,
                            })
                        current_block_type = None

                    elif etype == "message_delta":
                        stop_reason = event.get("delta", {}).get("stop_reason")

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

        # Build assistant message for conversation history
        messages.append({"role": "assistant", "content": content_blocks})

        if stop_reason == "tool_use":
            tool_results = []
            for tool in tool_blocks:
                log.info("Tool call [%d]: %s", iteration + 1, tool["name"])
                try:
                    result = await dispatch_tool(tool["name"], tool["input"])
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": tool["id"],
                        "content": result,
                    })
                except Exception as e:
                    log.error("Tool %s failed: %s", tool["name"], e, exc_info=True)
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": tool["id"],
                        "content": json.dumps({"error": str(e)}, ensure_ascii=False),
                        "is_error": True,
                    })

            if not tool_results:
                log.error("stop_reason=tool_use but no tool blocks")
                return False, "protocol_error_empty_tool_use"

            messages.append({"role": "user", "content": tool_results})
            # Send typing action during tool execution
            await tg.send_typing_action(chat_id)
            continue

        # end_turn or max_tokens
        final_text = "".join(b["text"] for b in content_blocks if b.get("type") == "text")
        log.info("API completed (iterations=%d, stop=%s)", iteration + 1, stop_reason)

        # Final stream update with complete text
        if on_stream and stream_text:
            try:
                await on_stream(stream_text)
            except Exception:
                pass

        # Parse response text and classification JSON
        response_text, classification = _parse_response(final_text)

        # Fire-and-forget: save bot response + classification + embedding to DB
        asyncio.create_task(run_respond_and_classify(
            chat_id=chat_id,
            message_id=user_message_id,
            response_text=response_text,
            classification=classification,
            skip_telegram=True,
        ))

        return True, response_text

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
# Zombie Recovery & Retry Logic
# ---------------------------------------------------------------------------

async def recover_zombie_messages() -> int:
    """Reset 'processing' messages that have been stuck (zombie recovery).

    US-003 fix: only requeues messages older than ZOMBIE_AGE_MINUTES.
    Called on worker startup AFTER acquiring lock.
    """
    from datetime import datetime, timedelta, timezone
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=ZOMBIE_AGE_MINUTES)).isoformat()

    recovered = 0
    try:
        result = await db._request(
            "GET",
            "message_queue",
            params={
                "status": "eq.processing",
                "created_at": f"lt.{cutoff}",
                "order": "created_at.asc",
            },
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

    US-008 fix: only retries messages from the last hour (created_at filter).
    """
    from datetime import datetime, timedelta, timezone
    one_hour_ago = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()

    retried = 0
    try:
        result = await db._request(
            "GET",
            "message_queue",
            params={
                "status": "eq.failed",
                "error_message": "eq.timeout",
                "created_at": f"gte.{one_hour_ago}",
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

            # Update retry count in metadata and requeue (guard with status=eq.failed)
            metadata["retry_count"] = retry_count + 1
            await db._request(
                "PATCH",
                "message_queue",
                params={"id": f"eq.{msg['id']}", "status": "eq.failed"},
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

    # Batch messages from the same chat
    combined_content, extra_queue_ids = await drain_messages(chat_id, content)
    all_queue_ids = [queue_id] + extra_queue_ids

    if extra_queue_ids:
        log.info("Batched %d messages for chat_id=%s", len(all_queue_ids), chat_id)

    stream_msg_id = None
    lock_acquired = False
    try:
        # Send typing indicator (no placeholder message)
        await tg.send_typing_action(chat_id)

        lock_acquired = acquire_lock()
        if not lock_acquired:
            log.info("Another worker is running, requeueing messages")
            for qid in all_queue_ids:
                await db.requeue_message(qid)
            return True

        # Streaming callback: progressively send/edit message
        async def on_stream(text: str):
            nonlocal stream_msg_id
            # Strip classification JSON block for display
            display = text.split("```json")[0].rstrip()
            if not display:
                return
            try:
                if stream_msg_id is None:
                    stream_msg_id = await tg.send_message(chat_id, display, parse_mode=None)
                else:
                    await tg.edit_message(chat_id, stream_msg_id, display, parse_mode=None)
            except Exception as e:
                log.warning("Stream display update failed: %s", e)

        success, output = await run_claude(combined_content, chat_id, on_stream=on_stream)

        if success:
            for qid in all_queue_ids:
                await db.complete_message(qid)
            # Final edit with clean response (parsed, no JSON block)
            if stream_msg_id:
                if len(output) <= 4096:
                    await tg.edit_message(chat_id, stream_msg_id, output)
                else:
                    await tg.edit_message(chat_id, stream_msg_id, "✅", parse_mode=None)
                    await tg.send_message(chat_id, output)
            else:
                await tg.send_message(chat_id, output)
            log.info("Messages processed successfully queue_ids=%s", all_queue_ids)
        else:
            for qid in all_queue_ids:
                await db.fail_message(qid, output)
            error_text = "⚠️ 메시지 처리 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요."
            if output == "timeout":
                log.info("Timeout failure — will be auto-retried on next cycle")
            elif stream_msg_id:
                await tg.edit_message(chat_id, stream_msg_id, error_text, parse_mode=None)
            else:
                await tg.send_message(chat_id, error_text)
            log.error("Message processing failed queue_ids=%s: %s", all_queue_ids, output[:100])

    except Exception as e:
        log.error("Unexpected error processing queue_ids=%s: %s", all_queue_ids, e, exc_info=True)
        for qid in all_queue_ids:
            await db.fail_message(qid, str(e))
        if stream_msg_id:
            await tg.edit_message(chat_id, stream_msg_id, "⚠️ 내부 오류가 발생했습니다.", parse_mode=None)
        else:
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
    log.info(
        "Starting message worker (poll=%ds, simple=%ds, complex=%ds, retries=%d)...",
        POLL_INTERVAL, CLAUDE_TIMEOUT_SIMPLE, CLAUDE_TIMEOUT_COMPLEX, MAX_RETRIES,
    )

    # US-003 fix: acquire lock BEFORE zombie recovery
    if not acquire_lock():
        log.error("Another worker is already running — exiting")
        return

    try:
        # Start credential file watcher (background task)
        watcher_task = asyncio.create_task(watch_credentials(oauth))
        watcher_task.add_done_callback(
            lambda t: log.error("Credential watcher died: %s", t.exception())
            if not t.cancelled() and t.exception() else None
        )

        # Recover zombie messages (only old ones, after lock acquired)
        await recover_zombie_messages()

        # Retry recently timed-out messages
        await retry_recent_failures()

        # Release startup lock — process_one() acquires its own per-message lock
        release_lock()

        while True:
            try:
                # If OAuth is unhealthy, back off and reload before processing
                if not oauth.is_healthy:
                    log.warning("OAuth unhealthy — reloading credentials from disk")
                    oauth.reload_from_disk()
                    await asyncio.sleep(30)
                    continue

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
        watcher_task.cancel()
        release_lock()
        # Close shared clients
        global _api_client
        if _api_client and not _api_client.is_closed:
            await _api_client.aclose()
        await db.close()
        log.info("Worker stopped.")


if __name__ == "__main__":
    asyncio.run(main())

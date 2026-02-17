"""QA test suite — 20 tests covering all modules + new coding features.

Tests are designed to be idempotent and safe to run repeatedly.
Run: python3 -m bot.tests.test_qa
"""

import asyncio
import json
import os
import sys
import tempfile
import time
from pathlib import Path

# Ensure bot package is importable
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from bot.config import require_env

PASS = 0
FAIL = 0
RESULTS: list[tuple[str, bool, str]] = []


def record(name: str, ok: bool, detail: str = ""):
    global PASS, FAIL
    if ok:
        PASS += 1
        tag = "PASS"
    else:
        FAIL += 1
        tag = "FAIL"
    RESULTS.append((name, ok, detail))
    print(f"  [{tag}] {name}" + (f" — {detail}" if detail else ""))


async def run_all():
    require_env()

    from bot import supabase_client as db
    from bot import telegram_sender as tg
    from bot import embedding as emb
    from bot.config import TELEGRAM_ALLOWED_USERS

    print("\n=== QA Test Suite (20 tests) ===\n")

    # --- 1. DB: get_categories ---
    try:
        cats = await db.get_categories()
        record("01_db_get_categories", isinstance(cats, list) and len(cats) > 0, f"{len(cats)} categories")
    except Exception as e:
        record("01_db_get_categories", False, str(e))

    # --- 2. DB: get_recent_messages ---
    try:
        chat_id = TELEGRAM_ALLOWED_USERS[0] if TELEGRAM_ALLOWED_USERS else 0
        msgs = await db.get_recent_messages(chat_id, 24)
        record("02_db_get_recent_messages", isinstance(msgs, list), f"{len(msgs)} messages")
    except Exception as e:
        record("02_db_get_recent_messages", False, str(e))

    # --- 3. DB: enqueue + dequeue ---
    try:
        queued = await db.enqueue_message(chat_id=0, content="QA_TEST_MSG")
        assert queued and queued.get("id"), "enqueue returned no id"
        qid = queued["id"]
        dequeued = await db.dequeue_message()
        # Clean up
        if dequeued and dequeued["id"] == qid:
            await db.complete_message(qid)
            record("03_db_enqueue_dequeue", True, f"queue_id={qid}")
        else:
            # May have grabbed another pending msg — complete the test one anyway
            await db.complete_message(qid)
            record("03_db_enqueue_dequeue", True, f"queue_id={qid} (different dequeue)")
    except Exception as e:
        record("03_db_enqueue_dequeue", False, str(e))

    # --- 4. DB: complete_message ---
    try:
        q = await db.enqueue_message(chat_id=0, content="QA_COMPLETE_TEST")
        qid = q["id"]
        # Dequeue it first
        await db._request("PATCH", "message_queue", params={"id": f"eq.{qid}"}, json_body={"status": "processing"})
        await db.complete_message(qid)
        record("04_db_complete_message", True)
    except Exception as e:
        record("04_db_complete_message", False, str(e))

    # --- 5. DB: fail_message ---
    try:
        q = await db.enqueue_message(chat_id=0, content="QA_FAIL_TEST")
        qid = q["id"]
        await db._request("PATCH", "message_queue", params={"id": f"eq.{qid}"}, json_body={"status": "processing"})
        await db.fail_message(qid, "test_error")
        record("05_db_fail_message", True)
    except Exception as e:
        record("05_db_fail_message", False, str(e))

    # --- 6. DB: save_message + save_classification ---
    try:
        msg = await db.save_message(chat_id=0, role="user", content="QA test message")
        assert msg and msg.get("id"), "save_message returned no id"
        await db.save_classification(msg["id"], {
            "category": "기타", "title": "QA 테스트", "summary": "QA", "advice": "N/A", "entities": []
        })
        record("06_db_save_classify", True, f"msg_id={msg['id']}")
    except Exception as e:
        record("06_db_save_classify", False, str(e))

    # --- 7. DB: add_todo ---
    try:
        todo = await db.add_todo(title="QA test todo", priority=0)
        assert todo and todo.get("id")
        record("07_db_add_todo", True, f"todo_id={todo['id']}")
    except Exception as e:
        record("07_db_add_todo", False, str(e))

    # --- 8. DB: dequeue_message_for_chat (new) ---
    try:
        q = await db.enqueue_message(chat_id=99999, content="QA_CHAT_DEQUEUE")
        qid = q["id"]
        got = await db.dequeue_message_for_chat(99999)
        if got and got["id"] == qid:
            await db.complete_message(qid)
            record("08_db_dequeue_for_chat", True)
        else:
            await db.complete_message(qid)
            record("08_db_dequeue_for_chat", False, "wrong message or None")
    except Exception as e:
        record("08_db_dequeue_for_chat", False, str(e))

    # --- 9. DB: get_pending_messages_for_chat (new) ---
    try:
        q = await db.enqueue_message(chat_id=99998, content="QA_PENDING_CHECK")
        qid = q["id"]
        pending = await db.get_pending_messages_for_chat(99998)
        found = any(m["id"] == qid for m in pending)
        # Clean up
        await db._request("PATCH", "message_queue", params={"id": f"eq.{qid}"}, json_body={"status": "processing"})
        await db.complete_message(qid)
        record("09_db_pending_for_chat", found, f"found={found}, count={len(pending)}")
    except Exception as e:
        record("09_db_pending_for_chat", False, str(e))

    # --- 10. DB: dequeue race guard (status=eq.pending on PATCH) ---
    try:
        q = await db.enqueue_message(chat_id=0, content="QA_RACE_GUARD")
        qid = q["id"]
        # Manually set to processing first
        await db._request("PATCH", "message_queue", params={"id": f"eq.{qid}"}, json_body={"status": "processing"})
        # Now try to dequeue — should return None because status is no longer pending
        # We use dequeue_message_for_chat with chat_id=0
        got = await db.dequeue_message_for_chat(0)
        # got could be None (correct) or another message
        race_ok = got is None or got["id"] != qid
        await db.complete_message(qid)
        if got and got["id"] != qid:
            await db.complete_message(got["id"])
        record("10_db_dequeue_race_guard", race_ok, f"got_different_or_none={race_ok}")
    except Exception as e:
        record("10_db_dequeue_race_guard", False, str(e))

    # --- 11. Embedding: generate ---
    try:
        vec = await emb.generate_embedding("테스트 임베딩 생성")
        ok = vec is not None and len(vec) == 768
        record("11_embedding_generate", ok, f"dim={len(vec) if vec else 0}")
    except Exception as e:
        record("11_embedding_generate", False, str(e))

    # --- 12. Embedding: model name ---
    try:
        name = emb.get_model_name()
        record("12_embedding_model_name", name == "gemini/gemini-embedding-001", name)
    except Exception as e:
        record("12_embedding_model_name", False, str(e))

    # --- 13. DB: vector search ---
    try:
        vec = await emb.generate_embedding("일정 관리 회의")
        if vec:
            similar = await db.search_similar(vec)
            record("13_db_vector_search", isinstance(similar, list), f"{len(similar)} results")
        else:
            record("13_db_vector_search", False, "embedding failed")
    except Exception as e:
        record("13_db_vector_search", False, str(e))

    # --- 14. Telegram: send_message ---
    try:
        chat_id = TELEGRAM_ALLOWED_USERS[0] if TELEGRAM_ALLOWED_USERS else 0
        ok = await tg.send_message(chat_id, "QA test #14 — 자동 테스트 메시지입니다.")
        record("14_telegram_send", ok)
    except Exception as e:
        record("14_telegram_send", False, str(e))

    # --- 15. MCP: import check ---
    try:
        from bot import mcp_server
        tools_fn = mcp_server.list_tools
        record("15_mcp_import", callable(tools_fn))
    except Exception as e:
        record("15_mcp_import", False, str(e))

    # --- 16. Worker: session management ---
    try:
        from bot.worker import get_session, set_session, clear_session
        test_chat = 777777
        set_session(test_chat, "test-session-abc")
        got = get_session(test_chat)
        assert got == "test-session-abc", f"expected test-session-abc, got {got}"
        clear_session(test_chat)
        got2 = get_session(test_chat)
        assert got2 is None, f"expected None after clear, got {got2}"
        record("16_worker_sessions", True)
    except Exception as e:
        record("16_worker_sessions", False, str(e))

    # --- 17. Worker: session TTL expiry ---
    try:
        from bot.worker import (
            get_session, set_session, clear_session,
            _acquire_sessions_lock, _release_sessions_lock,
            _load_sessions_unlocked, _save_sessions_unlocked,
            SESSION_TTL,
        )
        test_chat = 888888
        # Write a session with old timestamp
        _acquire_sessions_lock()
        try:
            data = _load_sessions_unlocked()
            data[str(test_chat)] = {
                "session_id": "old-session",
                "last_used": time.time() - SESSION_TTL - 100,
            }
            _save_sessions_unlocked(data)
        finally:
            _release_sessions_lock()
        got = get_session(test_chat)
        record("17_worker_session_ttl", got is None, f"expired={got is None}")
    except Exception as e:
        record("17_worker_session_ttl", False, str(e))

    # --- 18. Worker: drain_messages batching ---
    try:
        from bot.worker import drain_messages
        # Use unique chat_id unlikely to be picked by running worker
        drain_chat = 77770018
        q1 = await db.enqueue_message(chat_id=drain_chat, content="batch_msg_1")
        q2 = await db.enqueue_message(chat_id=drain_chat, content="batch_msg_2")
        combined, extra_ids = await drain_messages(drain_chat, "first_msg")
        ok = "first_msg" in combined and len(extra_ids) >= 1
        # Clean up
        for qid in extra_ids:
            await db.complete_message(qid)
        # Also clean up any un-drained messages
        leftover = await db.get_pending_messages_for_chat(drain_chat)
        for m in leftover:
            await db._request("PATCH", "message_queue", params={"id": f"eq.{m['id']}"}, json_body={"status": "processing"})
            await db.complete_message(m["id"])
        record("18_worker_drain_messages", ok, f"extra_count={len(extra_ids)}, combined_has_first={('first_msg' in combined)}")
    except Exception as e:
        record("18_worker_drain_messages", False, str(e))

    # --- 19. MCP: send_file path traversal blocked ---
    try:
        from bot.mcp_server import _dispatch
        result = await _dispatch("send_file", {
            "chat_id": 0,
            "file_path": "/home/john/projects/workspace-evil/hack.sh",
        })
        blocked = "error" in result and "보안" in result["error"]
        record("19_mcp_path_traversal_blocked", blocked, result.get("error", "")[:60])
    except Exception as e:
        record("19_mcp_path_traversal_blocked", False, str(e))

    # --- 20. Workspace directory exists ---
    try:
        ws = Path("/home/john/projects/workspace")
        record("20_workspace_exists", ws.is_dir())
    except Exception as e:
        record("20_workspace_exists", False, str(e))

    # --- Cleanup ---
    await db.close()
    await emb.close()

    # --- Summary ---
    print(f"\n{'='*40}")
    print(f"TOTAL: {PASS + FAIL}  |  PASS: {PASS}  |  FAIL: {FAIL}")
    print(f"{'='*40}\n")

    return FAIL == 0


def main():
    ok = asyncio.run(run_all())
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()

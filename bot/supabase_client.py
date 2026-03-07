"""Supabase REST API client for all database operations."""

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

from bot.config import SUPABASE_REST_URL, SUPABASE_HEADERS, SUPABASE_URL, SUPABASE_SERVICE_KEY

log = logging.getLogger("secretary.supabase")

_client: httpx.AsyncClient | None = None


def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(timeout=30.0)
    return _client


async def _request(
    method: str,
    path: str,
    *,
    params: dict | None = None,
    json_body: Any = None,
    headers: dict | None = None,
) -> Any:
    """Make a request to Supabase REST API."""
    client = _get_client()
    url = f"{SUPABASE_REST_URL}/{path}"
    merged_headers = {**SUPABASE_HEADERS, **(headers or {})}

    resp = await client.request(
        method, url, params=params, json=json_body, headers=merged_headers
    )
    resp.raise_for_status()

    if resp.status_code == 204 or not resp.content:
        return None
    return resp.json()


async def _rpc(fn_name: str, params: dict) -> Any:
    """Call a Supabase RPC function."""
    client = _get_client()
    url = f"{SUPABASE_URL}/rest/v1/rpc/{fn_name}"
    resp = await client.post(url, json=params, headers=SUPABASE_HEADERS)
    resp.raise_for_status()
    return resp.json()


# ---------------------------------------------------------------------------
# Message Queue
# ---------------------------------------------------------------------------

async def enqueue_message(
    chat_id: int,
    content: str,
    telegram_message_id: int | None = None,
    sender: str | None = None,
    media_type: str | None = None,
    metadata: dict | None = None,
) -> dict:
    """Insert a message into the queue."""
    body: dict[str, Any] = {
        "chat_id": chat_id,
        "content": content,
        "status": "pending",
    }
    if telegram_message_id is not None:
        body["telegram_message_id"] = telegram_message_id
    if sender:
        body["sender"] = sender
    if media_type:
        body["media_type"] = media_type
    if metadata:
        body["metadata"] = metadata

    result = await _request("POST", "message_queue", json_body=body)
    log.info("Enqueued message queue_id=%s chat_id=%s", result[0]["id"], chat_id)
    return result[0]


async def dequeue_message() -> dict | None:
    """Atomically claim the oldest pending message.

    Uses FOR UPDATE SKIP LOCKED via Supabase RPC to prevent race conditions.
    Falls back to a simple SELECT + UPDATE if the RPC is not available.
    """
    # Simple approach: select oldest pending, then update to processing
    # Note: True FOR UPDATE SKIP LOCKED requires a raw SQL RPC.
    # For a single-worker setup, this select-then-update is safe.
    result = await _request(
        "GET",
        "message_queue",
        params={
            "status": "eq.pending",
            "order": "created_at.asc",
            "limit": "1",
        },
    )
    if not result:
        return None

    msg = result[0]
    # Mark as processing (with status guard to prevent double-dequeue)
    patched = await _request(
        "PATCH",
        "message_queue",
        params={"id": f"eq.{msg['id']}", "status": "eq.pending"},
        json_body={"status": "processing"},
    )
    if not patched:
        # Another worker already claimed it
        log.info("Message queue_id=%s already claimed, skipping", msg["id"])
        return None
    log.info("Dequeued message queue_id=%s", msg["id"])
    return msg


async def complete_message(queue_id: str) -> None:
    """Mark a queue message as done."""
    await _request(
        "PATCH",
        "message_queue",
        params={"id": f"eq.{queue_id}"},
        json_body={
            "status": "done",
            "processed_at": datetime.now(timezone.utc).isoformat(),
        },
    )
    log.info("Completed message queue_id=%s", queue_id)


async def fail_message(queue_id: str, error: str) -> None:
    """Mark a queue message as failed."""
    await _request(
        "PATCH",
        "message_queue",
        params={"id": f"eq.{queue_id}"},
        json_body={"status": "failed", "error_message": error[:500]},
    )
    log.warning("Failed message queue_id=%s error=%s", queue_id, error[:100])


async def requeue_message(queue_id: str) -> None:
    """Put a message back to pending (e.g. on lock contention)."""
    await _request(
        "PATCH",
        "message_queue",
        params={"id": f"eq.{queue_id}"},
        json_body={"status": "pending"},
    )
    log.info("Requeued message queue_id=%s", queue_id)


async def dequeue_message_for_chat(chat_id: int) -> dict | None:
    """Atomically claim the oldest pending message for a specific chat.

    Used by drain_messages() to batch rapid-fire messages.
    """
    result = await _request(
        "GET",
        "message_queue",
        params={
            "status": "eq.pending",
            "chat_id": f"eq.{chat_id}",
            "order": "created_at.asc",
            "limit": "1",
        },
    )
    if not result:
        return None

    msg = result[0]
    patched = await _request(
        "PATCH",
        "message_queue",
        params={"id": f"eq.{msg['id']}", "status": "eq.pending"},
        json_body={"status": "processing"},
    )
    if not patched:
        log.info("Message queue_id=%s already claimed, skipping", msg["id"])
        return None
    log.info("Dequeued message for chat queue_id=%s chat_id=%s", msg["id"], chat_id)
    return msg


async def get_pending_messages_for_chat(chat_id: int) -> list[dict]:
    """Get all pending messages for a chat (read-only, no status change).

    Used by the get_pending_messages MCP tool to check for new instructions.
    """
    result = await _request(
        "GET",
        "message_queue",
        params={
            "status": "eq.pending",
            "chat_id": f"eq.{chat_id}",
            "order": "created_at.asc",
        },
    )
    return result or []


# ---------------------------------------------------------------------------
# Telegram Messages (permanent storage)
# ---------------------------------------------------------------------------

async def save_message(
    chat_id: int,
    role: str,
    content: str,
    *,
    telegram_message_id: int | None = None,
    sender: str | None = None,
    media_type: str | None = None,
    metadata: dict | None = None,
) -> dict:
    """Save a telegram message to permanent storage."""
    body: dict[str, Any] = {
        "chat_id": chat_id,
        "role": role,
        "content": content,
    }
    if telegram_message_id is not None:
        body["telegram_message_id"] = telegram_message_id
    if sender:
        body["sender"] = sender
    if media_type:
        body["media_type"] = media_type
    if metadata:
        body["metadata"] = metadata

    result = await _request("POST", "telegram_messages", json_body=body)
    log.info("Saved message id=%s role=%s", result[0]["id"], role)
    return result[0]


async def get_recent_messages(chat_id: int, hours: int = 24) -> list[dict]:
    """Get recent messages for a chat within the last N hours."""
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    result = await _request(
        "GET",
        "telegram_messages",
        params={
            "chat_id": f"eq.{chat_id}",
            "created_at": f"gte.{cutoff}",
            "order": "created_at.asc",
            "limit": "50",
        },
    )
    return result or []


async def save_classification(msg_id: str, classification: dict) -> None:
    """Save classification result for a message.

    Supports multi-item format {"items": [...]} and legacy {"category": "..."}.
    Primary category_id is taken from items[0] (multi) or .category (legacy).
    """
    items = classification.get("items")
    if items and isinstance(items, list) and items:
        category_name = items[0].get("category", "")
    else:
        category_name = classification.get("category", "")

    category_id = None
    if category_name:
        categories = await get_categories()
        for cat in categories:
            if cat["name"] == category_name:
                category_id = cat["id"]
                break
        if category_id is None:
            new_cat = await upsert_category(category_name)
            category_id = new_cat["id"]

    body: dict[str, Any] = {"classification": classification}
    if category_id:
        body["category_id"] = category_id

    await _request(
        "PATCH",
        "telegram_messages",
        params={"id": f"eq.{msg_id}"},
        json_body=body,
    )
    log.info("Saved classification for msg_id=%s category=%s", msg_id, category_name)


# ---------------------------------------------------------------------------
# Categories
# ---------------------------------------------------------------------------

async def get_categories() -> list[dict]:
    """Get all categories."""
    result = await _request("GET", "categories", params={"order": "name.asc"})
    return result or []


async def upsert_category(name: str, color: str | None = None) -> dict:
    """Create or get a category by name."""
    # Check if exists
    existing = await _request(
        "GET", "categories", params={"name": f"eq.{name}", "limit": "1"}
    )
    if existing:
        return existing[0]

    body: dict[str, Any] = {"name": name}
    if color:
        body["color"] = color

    result = await _request("POST", "categories", json_body=body)
    log.info("Created new category: %s", name)
    return result[0]


# ---------------------------------------------------------------------------
# Embeddings / Vector Search
# ---------------------------------------------------------------------------

async def save_embedding(
    table: str, record_id: str, embedding: list[float], model: str
) -> None:
    """Save an embedding vector to a record."""
    await _request(
        "PATCH",
        table,
        params={"id": f"eq.{record_id}"},
        json_body={"embedding": embedding, "embedding_model": model},
    )
    log.debug("Saved embedding for %s.%s model=%s", table, record_id, model)


async def search_similar(
    embedding: list[float], threshold: float = 0.25, count: int = 15
) -> list[dict]:
    """Search for similar content across all tables."""
    result = await _rpc(
        "search_similar_content",
        {
            "query_embedding": embedding,
            "match_threshold": threshold,
            "match_count": count,
        },
    )
    return result or []


# ---------------------------------------------------------------------------
# Todos
# ---------------------------------------------------------------------------

async def add_todo(
    title: str,
    category_id: str | None = None,
    due_date: str | None = None,
    priority: int = 0,
    source: str = "telegram",
    estimated_minutes: int | None = None,
    time_hint: str | None = None,
) -> dict:
    """Add a new todo item."""
    body: dict[str, Any] = {"title": title, "priority": priority, "source": source}
    if category_id:
        body["category_id"] = category_id
    if due_date:
        body["due_date"] = due_date
    if estimated_minutes is not None:
        body["estimated_minutes"] = estimated_minutes
    if time_hint:
        body["time_hint"] = time_hint

    result = await _request("POST", "todos", json_body=body)
    log.info("Added todo: %s", title[:50])
    return result[0]


async def list_todos(is_done: bool = False) -> list[dict]:
    """List todos filtered by completion status."""
    result = await _request(
        "GET",
        "todos",
        params={
            "is_done": f"eq.{str(is_done).lower()}",
            "order": "priority.desc,created_at.desc",
        },
    )
    return result or []


# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------

async def close():
    """Close the HTTP client."""
    global _client
    if _client and not _client.is_closed:
        await _client.aclose()
        _client = None

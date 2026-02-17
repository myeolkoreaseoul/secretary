"""Backfill embeddings for existing thoughts table.

One-time script. Queries thoughts where embedding IS NULL,
generates Gemini embeddings, and updates the DB.

Usage:
    cd ~/projects/secretary
    python -m scripts.backfill_embeddings
"""

import asyncio
import logging
import sys
from pathlib import Path

# Add project root to path so we can import bot modules
sys.path.insert(0, str(Path(__file__).parent.parent))

from bot.config import SUPABASE_REST_URL, SUPABASE_HEADERS, GEMINI_API_KEY
from bot.embedding import generate_embedding, get_model_name

import httpx

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("backfill")

BATCH_SIZE = 50
DELAY_MS = 200  # ms between API calls to respect rate limits


async def fetch_thoughts_without_embedding(client: httpx.AsyncClient) -> list[dict]:
    """Fetch thoughts where embedding is NULL."""
    resp = await client.get(
        f"{SUPABASE_REST_URL}/thoughts",
        headers=SUPABASE_HEADERS,
        params={
            "select": "id,raw_input,title,summary,advice",
            "embedding": "is.null",
            "order": "created_at.asc",
            "limit": str(BATCH_SIZE),
        },
    )
    resp.raise_for_status()
    return resp.json()


async def update_embedding(
    client: httpx.AsyncClient, table: str, record_id: str, embedding: list[float]
) -> bool:
    """Update a record's embedding in Supabase."""
    resp = await client.patch(
        f"{SUPABASE_REST_URL}/{table}",
        headers=SUPABASE_HEADERS,
        params={"id": f"eq.{record_id}"},
        json={
            "embedding": embedding,
            "embedding_model": get_model_name(),
        },
    )
    return resp.status_code < 300


async def backfill_table(table: str, text_field: str, build_text) -> int:
    """Backfill embeddings for a given table.

    Args:
        table: Table name (e.g. 'thoughts')
        text_field: Not used directly, kept for clarity
        build_text: Function that takes a record dict and returns text to embed

    Returns:
        Number of records updated
    """
    total = 0
    async with httpx.AsyncClient(timeout=30.0) as client:
        while True:
            # Fetch batch
            resp = await client.get(
                f"{SUPABASE_REST_URL}/{table}",
                headers=SUPABASE_HEADERS,
                params={
                    "select": "id,raw_input,title,summary,advice",
                    "embedding": "is.null",
                    "order": "created_at.asc",
                    "limit": str(BATCH_SIZE),
                },
            )
            resp.raise_for_status()
            records = resp.json()

            if not records:
                break

            log.info("Processing batch of %d records from %s...", len(records), table)

            for record in records:
                text = build_text(record)
                if not text or not text.strip():
                    log.warning("Skipping %s %s — empty text", table, record["id"])
                    continue

                embedding = await generate_embedding(text)
                if embedding is None:
                    log.warning("Failed to generate embedding for %s %s", table, record["id"])
                    continue

                success = await update_embedding(client, table, record["id"], embedding)
                if success:
                    total += 1
                    log.info("Updated %s %s (%d total)", table, record["id"][:8], total)
                else:
                    log.error("Failed to update %s %s", table, record["id"][:8])

                # Rate limit delay
                await asyncio.sleep(DELAY_MS / 1000.0)

    return total


def build_thought_text(record: dict) -> str:
    """Build embedding text from a thought record."""
    parts = []
    if record.get("raw_input"):
        parts.append(record["raw_input"])
    if record.get("title"):
        parts.append(record["title"])
    if record.get("summary"):
        parts.append(record["summary"])
    if record.get("advice"):
        parts.append(record["advice"])
    return " ".join(parts)


async def main():
    if not GEMINI_API_KEY:
        log.error("GEMINI_API_KEY not set. Configure bot/.env first.")
        sys.exit(1)

    log.info("Starting embedding backfill...")

    # Backfill thoughts
    count = await backfill_table("thoughts", "raw_input", build_thought_text)
    log.info("Backfill complete. Updated %d thought records.", count)


if __name__ == "__main__":
    asyncio.run(main())

"""Embedding generation — Gemini gemini-embedding-001.

Single model policy: no fallback to different models.
On failure: retry 3x with exponential backoff (5xx/429 only), then return None.
"""

import asyncio
import logging

import httpx

from bot.config import GEMINI_API_KEY

log = logging.getLogger("secretary.embedding")

MODEL = "gemini-embedding-001"
MODEL_NAME = f"gemini/{MODEL}"
DIMENSION = 768
OUTPUT_DIMENSIONALITY = 768  # request 768-dim output from 3072-dim model
MAX_CHARS = 2000
MAX_RETRIES = 3
BASE_DELAY = 1.0  # seconds

_ENDPOINT = (
    f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:embedContent"
)

# Reuse a single client for connection pooling
_client: httpx.AsyncClient | None = None


def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(timeout=15.0)
    return _client


def _is_retriable(status_code: int) -> bool:
    """Only retry on server errors and rate limits."""
    return status_code >= 500 or status_code == 429


async def generate_embedding(text: str) -> list[float] | None:
    """Generate a 768-dim embedding vector for the given text.

    Returns None if all retries fail. Caller should save with embedding=NULL.
    """
    if not text or not text.strip():
        return None

    # Truncate to MAX_CHARS
    truncated = text[:MAX_CHARS]
    client = _get_client()

    for attempt in range(MAX_RETRIES):
        try:
            resp = await client.post(
                _ENDPOINT,
                params={"key": GEMINI_API_KEY},
                json={
                    "model": f"models/{MODEL}",
                    "content": {"parts": [{"text": truncated}]},
                    "outputDimensionality": OUTPUT_DIMENSIONALITY,
                },
            )
            resp.raise_for_status()
            data = resp.json()
            values = data["embedding"]["values"]

            if len(values) != DIMENSION:
                log.error(
                    "Unexpected embedding dimension: %d (expected %d)",
                    len(values),
                    DIMENSION,
                )
                return None

            return values

        except httpx.HTTPStatusError as e:
            if not _is_retriable(e.response.status_code):
                log.error(
                    "Embedding API non-retriable error %d — giving up",
                    e.response.status_code,
                )
                return None
            delay = BASE_DELAY * (2**attempt)
            log.warning(
                "Embedding API error (attempt %d/%d): %s — retrying in %.1fs",
                attempt + 1,
                MAX_RETRIES,
                e.response.status_code,
                delay,
            )
            await asyncio.sleep(delay)

        except Exception as e:
            delay = BASE_DELAY * (2**attempt)
            log.warning(
                "Embedding error (attempt %d/%d): %s — retrying in %.1fs",
                attempt + 1,
                MAX_RETRIES,
                str(e)[:100],
                delay,
            )
            await asyncio.sleep(delay)

    log.error("Embedding failed after %d retries — returning None", MAX_RETRIES)
    return None


async def close():
    """Close the embedding HTTP client."""
    global _client
    if _client and not _client.is_closed:
        await _client.aclose()
        _client = None


def get_model_name() -> str:
    """Return the model identifier for metadata storage."""
    return MODEL_NAME

"""Telegram message sending utilities."""

import logging
from pathlib import Path

import httpx

from bot.config import TELEGRAM_BOT_TOKEN

log = logging.getLogger("secretary.telegram")

_BASE_URL = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}"
MAX_MESSAGE_LENGTH = 4096


def _mask_token(text: str) -> str:
    """Mask bot token in error messages."""
    if TELEGRAM_BOT_TOKEN and TELEGRAM_BOT_TOKEN in str(text):
        return str(text).replace(TELEGRAM_BOT_TOKEN, "***TOKEN***")
    return str(text)


async def send_message(chat_id: int, text: str) -> bool:
    """Send a text message, auto-splitting if > 4096 chars."""
    if not text:
        return False

    chunks = _split_message(text)
    success = True

    async with httpx.AsyncClient(timeout=30.0) as client:
        for chunk in chunks:
            try:
                resp = await client.post(
                    f"{_BASE_URL}/sendMessage",
                    json={
                        "chat_id": chat_id,
                        "text": chunk,
                        "parse_mode": "Markdown",
                    },
                )
                if resp.status_code != 200:
                    # Retry without Markdown parse mode
                    resp = await client.post(
                        f"{_BASE_URL}/sendMessage",
                        json={"chat_id": chat_id, "text": chunk},
                    )
                resp.raise_for_status()
            except Exception as e:
                log.error("Failed to send message to chat_id=%s: %s", chat_id, _mask_token(str(e)))
                success = False

    return success


async def send_file(chat_id: int, file_path: str) -> bool:
    """Send a file to a chat."""
    path = Path(file_path)
    if not path.exists():
        log.error("File not found: %s", file_path)
        return False

    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            with open(path, "rb") as f:
                resp = await client.post(
                    f"{_BASE_URL}/sendDocument",
                    data={"chat_id": chat_id},
                    files={"document": (path.name, f)},
                )
            resp.raise_for_status()
            return True
        except Exception as e:
            log.error("Failed to send file to chat_id=%s: %s", chat_id, _mask_token(str(e)))
            return False


async def send_typing_action(chat_id: int) -> None:
    """Send a 'typing...' indicator."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            await client.post(
                f"{_BASE_URL}/sendChatAction",
                json={"chat_id": chat_id, "action": "typing"},
            )
        except Exception:
            pass  # Non-critical


def _split_message(text: str) -> list[str]:
    """Split text into chunks of MAX_MESSAGE_LENGTH, preferring line breaks."""
    if len(text) <= MAX_MESSAGE_LENGTH:
        return [text]

    chunks = []
    remaining = text

    while remaining:
        if len(remaining) <= MAX_MESSAGE_LENGTH:
            chunks.append(remaining)
            break

        # Find a good split point
        split_at = MAX_MESSAGE_LENGTH
        newline_pos = remaining.rfind("\n", 0, MAX_MESSAGE_LENGTH)
        if newline_pos > MAX_MESSAGE_LENGTH // 2:
            split_at = newline_pos + 1
        else:
            space_pos = remaining.rfind(" ", 0, MAX_MESSAGE_LENGTH)
            if space_pos > MAX_MESSAGE_LENGTH // 2:
                split_at = space_pos + 1

        chunks.append(remaining[:split_at])
        remaining = remaining[split_at:]

    return chunks

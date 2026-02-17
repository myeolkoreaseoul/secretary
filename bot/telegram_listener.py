"""Telegram polling listener — receives messages and writes to DB queue.

Runs as a long-lived process (systemd service).
Uses python-telegram-bot async handlers.
"""

import asyncio
import logging

from telegram import Update
from telegram.ext import (
    Application,
    CommandHandler,
    MessageHandler,
    ContextTypes,
    filters,
)

from bot.config import (
    TELEGRAM_BOT_TOKEN,
    TELEGRAM_ALLOWED_USERS,
    require_env,
)
from bot import supabase_client as db
from bot import telegram_sender as tg

log = logging.getLogger("secretary.listener")


# ---------------------------------------------------------------------------
# Handlers
# ---------------------------------------------------------------------------

async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle incoming text messages."""
    if not _is_allowed(update):
        log.warning(
            "Rejected message from unauthorized user_id=%s chat_id=%s",
            update.effective_user.id if update.effective_user else "?",
            update.effective_chat.id if update.effective_chat else "?",
        )
        return

    message = update.effective_message
    if not message or not message.text:
        return

    chat_id = message.chat_id
    user = update.effective_user

    try:
        await db.enqueue_message(
            chat_id=chat_id,
            content=message.text,
            telegram_message_id=message.message_id,
            sender=user.full_name if user else None,
            metadata={
                "user_id": user.id if user else None,
                "username": user.username if user else None,
            },
        )
        log.info(
            "Queued text message from %s (chat_id=%s, msg_id=%s)",
            user.full_name if user else "unknown",
            chat_id,
            message.message_id,
        )
    except Exception as e:
        log.error("Failed to enqueue message: %s", e, exc_info=True)
        await tg.send_message(chat_id, "⚠️ 메시지 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.")


async def handle_photo(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle photo messages."""
    if not _is_allowed(update):
        return

    message = update.effective_message
    if not message:
        return

    chat_id = message.chat_id
    user = update.effective_user
    caption = message.caption or "(사진)"

    try:
        await db.enqueue_message(
            chat_id=chat_id,
            content=caption,
            telegram_message_id=message.message_id,
            sender=user.full_name if user else None,
            media_type="photo",
            metadata={
                "user_id": user.id if user else None,
                "photo_file_id": message.photo[-1].file_id if message.photo else None,
            },
        )
        log.info("Queued photo message from %s", user.full_name if user else "unknown")
    except Exception as e:
        log.error("Failed to enqueue photo: %s", e, exc_info=True)


async def handle_document(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle document messages."""
    if not _is_allowed(update):
        return

    message = update.effective_message
    if not message or not message.document:
        return

    chat_id = message.chat_id
    user = update.effective_user
    caption = message.caption or f"(파일: {message.document.file_name or 'unknown'})"

    try:
        await db.enqueue_message(
            chat_id=chat_id,
            content=caption,
            telegram_message_id=message.message_id,
            sender=user.full_name if user else None,
            media_type="document",
            metadata={
                "user_id": user.id if user else None,
                "file_id": message.document.file_id,
                "file_name": message.document.file_name,
            },
        )
        log.info("Queued document from %s", user.full_name if user else "unknown")
    except Exception as e:
        log.error("Failed to enqueue document: %s", e, exc_info=True)


async def handle_location(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle location messages."""
    if not _is_allowed(update):
        return

    message = update.effective_message
    if not message or not message.location:
        return

    chat_id = message.chat_id
    user = update.effective_user
    loc = message.location

    try:
        await db.enqueue_message(
            chat_id=chat_id,
            content=f"(위치: {loc.latitude}, {loc.longitude})",
            telegram_message_id=message.message_id,
            sender=user.full_name if user else None,
            media_type="location",
            metadata={
                "user_id": user.id if user else None,
                "latitude": loc.latitude,
                "longitude": loc.longitude,
            },
        )
    except Exception as e:
        log.error("Failed to enqueue location: %s", e, exc_info=True)


async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle /start command."""
    if not _is_allowed(update):
        return
    chat_id = update.effective_chat.id if update.effective_chat else 0
    await tg.send_message(chat_id, "안녕하세요! AI 비서입니다. 무엇이든 말씀해주세요.")


async def cmd_status(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle /status command — quick health check."""
    if not _is_allowed(update):
        return
    chat_id = update.effective_chat.id if update.effective_chat else 0
    await tg.send_message(chat_id, "✅ 봇이 정상 작동 중입니다.")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _is_allowed(update: Update) -> bool:
    """Check if the user is in the whitelist (by immutable user_id)."""
    if not TELEGRAM_ALLOWED_USERS:
        return False
    user = update.effective_user
    if not user:
        return False
    return user.id in TELEGRAM_ALLOWED_USERS


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    require_env()
    log.info("Starting Telegram listener...")
    log.info("Allowed users: %s", TELEGRAM_ALLOWED_USERS)

    app = Application.builder().token(TELEGRAM_BOT_TOKEN).build()

    # Command handlers
    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("status", cmd_status))

    # Message handlers
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
    app.add_handler(MessageHandler(filters.PHOTO, handle_photo))
    app.add_handler(MessageHandler(filters.Document.ALL, handle_document))
    app.add_handler(MessageHandler(filters.LOCATION, handle_location))

    log.info("Polling started.")
    app.run_polling(
        poll_interval=2.0,
        timeout=30,
        drop_pending_updates=True,
    )


if __name__ == "__main__":
    main()

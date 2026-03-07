"""Central configuration — all other modules import from here."""

import os
import sys
import logging
from pathlib import Path
from dotenv import load_dotenv

# Load .env from bot directory
BOT_DIR = Path(__file__).parent
load_dotenv(BOT_DIR / ".env")

# --- Required ---
TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
YOUTUBE_API_KEY = os.environ.get("YOUTUBE_API_KEY", "")

# --- Optional ---
def _parse_allowed_users() -> list[int]:
    raw = os.environ.get("TELEGRAM_ALLOWED_USERS", "")
    users = []
    for uid in raw.split(","):
        uid = uid.strip()
        if uid:
            try:
                users.append(int(uid))
            except ValueError:
                logging.getLogger("secretary").warning("Invalid user ID in TELEGRAM_ALLOWED_USERS: %s", uid)
    return users

TELEGRAM_ALLOWED_USERS: list[int] = _parse_allowed_users()
LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO").upper()

# --- Derived ---
SUPABASE_REST_URL = f"{SUPABASE_URL}/rest/v1"
SUPABASE_HEADERS = {
    "apikey": SUPABASE_SERVICE_KEY,
    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}

# --- Logging ---
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("secretary")


# --- Claude Model Routing ---
CLAUDE_MODEL_SIMPLE = "claude-haiku-4-5-20251001"
CLAUDE_MODEL_COMPLEX = "claude-opus-4-6"
CLAUDE_TIMEOUT_SIMPLE = 120   # 2 minutes — Haiku is fast
CLAUDE_TIMEOUT_COMPLEX = 3600  # 60 minutes — Opus for coding tasks


def require_env():
    """Validate that all required environment variables are set."""
    missing = []
    if not TELEGRAM_BOT_TOKEN:
        missing.append("TELEGRAM_BOT_TOKEN")
    if not SUPABASE_URL:
        missing.append("SUPABASE_URL")
    if not SUPABASE_SERVICE_KEY:
        missing.append("SUPABASE_SERVICE_KEY")
    if not GEMINI_API_KEY:
        missing.append("GEMINI_API_KEY")
    if missing:
        logger.error(f"Missing required environment variables: {', '.join(missing)}")
        sys.exit(1)
    if not TELEGRAM_ALLOWED_USERS:
        logger.warning("TELEGRAM_ALLOWED_USERS is empty — bot will reject all messages")

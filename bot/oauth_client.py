"""OAuth client — passive consumer of Claude CLI credentials.

Reads from ~/.claude/.credentials.json (written by Claude Code sessions).
NEVER refreshes tokens via HTTP — only reads from disk.
Claude Code sessions handle all token refresh; this client is read-only.
Uses fcntl file locking to prevent race conditions.
Uses asyncio.Lock to serialize concurrent coroutine access.
"""

import asyncio
import fcntl
import json
import logging
import time
from pathlib import Path

log = logging.getLogger("secretary.oauth")

CREDENTIALS_PATH = Path.home() / ".claude" / ".credentials.json"
EXPIRY_MARGIN = 300  # consider expired 5 minutes before actual expiry
DISK_POLL_INTERVAL = 1  # seconds between disk re-reads when waiting
DISK_POLL_MAX_WAIT = 30  # max seconds to wait for fresh token on disk
POLL_COOLDOWN = 30  # seconds to skip re-polling after a failed poll cycle


class OAuthClient:
    def __init__(self):
        self._access_token: str = ""
        self._expires_at: float = 0  # epoch seconds
        self._consecutive_failures: int = 0
        self._last_poll_failure: float = 0  # epoch time of last failed poll cycle
        self._server_rejected: bool = False  # set on 401 — disk token is valid but server rejected it
        self._lock: asyncio.Lock | None = None  # lazy init (needs running loop)
        self._load_credentials()

    def _get_lock(self) -> asyncio.Lock:
        """Lazy-init asyncio.Lock (must be created inside a running event loop)."""
        if self._lock is None:
            self._lock = asyncio.Lock()
        return self._lock

    def _load_credentials(self) -> None:
        """Load tokens from Claude CLI credentials file (with file locking).

        On JSONDecodeError, retries once after 100ms (handles partial writes).
        """
        for attempt in range(2):
            try:
                with open(CREDENTIALS_PATH, "r") as f:
                    fcntl.flock(f, fcntl.LOCK_SH)  # shared read lock
                    try:
                        data = json.load(f)
                    finally:
                        fcntl.flock(f, fcntl.LOCK_UN)

                oauth = data.get("claudeAiOauth", {})
                self._access_token = oauth.get("accessToken", "")
                # expiresAt is in milliseconds
                self._expires_at = oauth.get("expiresAt", 0) / 1000
                log.info(
                    "OAuth credentials loaded (expires_in=%.0fs, tier=%s)",
                    self._expires_at - time.time(),
                    oauth.get("rateLimitTier", "unknown"),
                )
                return
            except FileNotFoundError:
                log.error("Credentials file not found: %s", CREDENTIALS_PATH)
                return
            except (json.JSONDecodeError, KeyError) as e:
                if attempt == 0:
                    time.sleep(0.1)  # brief wait, likely mid-write
                    continue
                log.error("Failed to parse credentials after retry: %s", e)

    def _is_expired(self) -> bool:
        return time.time() >= (self._expires_at - EXPIRY_MARGIN)

    def _needs_new_token(self) -> bool:
        """Token needs replacement: expired OR server rejected it."""
        return self._is_expired() or self._server_rejected

    def mark_server_rejected(self) -> None:
        """Mark current token as rejected by server (401).

        Next get_headers() call will wait for a NEW token from disk,
        even if expiresAt hasn't passed yet.
        """
        self._server_rejected = True
        log.info("Token marked as server-rejected, will wait for new token from disk")

    def reload_from_disk(self) -> None:
        """Reload credentials from disk. Called by inotify watcher or on 401."""
        old_token = self._access_token
        self._load_credentials()
        # If we got a different token, clear server_rejected flag
        if self._access_token != old_token:
            self._server_rejected = False
            self._consecutive_failures = 0
            log.info("Got new token from disk (expires_in=%.0fs)", self._expires_at - time.time())
        elif not self._is_expired():
            self._consecutive_failures = 0

    async def _ensure_valid_token(self) -> None:
        """Wait for a valid token on disk. NEVER does HTTP refresh.

        Strategy:
        1. Token valid and not server-rejected → return immediately
        2. Re-read disk (Claude Code may have written fresh tokens)
        3. Still invalid → poll disk up to 30s (with cooldown to prevent cascading)
        4. Still invalid → increment failure counter
        """
        async with self._get_lock():
            # Re-check after acquiring lock (another coroutine may have resolved it)
            if not self._needs_new_token():
                self._consecutive_failures = 0
                return

            # Step 1: Re-read disk
            old_token = self._access_token
            self._load_credentials()
            if self._access_token != old_token:
                self._server_rejected = False  # new token from disk
            if not self._needs_new_token():
                log.info("Recovered valid token from disk (expires_in=%.0fs)", self._expires_at - time.time())
                self._consecutive_failures = 0
                return

            # Step 2: Check cooldown — don't re-poll if we just failed recently
            now = time.time()
            if now - self._last_poll_failure < POLL_COOLDOWN:
                self._consecutive_failures += 1
                log.warning(
                    "Skipping poll (cooldown, last failure %.0fs ago, consecutive_failures=%d)",
                    now - self._last_poll_failure,
                    self._consecutive_failures,
                )
                return

            # Step 3: Poll disk — Claude Code sessions refresh tokens continuously
            log.info("Waiting for Claude Code to provide valid token (max %ds)...", DISK_POLL_MAX_WAIT)
            for i in range(DISK_POLL_MAX_WAIT):
                await asyncio.sleep(DISK_POLL_INTERVAL)
                old_token = self._access_token
                self._load_credentials()
                if self._access_token != old_token:
                    self._server_rejected = False
                if not self._needs_new_token():
                    log.info("Got valid token from disk after %ds (expires_in=%.0fs)", i + 1, self._expires_at - time.time())
                    self._consecutive_failures = 0
                    return

            # Step 4: No valid token after waiting
            self._last_poll_failure = time.time()
            self._consecutive_failures += 1
            log.warning(
                "No valid token after %ds wait (consecutive_failures=%d). "
                "Ensure at least one Claude Code session is running.",
                DISK_POLL_MAX_WAIT,
                self._consecutive_failures,
            )

    @property
    def is_healthy(self) -> bool:
        """Check if OAuth client has a usable token."""
        return (
            bool(self._access_token)
            and not self._needs_new_token()
            and self._consecutive_failures < 5
        )

    async def get_headers(self) -> dict[str, str]:
        """Return authorization headers, waiting for valid token if needed."""
        await self._ensure_valid_token()
        return {
            "x-api-key": self._access_token,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        }


# Module-level singleton
oauth = OAuthClient()

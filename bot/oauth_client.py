"""OAuth client — reads Claude CLI credentials and provides auth headers.

Reads from ~/.claude/.credentials.json (written by `claude login`).
Auto-refreshes access token when expired.
Falls back to re-reading disk if refresh fails (e.g., Claude CLI refreshed it).
Uses fcntl file locking to prevent race conditions with Claude CLI.
Uses asyncio.Lock to serialize concurrent coroutine access.
"""

import asyncio
import fcntl
import json
import logging
import time
from pathlib import Path

import httpx

log = logging.getLogger("secretary.oauth")

CREDENTIALS_PATH = Path.home() / ".claude" / ".credentials.json"
REFRESH_URL = "https://platform.claude.com/v1/oauth/token"
REFRESH_MARGIN = 300  # refresh 5 minutes before expiry


class OAuthClient:
    def __init__(self):
        self._access_token: str = ""
        self._refresh_token: str = ""
        self._expires_at: float = 0  # epoch seconds
        self._consecutive_failures: int = 0
        self._lock: asyncio.Lock | None = None  # lazy init (needs running loop)
        self._load_credentials()

    def _get_lock(self) -> asyncio.Lock:
        """Lazy-init asyncio.Lock (must be created inside a running event loop)."""
        if self._lock is None:
            self._lock = asyncio.Lock()
        return self._lock

    def _load_credentials(self) -> None:
        """Load tokens from Claude CLI credentials file (with file locking)."""
        try:
            with open(CREDENTIALS_PATH, "r") as f:
                fcntl.flock(f, fcntl.LOCK_SH)  # shared read lock
                try:
                    data = json.load(f)
                finally:
                    fcntl.flock(f, fcntl.LOCK_UN)

            oauth = data.get("claudeAiOauth", {})
            self._access_token = oauth.get("accessToken", "")
            self._refresh_token = oauth.get("refreshToken", "")
            # expiresAt is in milliseconds
            self._expires_at = oauth.get("expiresAt", 0) / 1000
            log.info(
                "OAuth credentials loaded (expires_in=%.0fs, tier=%s)",
                self._expires_at - time.time(),
                oauth.get("rateLimitTier", "unknown"),
            )
        except FileNotFoundError:
            log.error("Credentials file not found: %s", CREDENTIALS_PATH)
        except (json.JSONDecodeError, KeyError) as e:
            log.error("Failed to parse credentials: %s", e)

    def _is_expired(self) -> bool:
        return time.time() >= (self._expires_at - REFRESH_MARGIN)

    async def _refresh_if_needed(self) -> None:
        """Refresh access token if expired or about to expire.

        Serialized via asyncio.Lock to prevent concurrent refresh races.
        Strategy:
        1. Try HTTP refresh with current refresh_token
        2. On failure, re-read credentials from disk (Claude CLI may have refreshed)
        3. If disk token is valid (non-expired), use it without HTTP refresh
        """
        async with self._get_lock():
            # Re-check after acquiring lock (another coroutine may have refreshed)
            if not self._is_expired():
                self._consecutive_failures = 0
                return

            # Step 1: Try HTTP refresh
            if self._refresh_token:
                log.info("Refreshing OAuth token...")
                try:
                    async with httpx.AsyncClient(timeout=10) as client:
                        resp = await client.post(
                            REFRESH_URL,
                            json={
                                "grant_type": "refresh_token",
                                "refresh_token": self._refresh_token,
                            },
                        )
                        resp.raise_for_status()
                        data = resp.json()

                    self._access_token = data["access_token"]
                    self._refresh_token = data.get("refresh_token", self._refresh_token)
                    self._expires_at = time.time() + data.get("expires_in", 3600)
                    self._consecutive_failures = 0

                    self._save_credentials()
                    log.info("OAuth token refreshed (expires_in=%ds)", data.get("expires_in", 0))
                    return

                except Exception as e:
                    log.warning("Token refresh failed: %s — falling back to disk re-read", e)

            # Step 2: Re-read from disk (Claude CLI or another process may have refreshed)
            old_expires = self._expires_at
            self._load_credentials()

            # US-005 fix: check non-expired after reload (not token string comparison)
            if not self._is_expired():
                log.info("Recovered valid token from disk (expires_in=%.0fs)", self._expires_at - time.time())
                self._consecutive_failures = 0
            else:
                self._consecutive_failures += 1
                log.warning(
                    "No valid token available (consecutive_failures=%d)",
                    self._consecutive_failures,
                )

    def _save_credentials(self) -> None:
        """Write refreshed tokens back to credentials file (with file locking)."""
        try:
            with open(CREDENTIALS_PATH, "r+") as f:
                fcntl.flock(f, fcntl.LOCK_EX)  # exclusive write lock
                try:
                    data = json.load(f)
                    data["claudeAiOauth"]["accessToken"] = self._access_token
                    data["claudeAiOauth"]["refreshToken"] = self._refresh_token
                    data["claudeAiOauth"]["expiresAt"] = int(self._expires_at * 1000)
                    f.seek(0)
                    f.truncate()
                    json.dump(data, f, indent=2)
                finally:
                    fcntl.flock(f, fcntl.LOCK_UN)
        except Exception as e:
            log.warning("Failed to save refreshed credentials: %s", e)

    @property
    def is_healthy(self) -> bool:
        """Check if OAuth client has a usable token.

        US-009 fix: also checks expiry, not just token existence.
        """
        return (
            bool(self._access_token)
            and self._consecutive_failures < 5
            and (not self._is_expired() or bool(self._refresh_token))
        )

    async def get_headers(self) -> dict[str, str]:
        """Return authorization headers, refreshing token if needed."""
        await self._refresh_if_needed()
        return {
            "x-api-key": self._access_token,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        }


# Module-level singleton
oauth = OAuthClient()

"""OAuth client — reads Claude CLI credentials and provides auth headers.

Reads from ~/.claude/.credentials.json (written by `claude login`).
Auto-refreshes access token when expired.
"""

import json
import logging
import time
from pathlib import Path

import httpx

log = logging.getLogger("secretary.oauth")

CREDENTIALS_PATH = Path.home() / ".claude" / ".credentials.json"
REFRESH_URL = "https://platform.claude.com/api/oauth/token"
REFRESH_MARGIN = 300  # refresh 5 minutes before expiry


class OAuthClient:
    def __init__(self):
        self._access_token: str = ""
        self._refresh_token: str = ""
        self._expires_at: float = 0  # epoch seconds
        self._load_credentials()

    def _load_credentials(self) -> None:
        """Load tokens from Claude CLI credentials file."""
        try:
            data = json.loads(CREDENTIALS_PATH.read_text())
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
        """Refresh access token if expired or about to expire."""
        if not self._is_expired():
            return
        if not self._refresh_token:
            log.warning("No refresh token available, using existing access token")
            return

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

            # Persist back to credentials file
            self._save_credentials()
            log.info("OAuth token refreshed (expires_in=%ds)", data.get("expires_in", 0))

        except Exception as e:
            log.warning("Token refresh failed: %s — will try existing token", e)

    def _save_credentials(self) -> None:
        """Write refreshed tokens back to credentials file."""
        try:
            data = json.loads(CREDENTIALS_PATH.read_text())
            data["claudeAiOauth"]["accessToken"] = self._access_token
            data["claudeAiOauth"]["refreshToken"] = self._refresh_token
            data["claudeAiOauth"]["expiresAt"] = int(self._expires_at * 1000)
            CREDENTIALS_PATH.write_text(json.dumps(data, indent=2))
        except Exception as e:
            log.warning("Failed to save refreshed credentials: %s", e)

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

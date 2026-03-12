"""Refresh Codex OAuth token and sync to Vercel env.

Runs via cron every 30 min. Token lifetime is ~1h,
so 30min ensures it never expires mid-request.

Usage:
    python3 -m scripts.refresh_gpt_token
    python3 -m scripts.refresh_gpt_token --dry-run
"""

import json
import logging
import subprocess
import sys
import argparse
from pathlib import Path

import httpx

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
log = logging.getLogger("refresh_gpt_token")

CODEX_AUTH_PATH = Path.home() / ".codex" / "auth.json"
TOKEN_URL = "https://auth.openai.com/oauth/token"
CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann"


def refresh_token() -> str:
    """Refresh the Codex OAuth access token."""
    data = json.loads(CODEX_AUTH_PATH.read_text())
    refresh = data["tokens"]["refresh_token"]

    resp = httpx.post(
        TOKEN_URL,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        data={
            "grant_type": "refresh_token",
            "refresh_token": refresh,
            "client_id": CLIENT_ID,
            "scope": "openid profile email offline_access api.connectors.read api.connectors.invoke",
        },
        timeout=15,
    )
    resp.raise_for_status()
    new = resp.json()

    # Update auth.json
    data["tokens"]["access_token"] = new["access_token"]
    if "refresh_token" in new:
        data["tokens"]["refresh_token"] = new["refresh_token"]
    if "id_token" in new:
        data["tokens"]["id_token"] = new["id_token"]
    CODEX_AUTH_PATH.write_text(json.dumps(data, indent=2))

    log.info("Token refreshed (expires_in=%s)", new.get("expires_in", "?"))
    return new["access_token"]


def sync_to_vercel(token: str) -> bool:
    """Update Vercel GPT_ACCESS_TOKEN env var."""
    try:
        result = subprocess.run(
            ["vercel", "env", "add", "GPT_ACCESS_TOKEN", "production", "--force"],
            input=token,
            capture_output=True, text=True, timeout=15,
            cwd=str(Path.home() / "projects" / "secretary"),
        )
        if result.returncode == 0:
            log.info("Vercel env updated")
            return True
        else:
            log.error("Vercel env update failed: %s", result.stderr[:200])
            return False
    except Exception as e:
        log.error("Vercel sync error: %s", e)
        return False


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    try:
        new_token = refresh_token()
    except Exception as e:
        log.error("Token refresh failed: %s", e)
        sys.exit(1)

    if args.dry_run:
        log.info("[DRY] Would sync token to Vercel (%s...)", new_token[:20])
        return

    sync_to_vercel(new_token)


if __name__ == "__main__":
    main()

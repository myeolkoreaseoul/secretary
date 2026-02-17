"""SSH session tracker.

Tails /var/log/auth.log and records SSH login/logout events
to the activity_logs table in Supabase.

Runs as a systemd user service.
"""

import asyncio
import logging
import re
import sys
import time
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from bot.config import SUPABASE_REST_URL, SUPABASE_HEADERS

import httpx

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
log = logging.getLogger("ssh_tracker")

# Patterns for SSH events in auth.log
LOGIN_PATTERN = re.compile(
    r"sshd\[\d+\]: Accepted (\S+) for (\S+) from ([\d.]+) port (\d+)"
)
LOGOUT_PATTERN = re.compile(
    r"sshd\[\d+\]: pam_unix\(sshd:session\): session closed for user (\S+)"
)
FAILED_PATTERN = re.compile(
    r"sshd\[\d+\]: Failed (\S+) for (?:invalid user )?(\S+) from ([\d.]+)"
)

# Rate limiting for failed attempts: max 1 log per IP per 5 minutes
FAIL_RATE_LIMIT = 300  # seconds
_fail_last_logged: dict[str, float] = defaultdict(float)


async def log_activity(client: httpx.AsyncClient, window_title: str, category: str):
    """Insert a single activity log entry."""
    try:
        resp = await client.post(
            f"{SUPABASE_REST_URL}/activity_logs",
            headers=SUPABASE_HEADERS,
            json={
                "window_title": window_title,
                "app_name": "ssh",
                "category": category,
            },
        )
        if resp.status_code < 300:
            log.info("Logged: %s", window_title)
        else:
            log.error("Failed to log: %s %s", resp.status_code, resp.text[:200])
    except Exception as e:
        log.error("Error logging activity: %s", e)


async def log_stderr(proc):
    """Log stderr from tail process."""
    while True:
        line = await proc.stderr.readline()
        if not line:
            break
        log.warning("tail stderr: %s", line.decode("utf-8", errors="replace").strip())


async def tail_auth_log():
    """Tail /var/log/auth.log and process SSH events."""
    log.info("Starting SSH tracker, tailing /var/log/auth.log")

    proc = await asyncio.create_subprocess_exec(
        "tail", "-F", "-n", "0", "/var/log/auth.log",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    # Log stderr in background
    asyncio.create_task(log_stderr(proc))

    async with httpx.AsyncClient(timeout=10.0) as client:
        while True:
            line_bytes = await proc.stdout.readline()
            if not line_bytes:
                break
            line = line_bytes.decode("utf-8", errors="replace").strip()

            # Successful login — always log
            m = LOGIN_PATTERN.search(line)
            if m:
                method, user, ip, port = m.groups()
                await log_activity(
                    client,
                    f"SSH login: {user} from {ip} ({method})",
                    "session",
                )
                continue

            # Session closed — always log
            m = LOGOUT_PATTERN.search(line)
            if m:
                user = m.group(1)
                await log_activity(
                    client,
                    f"SSH logout: {user}",
                    "session",
                )
                continue

            # Failed attempt — rate limit per IP
            m = FAILED_PATTERN.search(line)
            if m:
                method, user, ip = m.groups()
                now = time.monotonic()
                if now - _fail_last_logged[ip] >= FAIL_RATE_LIMIT:
                    _fail_last_logged[ip] = now
                    await log_activity(
                        client,
                        f"SSH failed: {user} from {ip} ({method})",
                        "security",
                    )
                else:
                    log.debug("Rate-limited failed attempt from %s", ip)
                continue


async def main():
    while True:
        try:
            await tail_auth_log()
        except Exception as e:
            log.error("Tracker crashed, restarting in 5s: %s", e)
            await asyncio.sleep(5)


if __name__ == "__main__":
    asyncio.run(main())

"""Watch ~/.claude/.credentials.json for changes and reload OAuth tokens.

Uses watchfiles (Rust-based inotify wrapper) for efficient file monitoring.
When Claude Code sessions refresh tokens, this detects the change
and updates the in-memory OAuthClient immediately.
"""

import asyncio
import logging
from pathlib import Path

from watchfiles import awatch, Change

from bot.oauth_client import CREDENTIALS_PATH

log = logging.getLogger("secretary.watcher")

RESTART_DELAY = 5  # seconds to wait before restarting watcher on error


async def watch_credentials(oauth_client) -> None:
    """Watch credentials.json for changes and reload on modification.

    Runs as a background asyncio task. Auto-restarts on errors.
    Only exits on CancelledError (shutdown).
    """
    watch_path = CREDENTIALS_PATH.parent  # watch the directory
    target_name = CREDENTIALS_PATH.name

    while True:
        try:
            log.info("Watching %s for credential changes", CREDENTIALS_PATH)
            async for changes in awatch(watch_path, recursive=False):
                for change_type, changed_path in changes:
                    if Path(changed_path).name != target_name:
                        continue
                    if change_type in (Change.modified, Change.added):
                        log.info("Credentials file changed, reloading tokens")
                        oauth_client.reload_from_disk()
        except asyncio.CancelledError:
            log.info("Credential watcher stopped")
            return
        except Exception as e:
            log.error("Credential watcher error: %s — restarting in %ds", e, RESTART_DELAY)
            await asyncio.sleep(RESTART_DELAY)

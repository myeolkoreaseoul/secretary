"""Notion sync — update project status pages in Notion."""

import json
import subprocess

from .config import SUPABASE_REST_URL, SUPABASE_HEADERS, logger


def _notion_api(method: str, endpoint: str, data: dict | None = None) -> dict | None:
    """Call Notion API via curl (avoids extra dependencies)."""
    # We'll use the Notion MCP in the frontend; this is a fallback for cron
    logger.info("Notion sync: %s %s", method, endpoint)
    # Placeholder — actual sync will be done via MCP or API
    return None


def sync_all():
    """Sync all project summaries to Notion. Runs daily."""
    import requests

    url = f"{SUPABASE_REST_URL}/overseer_project_summary?select=*"
    headers = {**SUPABASE_HEADERS}
    headers.pop("Prefer", None)

    try:
        resp = requests.get(url, headers=headers, timeout=15)
        resp.raise_for_status()
        projects = resp.json()
    except Exception as e:
        logger.error("Failed to fetch project summaries: %s", e)
        return

    for proj in projects:
        if not proj.get("notion_id"):
            continue
        logger.info("Syncing %s to Notion page %s", proj["name"], proj["notion_id"])
        # TODO: Implement Notion page update with project summary
        # Will use mcp__notion__API-patch-page or direct API

    logger.info("Notion sync complete: %d projects", len(projects))


if __name__ == "__main__":
    sync_all()

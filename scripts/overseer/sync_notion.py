"""Notion sync — update project status pages in Notion."""

import os
import requests as http_requests
from datetime import datetime, timezone

from .config import SUPABASE_REST_URL, SUPABASE_HEADERS, logger

# Load from bot/.env (already loaded by config.py chain)
NOTION_TOKEN = os.environ.get("NOTION_TOKEN", "")
NOTION_API = "https://api.notion.com/v1"
NOTION_HEADERS = {
    "Authorization": f"Bearer {NOTION_TOKEN}",
    "Content-Type": "application/json",
    "Notion-Version": "2022-06-28",
}


def _notion_patch_blocks(page_id: str, blocks: list[dict]) -> bool:
    """Replace page content by deleting existing blocks and appending new ones."""
    if not NOTION_TOKEN:
        logger.warning("NOTION_TOKEN not set, skipping sync")
        return False

    # 1. Get existing blocks
    try:
        resp = http_requests.get(
            f"{NOTION_API}/blocks/{page_id}/children?page_size=100",
            headers=NOTION_HEADERS, timeout=10,
        )
        resp.raise_for_status()
        existing = resp.json().get("results", [])
    except Exception as e:
        logger.error("Failed to get blocks for %s: %s", page_id, e)
        return False

    # 2. Delete existing blocks
    for block in existing:
        try:
            http_requests.delete(
                f"{NOTION_API}/blocks/{block['id']}",
                headers=NOTION_HEADERS, timeout=10,
            )
        except Exception:
            pass

    # 3. Append new blocks
    try:
        resp = http_requests.patch(
            f"{NOTION_API}/blocks/{page_id}/children",
            headers=NOTION_HEADERS, timeout=15,
            json={"children": blocks},
        )
        resp.raise_for_status()
        return True
    except Exception as e:
        logger.error("Failed to append blocks to %s: %s", page_id, e)
        return False


def _build_status_text(proj: dict) -> str:
    """Build a human-readable status string."""
    parts = []

    # Status
    status_map = {"active": "활성", "paused": "일시정지", "archived": "보관"}
    parts.append(f"상태: {status_map.get(proj.get('status', ''), proj.get('status', ''))}")

    # Git
    if proj.get("git_branch"):
        git_info = f"Git: {proj['git_branch']}"
        if proj.get("git_unpushed"):
            git_info += f" | ↑{proj['git_unpushed']} 미푸시"
        if proj.get("git_uncommitted"):
            git_info += f" | ~{proj['git_uncommitted']} 변경"
        parts.append(git_info)

    # FS
    if proj.get("total_size_mb"):
        size = proj["total_size_mb"]
        fs_info = f"용량: {size:.0f} MB"
        if proj.get("junk_mb") and proj["junk_mb"] > 10:
            fs_info += f" (쓰레기 {proj['junk_mb']:.0f} MB)"
        parts.append(fs_info)

    # Service
    if proj.get("port"):
        svc = f"포트: {proj['port']}"
        svc += " (열림)" if proj.get("port_open") else " (닫힘)"
        parts.append(svc)

    return "\n".join(parts)


def _make_blocks(proj: dict) -> list[dict]:
    """Build Notion blocks for a project summary."""
    status_text = _build_status_text(proj)
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    blocks = [
        {
            "type": "paragraph",
            "paragraph": {
                "rich_text": [{"type": "text", "text": {"content": f"자동 업데이트: {now}"}}],
            },
        },
        {
            "type": "paragraph",
            "paragraph": {
                "rich_text": [{"type": "text", "text": {"content": status_text}}],
            },
        },
    ]

    # Warnings
    warnings = []
    if (proj.get("git_unpushed") or 0) >= 10:
        warnings.append(f"미푸시 {proj['git_unpushed']}개")
    if (proj.get("git_uncommitted") or 0) >= 20:
        warnings.append(f"미커밋 {proj['git_uncommitted']}개")
    if (proj.get("junk_mb") or 0) >= 100:
        warnings.append(f"쓰레기 {proj['junk_mb']:.0f} MB")
    if (proj.get("total_size_mb") or 0) >= 5120:
        warnings.append(f"프로젝트 {proj['total_size_mb']/1024:.1f} GB")

    if warnings:
        blocks.append({
            "type": "paragraph",
            "paragraph": {
                "rich_text": [{"type": "text", "text": {"content": f"경고: {', '.join(warnings)}"}}],
            },
        })

    return blocks


def sync_all():
    """Sync all project summaries to Notion. Runs daily."""
    if not NOTION_TOKEN:
        logger.error("NOTION_TOKEN not set, cannot sync to Notion")
        return

    url = f"{SUPABASE_REST_URL}/overseer_project_summary?select=*"
    headers = {**SUPABASE_HEADERS}
    headers.pop("Prefer", None)

    try:
        resp = http_requests.get(url, headers=headers, timeout=15)
        resp.raise_for_status()
        projects = resp.json()
    except Exception as e:
        logger.error("Failed to fetch project summaries: %s", e)
        return

    synced = 0
    for proj in projects:
        notion_id = proj.get("notion_id")
        if not notion_id:
            continue

        blocks = _make_blocks(proj)
        if _notion_patch_blocks(notion_id, blocks):
            synced += 1
            logger.info("Synced %s to Notion", proj["name"])
        else:
            logger.warning("Failed to sync %s", proj["name"])

    logger.info("Notion sync complete: %d/%d projects", synced, len(projects))


if __name__ == "__main__":
    sync_all()

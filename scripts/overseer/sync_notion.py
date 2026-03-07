"""Notion sync — 각 프로젝트 Notion 페이지에 overseer 상태 블록 동기화."""

import os
import requests as http_requests
from datetime import datetime, timezone

from .config import SUPABASE_REST_URL, SUPABASE_HEADERS, NOTION_TREE, flatten_projects, logger

NOTION_TOKEN = os.environ.get("NOTION_TOKEN", "")
NOTION_API = "https://api.notion.com/v1"
NOTION_HEADERS = {
    "Authorization": f"Bearer {NOTION_TOKEN}",
    "Content-Type": "application/json",
    "Notion-Version": "2022-06-28",
}

OVERSEER_MARKER = "── overseer-status ──"


def _get_blocks(page_id: str) -> list[dict]:
    """Notion 페이지의 기존 블록 목록을 가져옵니다."""
    try:
        resp = http_requests.get(
            f"{NOTION_API}/blocks/{page_id}/children?page_size=100",
            headers=NOTION_HEADERS, timeout=10,
        )
        resp.raise_for_status()
        return resp.json().get("results", [])
    except Exception as e:
        logger.error("Failed to get blocks for %s: %s", page_id, e)
        return []


def _delete_block(block_id: str):
    try:
        http_requests.delete(
            f"{NOTION_API}/blocks/{block_id}",
            headers=NOTION_HEADERS, timeout=10,
        )
    except Exception:
        pass


def _append_blocks(page_id: str, blocks: list[dict]) -> bool:
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


def _text_block(content: str) -> dict:
    return {
        "type": "paragraph",
        "paragraph": {
            "rich_text": [{"type": "text", "text": {"content": content}}],
        },
    }


def _divider() -> dict:
    return {"type": "divider", "divider": {}}


def _build_status_blocks(proj: dict) -> list[dict]:
    """프로젝트 상태를 Notion 블록으로 생성."""
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    blocks = [
        _divider(),
        _text_block(OVERSEER_MARKER),
    ]

    # 상태 요약
    status_map = {"active": "활성", "paused": "일시정지", "archived": "보관"}
    status = status_map.get(proj.get("status", ""), proj.get("status", ""))
    lines = [f"상태: {status}  |  마지막 동기화: {now}"]

    # Git
    if proj.get("git_branch"):
        git_line = f"Git: {proj['git_branch']}"
        if proj.get("git_commit"):
            git_line += f" ({proj['git_commit'][:7]})"
        if proj.get("git_unpushed"):
            git_line += f"  |  ↑{proj['git_unpushed']} 미푸시"
        if proj.get("git_uncommitted"):
            git_line += f"  |  ~{proj['git_uncommitted']} 변경"
        if proj.get("git_untracked"):
            git_line += f"  |  ?{proj['git_untracked']} 미추적"
        lines.append(git_line)

    # FS
    if proj.get("total_size_mb"):
        size = proj["total_size_mb"]
        fs_line = f"용량: {size:.0f} MB"
        if proj.get("junk_mb") and proj["junk_mb"] > 1:
            fs_line += f"  |  캐시: {proj['junk_mb']:.0f} MB"
        if proj.get("file_count"):
            fs_line += f"  |  {proj['file_count']} 파일"
        lines.append(fs_line)

    # Service
    if proj.get("port"):
        svc_line = f"포트: {proj['port']}"
        svc_line += " (열림)" if proj.get("port_open") else " (닫힘)"
        if proj.get("pm2_name"):
            svc_line += f"  |  pm2: {proj['pm2_name']}"
        lines.append(svc_line)

    for line in lines:
        blocks.append(_text_block(line))

    # 경고
    warnings = []
    if (proj.get("git_unpushed") or 0) >= 10:
        warnings.append(f"미푸시 {proj['git_unpushed']}개")
    if (proj.get("git_uncommitted") or 0) >= 20:
        warnings.append(f"미커밋 {proj['git_uncommitted']}개")
    if (proj.get("junk_mb") or 0) >= 100:
        warnings.append(f"캐시 {proj['junk_mb']:.0f} MB")
    if (proj.get("total_size_mb") or 0) >= 5120:
        warnings.append(f"프로젝트 {proj['total_size_mb']/1024:.1f} GB")

    if warnings:
        blocks.append(_text_block(f"⚠ 경고: {', '.join(warnings)}"))

    blocks.append(_text_block(OVERSEER_MARKER))
    blocks.append(_divider())

    return blocks


def _remove_old_status_blocks(page_id: str):
    """기존 overseer 상태 블록을 찾아서 삭제."""
    blocks = _get_blocks(page_id)
    in_marker = False
    to_delete = []

    for block in blocks:
        # divider 또는 paragraph에서 마커 텍스트 확인
        text = ""
        if block["type"] == "paragraph":
            for rt in block.get("paragraph", {}).get("rich_text", []):
                text += rt.get("plain_text", "")

        if OVERSEER_MARKER in text:
            to_delete.append(block["id"])
            in_marker = not in_marker
            continue

        if in_marker:
            to_delete.append(block["id"])

    # 마커 전후의 divider도 삭제
    for block in blocks:
        if block["id"] in to_delete and block["type"] == "divider":
            to_delete.append(block["id"])

    for bid in to_delete:
        _delete_block(bid)

    return len(to_delete)


def sync_project(proj: dict) -> bool:
    """단일 프로젝트를 Notion에 동기화."""
    notion_id = proj.get("notion_id")
    if not notion_id:
        return False

    # 1. 기존 상태 블록 제거
    removed = _remove_old_status_blocks(notion_id)
    if removed:
        logger.info("  Removed %d old status blocks from %s", removed, proj["name"])

    # 2. 새 상태 블록 삽입
    blocks = _build_status_blocks(proj)
    return _append_blocks(notion_id, blocks)


def sync_all():
    """모든 프로젝트를 Notion에 동기화. 매일 cron으로 실행."""
    if not NOTION_TOKEN:
        logger.error("NOTION_TOKEN not set, cannot sync to Notion")
        return

    # Supabase에서 최신 프로젝트 요약 가져오기
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
        if not proj.get("notion_id"):
            continue
        if sync_project(proj):
            synced += 1
            logger.info("Synced %s → Notion", proj["name"])
        else:
            logger.warning("Failed to sync %s", proj["name"])

    logger.info("=== Notion sync complete: %d/%d projects ===", synced, len(projects))


if __name__ == "__main__":
    sync_all()

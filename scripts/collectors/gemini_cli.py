"""Gemini CLI JSON 대화 파서.

파일 위치: ~/.gemini/tmp/{projectHash}/chats/session-*.json
JSON 구조:
  {"sessionId":"uuid", "projectHash":"...", "startTime":"ISO8601",
   "lastUpdated":"ISO8601",
   "messages":[{"id":"...","timestamp":"ISO8601","type":"user|gemini",
                "content":"str|list", "displayContent":"..."}]}

projectHash→프로젝트 매핑: ~/.gemini/history/{name}/.project_root
"""

from __future__ import annotations

import json
import logging
from datetime import datetime
from pathlib import Path

from . import (
    ConversationMeta,
    ParsedConversation,
    ParsedMessage,
    truncate_content,
)

logger = logging.getLogger(__name__)


def _build_hash_to_project_map(base_path: Path) -> dict[str, str]:
    """history/ 디렉토리에서 projectHash→프로젝트명 매핑 구축."""
    mapping = {}
    history_dir = base_path / "history"
    if not history_dir.exists():
        return mapping

    for project_dir in history_dir.iterdir():
        if not project_dir.is_dir():
            continue
        root_file = project_dir / ".project_root"
        if root_file.exists():
            try:
                project_root = root_file.read_text().strip()
                if project_root:
                    # projectHash는 project_root 경로의 해시이므로
                    # 역매핑은 직접 안 되지만, 이름으로 매핑
                    mapping[project_dir.name] = project_root
            except OSError:
                pass

    return mapping


def discover_conversations(base_path: Path) -> list[dict]:
    """~/.gemini/tmp/ 하위의 모든 세션 JSON 파일을 발견."""
    results = []
    tmp_dir = base_path / "tmp"
    if not tmp_dir.exists():
        logger.warning("Gemini tmp path not found: %s", tmp_dir)
        return results

    # projectHash→프로젝트 매핑은 history에서 구축
    # 하지만 hash↔name 직접 매핑은 불가 → 파일 내 projectHash로 추후 활용
    hash_map = _build_hash_to_project_map(base_path)

    for session_file in tmp_dir.rglob("session-*.json"):
        try:
            size = session_file.stat().st_size
            if size == 0:
                continue

            # 파일 헤더만 읽어서 sessionId 확인
            with open(session_file, "r", encoding="utf-8", errors="replace") as f:
                data = json.load(f)

            session_id = data.get("sessionId")
            if not session_id:
                continue

            project_hash = data.get("projectHash", "")

            # projectHash 디렉토리명에서 프로젝트 이름 추출 시도
            # tmp/{hash}/chats/session-*.json → hash 디렉토리
            hash_dir_name = session_file.parent.parent.name
            project_name = None
            # history 디렉토리에서 같은 이름의 폴더가 있으면 매핑
            for name, root in hash_map.items():
                if hash_dir_name == project_hash or name in str(session_file):
                    project_name = root
                    break

            results.append({
                "path": str(session_file),
                "size": size,
                "session_id": session_id,
                "project_hash": project_hash,
                "project_name": project_name,
                "start_time": data.get("startTime"),
            })
        except (json.JSONDecodeError, OSError) as e:
            logger.debug("Skipping %s: %s", session_file, e)
            continue

    logger.info("Discovered %d Gemini conversations", len(results))
    return results


def parse_conversation(file_info: dict) -> ParsedConversation | None:
    """세션 JSON 파일 하나를 파싱."""
    path = Path(file_info["path"])

    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            data = json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        logger.error("Failed to parse %s: %s", path, e)
        return None

    raw_messages = data.get("messages", [])
    if not raw_messages:
        return None

    messages: list[ParsedMessage] = []
    title: str | None = None

    for msg in raw_messages:
        msg_type = msg.get("type", "")
        ts = _parse_timestamp(msg.get("timestamp"))
        if ts is None:
            continue

        # role 매핑
        if msg_type == "user":
            role = "user"
        elif msg_type == "gemini":
            role = "assistant"
        else:
            continue

        content = _extract_content(msg.get("content"))

        if title is None and role == "user" and content:
            title = content[:100]

        messages.append(ParsedMessage(
            role=role,
            content=truncate_content(content),
            message_at=ts,
            metadata={},
        ))

    if not messages:
        return None

    start_time = _parse_timestamp(data.get("startTime")) or messages[0].message_at

    meta = ConversationMeta(
        provider="gemini_cli",
        external_id=file_info["session_id"],
        source_path=str(path),
        source_size=file_info["size"],
        project_path=file_info.get("project_name"),
        model=None,  # Gemini CLI JSON에 모델 정보 없음
        started_at=start_time,
        title=title,
        metadata={"project_hash": file_info.get("project_hash", "")},
    )

    return ParsedConversation(meta=meta, messages=messages)


def _parse_timestamp(ts_str: str | None) -> datetime | None:
    if not ts_str:
        return None
    try:
        return datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None


def _extract_content(content) -> str | None:
    """content: string(응답) 또는 list[{"text":"..."}](입력)."""
    if content is None:
        return None
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                text = item.get("text")
                if text:
                    parts.append(text)
        return "\n".join(parts) if parts else None
    return str(content)

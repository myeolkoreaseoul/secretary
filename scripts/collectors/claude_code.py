"""Claude Code JSONL 대화 파서.

파일 위치: ~/.claude/projects/*/  (각 파일이 하나의 세션)
JSONL 구조:
  {"sessionId":"...", "type":"user|assistant|progress|file-history-snapshot",
   "message":{"role":"...","content":...}, "timestamp":"ISO8601", "cwd":"...", ...}
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

# 대화 메시지로 취급할 type
_CHAT_TYPES = {"user", "assistant"}

# 대형 파일 기준 (5MB)
_LARGE_FILE_THRESHOLD = 5 * 1024 * 1024
_LARGE_FILE_HEAD = 10
_LARGE_FILE_TAIL = 200


def discover_conversations(base_path: Path) -> list[dict]:
    """~/.claude/projects/ 하위의 모든 JSONL 세션 파일을 발견."""
    results = []
    if not base_path.exists():
        logger.warning("Claude Code base path not found: %s", base_path)
        return results

    for jsonl_file in base_path.rglob("*.jsonl"):
        try:
            size = jsonl_file.stat().st_size
            if size == 0:
                continue

            # 첫 줄에서 sessionId 추출
            with open(jsonl_file, "r", encoding="utf-8", errors="replace") as f:
                first_line = f.readline().strip()
                if not first_line:
                    continue
                first_record = json.loads(first_line)

            session_id = first_record.get("sessionId")
            if not session_id:
                continue

            results.append({
                "path": str(jsonl_file),
                "size": size,
                "session_id": session_id,
                "cwd": first_record.get("cwd"),
            })
        except (json.JSONDecodeError, OSError) as e:
            logger.debug("Skipping %s: %s", jsonl_file, e)
            continue

    logger.info("Discovered %d Claude Code conversations", len(results))
    return results


def parse_conversation(file_info: dict) -> ParsedConversation | None:
    """JSONL 파일 하나를 파싱하여 ParsedConversation 반환."""
    path = Path(file_info["path"])
    size = file_info["size"]
    is_large = size > _LARGE_FILE_THRESHOLD

    messages: list[ParsedMessage] = []
    models_seen: set[str] = set()
    first_ts: datetime | None = None
    last_ts: datetime | None = None
    title: str | None = None

    try:
        all_records = _read_records(path, is_large)

        for record in all_records:
            rec_type = record.get("type")
            if rec_type not in _CHAT_TYPES:
                continue

            ts = _parse_timestamp(record.get("timestamp"))
            if ts is None:
                continue

            if first_ts is None:
                first_ts = ts
            last_ts = ts

            msg = record.get("message", {})
            role = msg.get("role", rec_type)
            content = _extract_content(msg.get("content"))

            # 첫 user 메시지를 제목으로
            if title is None and role == "user" and content:
                title = content[:100]

            # 모델 추출
            model = record.get("model")
            if model:
                models_seen.add(model)

            messages.append(ParsedMessage(
                role=role,
                content=truncate_content(content),
                message_at=ts,
                model=model,
                metadata={},
            ))

    except (OSError, json.JSONDecodeError) as e:
        logger.error("Failed to parse %s: %s", path, e)
        return None

    if not messages or first_ts is None:
        return None

    # 프로젝트 경로 추출 (경로에서)
    project_path = file_info.get("cwd")

    meta = ConversationMeta(
        provider="claude_code",
        external_id=file_info["session_id"],
        source_path=str(path),
        source_size=size,
        project_path=project_path,
        model=next(iter(models_seen), None),
        started_at=first_ts,
        title=title,
        metadata={"models": list(models_seen)} if len(models_seen) > 1 else {},
    )

    return ParsedConversation(meta=meta, messages=messages)


def _read_records(path: Path, is_large: bool) -> list[dict]:
    """JSONL 파일에서 레코드를 읽기. 대형 파일은 head+tail만."""
    records = []

    with open(path, "r", encoding="utf-8", errors="replace") as f:
        if not is_large:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    records.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
        else:
            # 대형 파일: 모든 줄을 읽되 head + tail만 보존
            head = []
            tail = []
            for i, line in enumerate(f):
                line = line.strip()
                if not line:
                    continue
                try:
                    record = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if i < _LARGE_FILE_HEAD:
                    head.append(record)
                else:
                    tail.append(record)
                    if len(tail) > _LARGE_FILE_TAIL:
                        tail.pop(0)
            records = head + tail
            logger.info("Large file %s: kept %d head + %d tail records",
                        path.name, len(head), len(tail))

    return records


def _parse_timestamp(ts_str: str | None) -> datetime | None:
    if not ts_str:
        return None
    try:
        # ISO 8601 with timezone
        return datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None


def _extract_content(content) -> str | None:
    """content 필드에서 텍스트 추출. string 또는 array 형태 처리."""
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
                if item.get("type") == "text":
                    parts.append(item.get("text", ""))
                elif item.get("type") == "tool_use":
                    parts.append(f"[tool: {item.get('name', '?')}]")
                elif item.get("type") == "tool_result":
                    # tool_result는 요약만
                    result_content = item.get("content", "")
                    if isinstance(result_content, str):
                        summary = result_content[:200]
                    elif isinstance(result_content, list):
                        summary = str(result_content[0])[:200] if result_content else ""
                    else:
                        summary = str(result_content)[:200]
                    parts.append(f"[tool_result: {summary}]")
        return "\n".join(parts) if parts else None
    return str(content)

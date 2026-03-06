"""Codex CLI JSONL 대화 파서.

파일 위치: ~/.codex/sessions/YYYY/MM/DD/*.jsonl
JSONL 구조:
  {"timestamp":"ISO8601","type":"session_meta|response_item|event_msg|turn_context",
   "payload":{...}}

핵심 type:
  - session_meta: {id, cwd, model_provider, ...}
  - response_item: {role, content, ...}
  - turn_context: {model, cwd, ...}
  - event_msg: 내부 이벤트 (스킵)
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


def discover_conversations(base_path: Path) -> list[dict]:
    """~/.codex/sessions/ 하위의 모든 JSONL 세션 파일을 발견."""
    results = []
    sessions_dir = base_path / "sessions"
    if not sessions_dir.exists():
        logger.warning("Codex sessions path not found: %s", sessions_dir)
        return results

    for jsonl_file in sessions_dir.rglob("*.jsonl"):
        try:
            size = jsonl_file.stat().st_size
            if size == 0:
                continue

            # 첫 줄에서 session_meta 추출
            with open(jsonl_file, "r", encoding="utf-8", errors="replace") as f:
                first_line = f.readline().strip()
                if not first_line:
                    continue
                first_record = json.loads(first_line)

            if first_record.get("type") != "session_meta":
                continue

            payload = first_record.get("payload", {})
            session_id = payload.get("id")
            if not session_id:
                # 파일명에서 추출
                session_id = jsonl_file.stem

            results.append({
                "path": str(jsonl_file),
                "size": size,
                "session_id": session_id,
                "cwd": payload.get("cwd"),
                "model_provider": payload.get("model_provider"),
            })
        except (json.JSONDecodeError, OSError) as e:
            logger.debug("Skipping %s: %s", jsonl_file, e)
            continue

    logger.info("Discovered %d Codex conversations", len(results))
    return results


def parse_conversation(file_info: dict) -> ParsedConversation | None:
    """JSONL 파일 하나를 파싱."""
    path = Path(file_info["path"])

    messages: list[ParsedMessage] = []
    models_seen: set[str] = set()
    current_model: str | None = None
    first_ts: datetime | None = None
    last_ts: datetime | None = None
    title: str | None = None

    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    record = json.loads(line)
                except json.JSONDecodeError:
                    continue

                rec_type = record.get("type")
                ts = _parse_timestamp(record.get("timestamp"))

                if rec_type == "turn_context":
                    # 모델 정보 업데이트
                    payload = record.get("payload", {})
                    model = payload.get("model")
                    if model:
                        current_model = model
                        models_seen.add(model)
                    continue

                if rec_type != "response_item":
                    continue

                payload = record.get("payload", {})
                role = payload.get("role")
                if role not in ("user", "assistant", "system"):
                    continue

                content = _extract_content(payload.get("content"))
                if ts is None:
                    continue

                if first_ts is None:
                    first_ts = ts
                last_ts = ts

                if title is None and role == "user" and content:
                    title = content[:100]

                messages.append(ParsedMessage(
                    role=role,
                    content=truncate_content(content),
                    message_at=ts,
                    model=current_model,
                    metadata={},
                ))

    except (OSError, json.JSONDecodeError) as e:
        logger.error("Failed to parse %s: %s", path, e)
        return None

    if not messages or first_ts is None:
        return None

    meta = ConversationMeta(
        provider="codex",
        external_id=file_info["session_id"],
        source_path=str(path),
        source_size=file_info["size"],
        project_path=file_info.get("cwd"),
        model=current_model or next(iter(models_seen), None),
        started_at=first_ts,
        title=title,
        metadata={"model_provider": file_info.get("model_provider")} if file_info.get("model_provider") else {},
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
    """content 필드 처리. Codex는 보통 list[{type, text}] 형태."""
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
                elif item.get("type") == "tool_use":
                    parts.append(f"[tool: {item.get('name', '?')}]")
                elif item.get("type") == "tool_result":
                    parts.append(f"[tool_result: {str(item.get('output', ''))[:200]}]")
        return "\n".join(parts) if parts else None
    return str(content)

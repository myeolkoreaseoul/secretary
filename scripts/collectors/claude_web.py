"""Claude.ai 웹 Export JSON 파서 (보험용).

Claude.ai > Settings > Export data 로 다운로드한 ZIP 내
conversations.json을 파싱.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path

from scripts.collectors import (
    ConversationMeta,
    ParsedConversation,
    ParsedMessage,
    UsageInfo,
    truncate_content,
)

logger = logging.getLogger("collector.claude_web")


def discover_conversations(base_path: Path) -> list[dict]:
    """Export 디렉토리에서 conversations.json 파일 탐색."""
    results = []
    # base_path 아래 conversations.json 찾기 (ZIP 풀린 후)
    for conv_file in base_path.glob("**/conversations.json"):
        try:
            data = json.loads(conv_file.read_text(encoding="utf-8"))
            if not isinstance(data, list):
                continue
            for conv in data:
                uuid = conv.get("uuid") or conv.get("id")
                if not uuid:
                    continue
                results.append({
                    "session_id": uuid,
                    "path": str(conv_file),
                    "size": conv_file.stat().st_size,
                    "data": conv,
                })
        except (json.JSONDecodeError, OSError) as e:
            logger.warning("Skipping %s: %s", conv_file, e)
    return results


def parse_conversation(conv_info: dict) -> ParsedConversation | None:
    """개별 대화를 ParsedConversation으로 변환."""
    data = conv_info["data"]

    name = data.get("name") or data.get("title") or ""
    uuid = conv_info["session_id"]
    created = data.get("created_at") or data.get("created")

    try:
        started_at = datetime.fromisoformat(created.replace("Z", "+00:00")) if created else datetime.now(timezone.utc)
    except (ValueError, AttributeError):
        started_at = datetime.now(timezone.utc)

    model = data.get("model") or data.get("default_model")

    meta = ConversationMeta(
        provider="claude_web",
        external_id=uuid,
        source_path=conv_info["path"],
        source_size=conv_info["size"],
        title=name[:200] if name else None,
        model=model,
        started_at=started_at,
    )

    messages = []
    chat_messages = data.get("chat_messages") or data.get("messages") or []

    for msg in chat_messages:
        role = msg.get("sender") or msg.get("role") or "unknown"
        # Claude.ai uses "human" / "assistant"
        if role == "human":
            role = "user"

        # content 추출
        content = ""
        raw_content = msg.get("text") or msg.get("content")
        if isinstance(raw_content, str):
            content = raw_content
        elif isinstance(raw_content, list):
            texts = []
            for block in raw_content:
                if isinstance(block, str):
                    texts.append(block)
                elif isinstance(block, dict) and block.get("type") == "text":
                    texts.append(block.get("text", ""))
            content = "\n".join(texts)

        msg_created = msg.get("created_at") or msg.get("created") or created
        try:
            message_at = datetime.fromisoformat(str(msg_created).replace("Z", "+00:00"))
        except (ValueError, AttributeError):
            message_at = started_at

        messages.append(ParsedMessage(
            role=role,
            content=truncate_content(content),
            message_at=message_at,
            model=model,
        ))

    if not messages:
        return None

    return ParsedConversation(meta=meta, messages=messages)

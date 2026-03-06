"""ChatGPT 웹 Export JSON 파서 (보험용).

ChatGPT > Settings > Data controls > Export data 로 다운로드한 ZIP 내
conversations.json을 파싱.

ChatGPT의 대화는 트리 구조(mapping)로 저장됨 → 가장 긴 경로를 DFS로 추출.
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
    truncate_content,
)

logger = logging.getLogger("collector.chatgpt_web")


def discover_conversations(base_path: Path) -> list[dict]:
    """Export 디렉토리에서 conversations.json 파일 탐색."""
    results = []
    for conv_file in base_path.glob("**/conversations.json"):
        try:
            data = json.loads(conv_file.read_text(encoding="utf-8"))
            if not isinstance(data, list):
                continue
            for conv in data:
                conv_id = conv.get("id") or conv.get("conversation_id")
                if not conv_id:
                    continue
                results.append({
                    "session_id": conv_id,
                    "path": str(conv_file),
                    "size": conv_file.stat().st_size,
                    "data": conv,
                })
        except (json.JSONDecodeError, OSError) as e:
            logger.warning("Skipping %s: %s", conv_file, e)
    return results


def _linearize_mapping(mapping: dict) -> list[dict]:
    """트리 구조 mapping → 가장 긴 경로의 선형 메시지 리스트 (DFS).

    mapping = { node_id: { "id", "parent", "children": [...], "message": {...} } }
    """
    if not mapping:
        return []

    # 루트 노드 찾기 (parent가 없는 것)
    root_ids = []
    for node_id, node in mapping.items():
        parent = node.get("parent")
        if not parent or parent not in mapping:
            root_ids.append(node_id)

    if not root_ids:
        root_ids = list(mapping.keys())[:1]

    # DFS로 가장 긴 경로 찾기 (cycle 방어)
    def dfs(node_id: str, visited: set | None = None) -> list[str]:
        if visited is None:
            visited = set()
        if node_id in visited:
            return []
        visited.add(node_id)
        node = mapping.get(node_id)
        if not node:
            return [node_id]
        children = node.get("children", [])
        if not children:
            return [node_id]
        best = []
        for child_id in children:
            path = dfs(child_id, visited)
            if len(path) > len(best):
                best = path
        return [node_id] + best

    longest = []
    for root_id in root_ids:
        path = dfs(root_id)
        if len(path) > len(longest):
            longest = path

    # 메시지 추출
    messages = []
    for node_id in longest:
        node = mapping.get(node_id, {})
        msg_data = node.get("message")
        if msg_data and msg_data.get("content"):
            messages.append(msg_data)

    return messages


def parse_conversation(conv_info: dict) -> ParsedConversation | None:
    """개별 대화를 ParsedConversation으로 변환."""
    data = conv_info["data"]

    title = data.get("title") or ""
    conv_id = conv_info["session_id"]
    create_time = data.get("create_time")

    if create_time:
        try:
            started_at = datetime.fromtimestamp(float(create_time), tz=timezone.utc)
        except (ValueError, TypeError, OSError):
            started_at = datetime.now(timezone.utc)
    else:
        started_at = datetime.now(timezone.utc)

    default_model = data.get("default_model_slug") or "gpt-4"

    meta = ConversationMeta(
        provider="chatgpt_web",
        external_id=conv_id,
        source_path=conv_info["path"],
        source_size=conv_info["size"],
        title=title[:200] if title else None,
        model=default_model,
        started_at=started_at,
    )

    # 트리 구조 → 선형 메시지
    mapping = data.get("mapping", {})
    raw_messages = _linearize_mapping(mapping)

    messages = []
    for msg_data in raw_messages:
        author = msg_data.get("author", {})
        role = author.get("role", "unknown")
        if role == "system" and not msg_data.get("content", {}).get("parts"):
            continue

        content_obj = msg_data.get("content", {})
        parts = content_obj.get("parts", [])
        content = ""
        for part in parts:
            if isinstance(part, str):
                content += part
            elif isinstance(part, dict) and part.get("text"):
                content += part["text"]

        if not content.strip():
            continue

        msg_time = msg_data.get("create_time")
        if msg_time:
            try:
                message_at = datetime.fromtimestamp(float(msg_time), tz=timezone.utc)
            except (ValueError, TypeError, OSError):
                message_at = started_at
        else:
            message_at = started_at

        model = msg_data.get("metadata", {}).get("model_slug") or default_model

        messages.append(ParsedMessage(
            role=role,
            content=truncate_content(content),
            message_at=message_at,
            model=model,
        ))

    if not messages:
        return None

    return ParsedConversation(meta=meta, messages=messages)

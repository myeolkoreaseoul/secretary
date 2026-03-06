"""AI CLI 대화 파서 공통 모듈."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime


MAX_CONTENT_LENGTH = 10_000  # 10KB


@dataclass
class ConversationMeta:
    provider: str           # 'claude_code', 'codex', 'gemini_cli'
    external_id: str        # sessionId / session_id
    source_path: str
    source_size: int
    project_path: str | None = None
    model: str | None = None
    started_at: datetime = field(default_factory=datetime.now)
    title: str | None = None
    metadata: dict = field(default_factory=dict)


@dataclass
class ParsedMessage:
    role: str               # 'user', 'assistant', 'system', 'tool'
    content: str | None     # MAX_CONTENT_LENGTH 이내로 truncate
    message_at: datetime
    token_count: int | None = None
    model: str | None = None
    metadata: dict = field(default_factory=dict)


@dataclass
class UsageInfo:
    model: str
    input_tokens: int = 0
    output_tokens: int = 0
    cache_read_tokens: int = 0
    cache_write_tokens: int = 0
    total_cost_usd: float | None = None


@dataclass
class ParsedConversation:
    meta: ConversationMeta
    messages: list[ParsedMessage]
    usage: UsageInfo | None = None


def truncate_content(text: str | None) -> str | None:
    if text is None:
        return None
    if len(text) > MAX_CONTENT_LENGTH:
        return text[:MAX_CONTENT_LENGTH] + "\n... [truncated]"
    return text

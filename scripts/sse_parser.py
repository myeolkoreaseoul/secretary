"""SSE 스트리밍 응답 파서.

프로바이더별 SSE 스트리밍 응답을 파싱하여 텍스트 + 토큰 usage 추출.
TCP 청크 경계 처리: \n\n 이벤트 구분자 기준 버퍼링.
"""

from __future__ import annotations

import codecs
import json
import logging
from dataclasses import dataclass, field

logger = logging.getLogger("sse-parser")


@dataclass
class ParsedResponse:
    provider: str
    model: str | None = None
    content: str = ""
    input_tokens: int = 0
    output_tokens: int = 0
    cache_read_tokens: int = 0
    cache_write_tokens: int = 0
    stop_reason: str | None = None
    tool_use: list[dict] = field(default_factory=list)
    error: str | None = None


class AnthropicSSEParser:
    """Anthropic Messages API SSE 파서.

    이벤트 타입:
    - message_start: 모델 정보 + input usage
    - content_block_start: content_block 시작 (text / tool_use)
    - content_block_delta: 텍스트 delta 또는 tool input delta
    - content_block_stop: 블록 완료
    - message_delta: stop_reason + output usage
    - message_stop: 메시지 완료
    """

    def __init__(self):
        self.result = ParsedResponse(provider="anthropic")
        self._buffer = ""
        self._decoder = codecs.getincrementaldecoder("utf-8")("replace")
        self._current_block_type: str | None = None
        self._current_tool: dict | None = None

    def feed(self, chunk: bytes | str) -> None:
        """바이트/문자열 청크를 버퍼에 추가하고 완성된 이벤트를 파싱."""
        if isinstance(chunk, bytes):
            chunk = self._decoder.decode(chunk, final=False)
        self._buffer += chunk.replace("\r\n", "\n")
        self._process_buffer()

    def _process_buffer(self) -> None:
        """버퍼에서 완성된 SSE 이벤트(\n\n으로 구분)를 추출하여 처리."""
        while "\n\n" in self._buffer:
            event_str, self._buffer = self._buffer.split("\n\n", 1)
            self._parse_event(event_str)

    def _parse_event(self, event_str: str) -> None:
        """개별 SSE 이벤트 파싱."""
        event_type = None
        data_lines = []

        for line in event_str.split("\n"):
            if line.startswith("event: "):
                event_type = line[7:].strip()
            elif line.startswith("data: "):
                data_lines.append(line[6:])
            elif line.startswith("data:"):
                data_lines.append(line[5:])

        if not data_lines:
            return

        data_str = "\n".join(data_lines)
        try:
            data = json.loads(data_str)
        except json.JSONDecodeError:
            return

        if event_type == "message_start":
            self._handle_message_start(data)
        elif event_type == "content_block_start":
            self._handle_content_block_start(data)
        elif event_type == "content_block_delta":
            self._handle_content_block_delta(data)
        elif event_type == "content_block_stop":
            self._handle_content_block_stop()
        elif event_type == "message_delta":
            self._handle_message_delta(data)
        elif event_type == "error":
            self.result.error = data.get("error", {}).get("message", str(data))

    def _handle_message_start(self, data: dict) -> None:
        msg = data.get("message", {})
        self.result.model = msg.get("model")
        usage = msg.get("usage", {})
        self.result.input_tokens = usage.get("input_tokens", 0)
        self.result.cache_read_tokens = usage.get("cache_read_input_tokens", 0)
        self.result.cache_write_tokens = usage.get("cache_creation_input_tokens", 0)

    def _handle_content_block_start(self, data: dict) -> None:
        block = data.get("content_block", {})
        self._current_block_type = block.get("type")
        if self._current_block_type == "tool_use":
            self._current_tool = {
                "id": block.get("id"),
                "name": block.get("name"),
                "input": "",
            }

    def _handle_content_block_delta(self, data: dict) -> None:
        delta = data.get("delta", {})
        delta_type = delta.get("type")

        if delta_type == "text_delta":
            self.result.content += delta.get("text", "")
        elif delta_type == "input_json_delta":
            if self._current_tool is not None:
                self._current_tool["input"] += delta.get("partial_json", "")

    def _handle_content_block_stop(self) -> None:
        if self._current_block_type == "tool_use" and self._current_tool:
            try:
                self._current_tool["input"] = json.loads(self._current_tool["input"])
            except (json.JSONDecodeError, TypeError):
                pass
            self.result.tool_use.append(self._current_tool)
            self._current_tool = None
        self._current_block_type = None

    def _handle_message_delta(self, data: dict) -> None:
        delta = data.get("delta", {})
        self.result.stop_reason = delta.get("stop_reason")
        usage = data.get("usage", {})
        self.result.output_tokens = usage.get("output_tokens", 0)

    def finish(self) -> ParsedResponse:
        """남은 버퍼 처리 후 결과 반환."""
        if self._buffer.strip():
            self._parse_event(self._buffer)
            self._buffer = ""
        return self.result


class OpenAISSEParser:
    """OpenAI Chat Completions SSE 파서 (향후 확장용).

    이벤트:
    - data: {"choices": [{"delta": {"content": "..."}}]}
    - data: [DONE]
    """

    def __init__(self):
        self.result = ParsedResponse(provider="openai")
        self._buffer = ""
        self._decoder = codecs.getincrementaldecoder("utf-8")("replace")

    def feed(self, chunk: bytes | str) -> None:
        if isinstance(chunk, bytes):
            chunk = self._decoder.decode(chunk, final=False)
        self._buffer += chunk.replace("\r\n", "\n")
        self._process_buffer()

    def _process_buffer(self) -> None:
        while "\n\n" in self._buffer:
            event_str, self._buffer = self._buffer.split("\n\n", 1)
            self._parse_event(event_str)

    def _parse_event(self, event_str: str) -> None:
        for line in event_str.split("\n"):
            if line.startswith("data: "):
                data_str = line[6:].strip()
            elif line.startswith("data:"):
                data_str = line[5:].strip()
            else:
                continue
            if data_str == "[DONE]":
                return

            try:
                data = json.loads(data_str)
            except json.JSONDecodeError:
                continue

            if not self.result.model:
                self.result.model = data.get("model")

            choices = data.get("choices", [])
            if choices:
                delta = choices[0].get("delta", {})
                content = delta.get("content")
                if content:
                    self.result.content += content
                finish = choices[0].get("finish_reason")
                if finish:
                    self.result.stop_reason = finish

            usage = data.get("usage")
            if usage:
                self.result.input_tokens = usage.get("prompt_tokens", 0)
                self.result.output_tokens = usage.get("completion_tokens", 0)

    def finish(self) -> ParsedResponse:
        if self._buffer.strip():
            self._parse_event(self._buffer)
            self._buffer = ""
        return self.result


def get_parser(provider: str) -> AnthropicSSEParser | OpenAISSEParser:
    """프로바이더에 맞는 파서 인스턴스 반환."""
    if provider == "anthropic":
        return AnthropicSSEParser()
    elif provider == "openai":
        return OpenAISSEParser()
    else:
        raise ValueError(f"Unknown provider: {provider}")

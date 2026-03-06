"""AI Gateway — CLI의 AI API 호출을 실시간 캡처하여 DB 저장.

리버스 프록시로 동작:
  CLI → localhost:4000 → Anthropic API
  요청/응답을 파싱하여 비동기로 Supabase에 저장.

사용법:
  python -m scripts.ai_gateway
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import signal
import sys
import time
from pathlib import Path

from aiohttp import web, ClientSession, ClientTimeout

# 재귀 방지: 프록시 자체가 ANTHROPIC_BASE_URL을 따르지 않도록
os.environ.pop("ANTHROPIC_BASE_URL", None)
os.environ.pop("OPENAI_BASE_URL", None)

# bot/config.py의 설정을 재사용
sys.path.insert(0, str(Path(__file__).parent.parent))
from bot.config import SUPABASE_REST_URL, SUPABASE_HEADERS, SUPABASE_URL, SUPABASE_SERVICE_KEY

from scripts.sse_parser import get_parser, ParsedResponse
from scripts.collectors import truncate_content, MAX_CONTENT_LENGTH

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("ai-gateway")

# ─── 설정 ──────────────────────────────────────────────────
GATEWAY_HOST = os.environ.get("GATEWAY_HOST", "127.0.0.1")
GATEWAY_PORT = int(os.environ.get("GATEWAY_PORT", "4000"))
MAX_RESPONSE_BUFFER = 50 * 1024 * 1024  # 50MB 상한
SESSION_TTL_SECONDS = 30 * 60  # 30분
SESSION_CLEANUP_INTERVAL = 5 * 60  # 5분

TARGETS = {
    "anthropic": "https://api.anthropic.com",
    "openai": "https://api.openai.com",
}

# ─── Supabase 클라이언트 ────────────────────────────────────

import httpx

_http_client: httpx.AsyncClient | None = None


def _get_client() -> httpx.AsyncClient:
    global _http_client
    if _http_client is None:
        _http_client = httpx.AsyncClient(timeout=30.0)
    return _http_client


async def _request(
    method: str,
    path: str,
    *,
    params: dict | None = None,
    json_body=None,
    extra_headers: dict | None = None,
):
    client = _get_client()
    url = f"{SUPABASE_REST_URL}/{path}"
    headers = {**SUPABASE_HEADERS, **(extra_headers or {})}
    resp = await client.request(method, url, params=params, json=json_body, headers=headers)
    if resp.status_code >= 400:
        logger.error("Supabase %s %s → %d: %s", method, path, resp.status_code, resp.text[:500])
    resp.raise_for_status()
    if resp.status_code == 204 or not resp.content:
        return None
    return resp.json()


# ─── 세션 그룹핑 ────────────────────────────────────────────

# {session_key: {"conv_id": str, "last_at": float}}
_sessions: dict[str, dict] = {}


def _session_key(provider: str, model: str | None) -> str:
    """provider + model_family로 세션 키 생성."""
    family = (model or "unknown").split("-")[0]  # claude → claude
    return f"{provider}:{family}"


def _get_or_create_session(provider: str, model: str | None) -> str:
    """30분 윈도우 내면 기존 세션, 아니면 새 세션 생성."""
    key = _session_key(provider, model)
    now = time.time()

    if key in _sessions:
        session = _sessions[key]
        if now - session["last_at"] < SESSION_TTL_SECONDS:
            session["last_at"] = now
            return session["conv_id"]

    # 새 세션
    conv_id = hashlib.sha256(f"{key}:{now}".encode()).hexdigest()[:24]
    _sessions[key] = {"conv_id": conv_id, "last_at": now}
    return conv_id


async def _cleanup_expired_sessions():
    """만료된 세션 정리 루프."""
    while True:
        await asyncio.sleep(SESSION_CLEANUP_INTERVAL)
        now = time.time()
        expired = [k for k, v in _sessions.items() if now - v["last_at"] > SESSION_TTL_SECONDS]
        for k in expired:
            del _sessions[k]
        if expired:
            logger.info("Cleaned up %d expired sessions", len(expired))


# ─── DB 저장 ────────────────────────────────────────────────

async def save_to_db(
    provider: str,
    model: str | None,
    request_messages: list | None,
    system_prompt: str | None,
    parsed: ParsedResponse,
):
    """비동기 DB 저장 (fire-and-forget)."""
    try:
        db_provider = f"gateway_{provider}"
        session_id = _get_or_create_session(provider, parsed.model or model)

        # 1. ai_conversations UPSERT
        conv_body = {
            "provider": db_provider,
            "external_id": session_id,
            "model": parsed.model or model,
            "title": _extract_title(request_messages),
            "started_at": _iso_now(),
            "ended_at": _iso_now(),
            "message_count": 1,
            "source_path": "gateway",
            "source_size": 0,
        }
        conv_data = await _request("POST", "ai_conversations", json_body=conv_body, params={
            "on_conflict": "provider,external_id",
        }, extra_headers={
            "Prefer": "return=representation,resolution=merge-duplicates",
        })

        if not conv_data or len(conv_data) == 0:
            logger.error("Failed to upsert conversation")
            return

        conv_id = conv_data[0]["id"]

        # 2. ai_messages INSERT — user (요청)
        user_content = _extract_user_content(request_messages)
        messages_to_insert = []

        if user_content:
            messages_to_insert.append({
                "conversation_id": conv_id,
                "role": "user",
                "content": truncate_content(user_content),
                "model": parsed.model or model,
                "message_at": _iso_now(),
            })

        # 3. ai_messages INSERT — assistant (응답)
        assistant_content = parsed.content
        if parsed.tool_use:
            tool_summary = ", ".join(t.get("name", "?") for t in parsed.tool_use)
            assistant_content += f"\n[tool_use: {tool_summary}]"

        messages_to_insert.append({
            "conversation_id": conv_id,
            "role": "assistant",
            "content": truncate_content(assistant_content),
            "model": parsed.model or model,
            "token_count": parsed.output_tokens,
            "message_at": _iso_now(),
        })

        if messages_to_insert:
            await _request("POST", "ai_messages", json_body=messages_to_insert, extra_headers={
                "Prefer": "return=minimal",
            })

        # 4. ai_usage INSERT
        if parsed.input_tokens or parsed.output_tokens:
            usage_body = {
                "conversation_id": conv_id,
                "provider": db_provider,
                "model": parsed.model or model,
                "input_tokens": parsed.input_tokens,
                "output_tokens": parsed.output_tokens,
                "cache_read_tokens": parsed.cache_read_tokens,
                "cache_write_tokens": parsed.cache_write_tokens,
            }
            await _request("POST", "ai_usage", json_body=usage_body, extra_headers={
                "Prefer": "return=minimal",
            })

        logger.info("DB saved: conv=%s, model=%s, in=%d, out=%d",
                     session_id[:12], parsed.model, parsed.input_tokens, parsed.output_tokens)

    except Exception as e:
        logger.error("DB save failed: %s", e)


def _extract_title(messages: list | None) -> str | None:
    """첫 번째 user 메시지에서 제목 추출 (80자 제한)."""
    if not messages:
        return None
    for msg in messages:
        if msg.get("role") == "user":
            content = msg.get("content", "")
            if isinstance(content, list):
                # content가 블록 배열인 경우
                texts = [b.get("text", "") for b in content if b.get("type") == "text"]
                content = " ".join(texts)
            if content:
                return content[:80]
    return None


def _extract_user_content(messages: list | None) -> str | None:
    """마지막 user 메시지 content 추출."""
    if not messages:
        return None
    for msg in reversed(messages):
        if msg.get("role") == "user":
            content = msg.get("content", "")
            if isinstance(content, list):
                texts = [b.get("text", "") for b in content if b.get("type") == "text"]
                content = " ".join(texts)
            return content
    return None


def _iso_now() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()


# ─── 프로바이더 감지 ─────────────────────────────────────────

def detect_provider(request: web.Request) -> str:
    if request.headers.get("x-api-key") or request.headers.get("anthropic-version"):
        return "anthropic"
    if "/v1/chat" in request.path or "/v1/responses" in request.path:
        return "openai"
    return "anthropic"  # 기본값


# ─── 프록시 핸들러 ──────────────────────────────────────────

async def proxy_handler(request: web.Request):
    provider = detect_provider(request)
    target_base = TARGETS.get(provider, TARGETS["anthropic"])
    target_url = f"{target_base}{request.path_qs}"

    body = await request.read()

    # 요청 바디 파싱
    request_model = None
    request_messages = None
    system_prompt = None
    is_stream = False

    if body:
        try:
            parsed_body = json.loads(body)
            request_model = parsed_body.get("model")
            request_messages = parsed_body.get("messages")
            system_prompt = parsed_body.get("system")
            is_stream = parsed_body.get("stream", False)
        except json.JSONDecodeError:
            pass

    logger.info(">>> %s %s → %s (model=%s, stream=%s)",
                request.method, request.path, provider, request_model, is_stream)

    # 헤더 포워딩 (host 제외)
    forward_headers = {k: v for k, v in request.headers.items() if k.lower() != "host"}

    app_session: ClientSession = request.app["client_session"]

    try:
        async with app_session.request(
            request.method,
            target_url,
            headers=forward_headers,
            data=body,
        ) as resp:
            # 응답 헤더 전달
            response = web.StreamResponse(
                status=resp.status,
                headers={k: v for k, v in resp.headers.items()
                         if k.lower() not in ("transfer-encoding", "content-encoding")},
            )
            await response.prepare(request)

            if is_stream and resp.status == 200:
                # SSE 스트리밍: 클라이언트 전달 + 내부 버퍼 축적
                parser = get_parser(provider)
                buffer_size = 0

                async for chunk in resp.content.iter_any():
                    await response.write(chunk)
                    if buffer_size < MAX_RESPONSE_BUFFER:
                        parser.feed(chunk)
                        buffer_size += len(chunk)

                await response.write_eof()
                parsed = parser.finish()

                # 비동기 DB 저장
                asyncio.create_task(
                    save_to_db(provider, request_model, request_messages, system_prompt, parsed)
                )
            else:
                # 비스트리밍: 전체 응답 전달
                full_body = b""
                async for chunk in resp.content.iter_any():
                    await response.write(chunk)
                    if len(full_body) < MAX_RESPONSE_BUFFER:
                        full_body += chunk

                await response.write_eof()

                if resp.status == 200 and full_body:
                    try:
                        resp_json = json.loads(full_body)
                        parsed = ParsedResponse(
                            provider=provider,
                            model=resp_json.get("model"),
                            content=_extract_non_stream_content(resp_json, provider),
                            input_tokens=_extract_non_stream_usage(resp_json, provider, "input"),
                            output_tokens=_extract_non_stream_usage(resp_json, provider, "output"),
                            stop_reason=resp_json.get("stop_reason"),
                        )
                        asyncio.create_task(
                            save_to_db(provider, request_model, request_messages, system_prompt, parsed)
                        )
                    except json.JSONDecodeError:
                        pass

            logger.info("<<< %s %d (model=%s)", request.path, resp.status, request_model)
            return response

    except Exception as e:
        logger.error("Proxy error: %s", e)
        return web.json_response({"error": str(e)}, status=502)


def _extract_non_stream_content(data: dict, provider: str) -> str:
    """비스트리밍 응답에서 content 추출."""
    if provider == "anthropic":
        content_blocks = data.get("content", [])
        texts = [b.get("text", "") for b in content_blocks if b.get("type") == "text"]
        return "".join(texts)
    else:
        choices = data.get("choices", [])
        if choices:
            return choices[0].get("message", {}).get("content", "")
    return ""


def _extract_non_stream_usage(data: dict, provider: str, token_type: str) -> int:
    """비스트리밍 응답에서 usage 추출."""
    usage = data.get("usage", {})
    if provider == "anthropic":
        return usage.get(f"{token_type}_tokens", 0)
    else:
        key = "prompt_tokens" if token_type == "input" else "completion_tokens"
        return usage.get(key, 0)


# ─── 헬스체크 ───────────────────────────────────────────────

async def health_handler(request: web.Request):
    return web.json_response({
        "status": "ok",
        "active_sessions": len(_sessions),
    })


# ─── 앱 라이프사이클 ────────────────────────────────────────

async def on_startup(app: web.Application):
    app["client_session"] = ClientSession(timeout=ClientTimeout(total=300))
    app["cleanup_task"] = asyncio.create_task(_cleanup_expired_sessions())
    logger.info("AI Gateway started on %s:%d", GATEWAY_HOST, GATEWAY_PORT)


async def on_cleanup(app: web.Application):
    app["cleanup_task"].cancel()
    await app["client_session"].close()
    global _http_client
    if _http_client:
        await _http_client.aclose()
        _http_client = None
    logger.info("AI Gateway stopped")


# ─── 메인 ──────────────────────────────────────────────────

def create_app() -> web.Application:
    app = web.Application()
    app.on_startup.append(on_startup)
    app.on_cleanup.append(on_cleanup)
    app.router.add_get("/health", health_handler)
    app.router.add_route("*", "/{path:.*}", proxy_handler)
    return app


if __name__ == "__main__":
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        logger.error("SUPABASE_URL and SUPABASE_SERVICE_KEY required in bot/.env")
        sys.exit(1)

    app = create_app()
    web.run_app(app, host=GATEWAY_HOST, port=GATEWAY_PORT, print=None)

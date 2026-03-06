"""PoC: 최소 리버스 프록시 — CLI가 보내는 헤더/요청을 로깅."""

import asyncio
import json
import logging
import sys
from aiohttp import web, ClientSession, ClientTimeout

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
logger = logging.getLogger("poc-proxy")

TARGETS = {
    "anthropic": "https://api.anthropic.com",
    "openai": "https://api.openai.com",
    "gemini": "https://generativelanguage.googleapis.com",
}

# 어떤 프로바이더로 보낼지 헤더/경로로 판단
def detect_provider(request: web.Request) -> str:
    # x-api-key 또는 anthropic 헤더가 있으면 anthropic
    if request.headers.get("x-api-key") or request.headers.get("anthropic-version"):
        return "anthropic"
    # Authorization: Bearer 이고 /v1/chat 경로면 openai
    if "/v1/chat" in request.path or "/v1/responses" in request.path:
        return "openai"
    # 나머지는 gemini
    return "gemini"


async def proxy_handler(request: web.Request):
    provider = detect_provider(request)
    target_base = TARGETS[provider]
    target_url = f"{target_base}{request.path_qs}"

    # 헤더 로깅 (민감 정보 마스킹)
    headers_log = {}
    for k, v in request.headers.items():
        if k.lower() in ("authorization", "x-api-key"):
            headers_log[k] = v[:20] + "..." if len(v) > 20 else v
        elif k.lower() != "host":
            headers_log[k] = v

    body = await request.read()
    body_preview = ""
    if body:
        try:
            parsed = json.loads(body)
            body_preview = f"model={parsed.get('model','?')}, stream={parsed.get('stream','?')}"
        except json.JSONDecodeError:
            body_preview = f"{len(body)} bytes"

    logger.info(">>> %s %s → %s [%s] %s", request.method, request.path, provider, body_preview, json.dumps(headers_log, indent=2)[:500])

    # 전달
    forward_headers = {k: v for k, v in request.headers.items() if k.lower() != "host"}

    async with ClientSession(timeout=ClientTimeout(total=300)) as session:
        async with session.request(
            request.method,
            target_url,
            headers=forward_headers,
            data=body,
        ) as resp:
            # 스트리밍 응답 전달
            response = web.StreamResponse(
                status=resp.status,
                headers={k: v for k, v in resp.headers.items()
                         if k.lower() not in ("transfer-encoding", "content-encoding")},
            )
            await response.prepare(request)

            async for chunk in resp.content.iter_any():
                await response.write(chunk)

            await response.write_eof()
            logger.info("<<< %s %d", request.path, resp.status)
            return response


app = web.Application()
app.router.add_route("*", "/{path:.*}", proxy_handler)

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 4000
    logger.info("PoC proxy starting on port %d", port)
    web.run_app(app, port=port, print=None)

"""MCP Server — exposes tools for Claude CLI to call.

Claude connects to this server via JSON-RPC (stdio transport).
Only explicitly registered functions are callable — no arbitrary code execution.

Optimized for minimal round-trips: 2 main tools instead of 8.
"""

import asyncio
import json
import logging
import sys

import httpx
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import Tool, TextContent

# Ensure bot package is importable
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from bot import supabase_client as db
from bot import embedding as emb
from bot import telegram_sender as tg
from bot.config import require_env

WORKSPACE_DIR = Path("/home/john/projects/workspace")

log = logging.getLogger("secretary.mcp")

server = Server("secretary")

# ---------------------------------------------------------------------------
# Weather code → Korean description
# ---------------------------------------------------------------------------
_WEATHER_CODES = {
    0: "맑음 ☀️", 1: "대체로 맑음 🌤", 2: "부분 흐림 ⛅", 3: "흐림 ☁️",
    45: "안개 🌫", 48: "짙은 안개 🌫",
    51: "이슬비 🌦", 53: "이슬비 🌦", 55: "이슬비 🌦",
    61: "약한 비 🌧", 63: "비 🌧", 65: "강한 비 🌧",
    66: "약한 빙비 🌨", 67: "강한 빙비 🌨",
    71: "약한 눈 🌨", 73: "눈 ❄️", 75: "강한 눈 ❄️", 77: "싸라기눈 ❄️",
    80: "약한 소나기 🌦", 81: "소나기 🌧", 82: "강한 소나기 ⛈",
    85: "약한 눈소나기 🌨", 86: "강한 눈소나기 🌨",
    95: "뇌우 ⛈", 96: "우박 뇌우 ⛈", 99: "강한 우박 뇌우 ⛈",
}

# Korean city → (lat, lon) lookup
_CITY_COORDS = {
    "서울": (37.5665, 126.978), "부산": (35.1796, 129.0756),
    "인천": (37.4563, 126.7052), "대구": (35.8714, 128.6014),
    "대전": (36.3504, 127.3845), "광주": (35.1595, 126.8526),
    "울산": (35.5384, 129.3114), "세종": (36.4800, 127.2890),
    "수원": (37.2636, 127.0286), "제주": (33.4996, 126.5312),
    "춘천": (37.8813, 127.7298), "강릉": (37.7519, 128.8761),
    "전주": (35.8242, 127.1480), "청주": (36.6424, 127.4890),
    "포항": (36.0190, 129.3435), "창원": (35.2281, 128.6812),
    "김포": (37.6153, 126.7156), "평택": (36.9921, 127.1129),
}


# ---------------------------------------------------------------------------
# Tool Definitions
# ---------------------------------------------------------------------------

@server.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="prepare_context",
            description="유저 메시지를 DB에 저장하고, 최근 대화 히스토리와 관련 과거 맥락을 한번에 조회합니다. 항상 이 도구를 먼저 호출하세요.",
            inputSchema={
                "type": "object",
                "properties": {
                    "chat_id": {"type": "integer", "description": "텔레그램 chat_id"},
                    "content": {"type": "string", "description": "유저 메시지 내용"},
                    "telegram_message_id": {"type": "integer", "description": "텔레그램 메시지 ID (선택)"},
                },
                "required": ["chat_id", "content"],
            },
        ),
        Tool(
            name="respond_and_classify",
            description="답변을 텔레그램으로 전송하고, 봇 응답을 저장하고, 메시지를 분류합니다. prepare_context 후에 호출하세요.",
            inputSchema={
                "type": "object",
                "properties": {
                    "chat_id": {"type": "integer", "description": "텔레그램 chat_id"},
                    "message_id": {"type": "string", "description": "prepare_context에서 받은 user_message_id"},
                    "response_text": {"type": "string", "description": "유저에게 보낼 답변"},
                    "classification": {
                        "type": "object",
                        "description": "분류 결과: {category, title, summary, advice, entities[]}",
                    },
                },
                "required": ["chat_id", "message_id", "response_text", "classification"],
            },
        ),
        Tool(
            name="add_todo",
            description="할일을 추가합니다.",
            inputSchema={
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "할일 제목"},
                    "category": {"type": "string", "description": "카테고리명 (선택)"},
                    "due_date": {"type": "string", "description": "마감일 YYYY-MM-DD (선택)"},
                    "priority": {"type": "integer", "description": "우선순위 0~5 (기본: 0)"},
                },
                "required": ["title"],
            },
        ),
        Tool(
            name="get_weather",
            description="실시간 날씨와 24시간 예보를 조회합니다. 한국 주요 도시를 지원합니다.",
            inputSchema={
                "type": "object",
                "properties": {
                    "city": {"type": "string", "description": "도시명 (예: 서울, 부산, 제주). 기본값: 서울"},
                },
                "required": [],
            },
        ),
        Tool(
            name="web_search",
            description="웹 검색을 수행합니다. 날씨 외 실시간 정보(뉴스, 환율, 맛집, 일정 등)를 조회할 때 사용하세요.",
            inputSchema={
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "검색어"},
                    "max_results": {"type": "integer", "description": "결과 수 (기본: 5, 최대: 10)"},
                },
                "required": ["query"],
            },
        ),
        Tool(
            name="send_progress",
            description="코딩/빌드 작업 중 진행 상황을 텔레그램으로 전송합니다. 장시간 작업 시 중간 보고에 사용하세요.",
            inputSchema={
                "type": "object",
                "properties": {
                    "chat_id": {"type": "integer", "description": "텔레그램 chat_id"},
                    "status": {"type": "string", "description": "진행 상황 메시지 (예: 'CSS 적용 중...')"},
                    "percent": {"type": "integer", "description": "진행률 0~100 (선택)"},
                },
                "required": ["chat_id", "status"],
            },
        ),
        Tool(
            name="send_file",
            description="서버의 파일을 텔레그램으로 전송합니다. workspace 내 파일만 허용됩니다.",
            inputSchema={
                "type": "object",
                "properties": {
                    "chat_id": {"type": "integer", "description": "텔레그램 chat_id"},
                    "file_path": {"type": "string", "description": "전송할 파일 경로 (workspace 내)"},
                    "caption": {"type": "string", "description": "파일 설명 (선택)"},
                },
                "required": ["chat_id", "file_path"],
            },
        ),
        Tool(
            name="get_pending_messages",
            description="작업 중 새 메시지가 도착했는지 확인합니다. 장시간 코딩 작업 중 새 지시를 확인할 때 사용하세요.",
            inputSchema={
                "type": "object",
                "properties": {
                    "chat_id": {"type": "integer", "description": "텔레그램 chat_id"},
                },
                "required": ["chat_id"],
            },
        ),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    try:
        result = await _dispatch(name, arguments)
        return [TextContent(type="text", text=json.dumps(result, ensure_ascii=False, default=str))]
    except Exception as e:
        log.error("Tool %s failed: %s", name, e, exc_info=True)
        return [TextContent(type="text", text=json.dumps(
            {"error": "도구 실행 중 내부 오류가 발생했습니다"}, ensure_ascii=False
        ))]


async def _dispatch(name: str, args: dict) -> dict:
    """Route tool calls to implementations."""

    if name == "prepare_context":
        chat_id = args["chat_id"]
        content = args["content"]

        # Run save + history + embedding in parallel
        save_task = db.save_message(
            chat_id=chat_id,
            role="user",
            content=content,
            telegram_message_id=args.get("telegram_message_id"),
        )
        history_task = db.get_recent_messages(chat_id, 24)
        embed_task = emb.generate_embedding(content)
        categories_task = db.get_categories()

        msg, history, vec, categories = await asyncio.gather(
            save_task, history_task, embed_task, categories_task
        )

        # Save embedding if generated
        if vec:
            await db.save_embedding("telegram_messages", msg["id"], vec, emb.get_model_name())

        # Vector search with the embedding
        similar = []
        if vec:
            similar = await db.search_similar(vec)

        # Format history
        formatted_history = []
        for m in history:
            formatted_history.append({
                "role": m["role"],
                "content": m["content"][:500],
                "created_at": m["created_at"],
            })

        # Format categories
        cat_list = [{"id": c["id"], "name": c["name"], "color": c.get("color")} for c in categories]

        return {
            "user_message_id": msg["id"],
            "history": formatted_history,
            "history_count": len(formatted_history),
            "relevant_context": similar[:10],
            "categories": cat_list,
            "has_embedding": vec is not None,
        }

    elif name == "respond_and_classify":
        chat_id = args["chat_id"]
        response_text = args["response_text"]
        message_id = args["message_id"]
        classification = args["classification"]

        # Send telegram message first (user sees response ASAP)
        send_ok = await tg.send_message(chat_id, response_text)

        # Then save + classify + embed in parallel
        save_task = db.save_message(
            chat_id=chat_id,
            role="assistant",
            content=response_text,
        )
        classify_task = db.save_classification(message_id, classification)
        embed_task = emb.generate_embedding(response_text)

        msg, _, vec = await asyncio.gather(save_task, classify_task, embed_task)

        # Save bot response embedding
        if vec:
            await db.save_embedding("telegram_messages", msg["id"], vec, emb.get_model_name())

        return {
            "sent": send_ok,
            "bot_message_id": msg["id"],
            "classified": True,
            "has_embedding": vec is not None,
        }

    elif name == "add_todo":
        category_id = None
        if args.get("category"):
            categories = await db.get_categories()
            for cat in categories:
                if cat["name"] == args["category"]:
                    category_id = cat["id"]
                    break
        todo = await db.add_todo(
            title=args["title"],
            category_id=category_id,
            due_date=args.get("due_date"),
            priority=args.get("priority", 0),
        )
        return {"id": todo["id"], "status": "created"}

    elif name == "get_weather":
        return await _get_weather(args)

    elif name == "web_search":
        return await _web_search(args)

    elif name == "send_progress":
        chat_id = args["chat_id"]
        status = args["status"]
        percent = args.get("percent")
        if percent is not None:
            text = f"\u23f3 [{percent}%] {status}"
        else:
            text = f"\u23f3 {status}"
        sent = await tg.send_message(chat_id, text)
        return {"sent": sent}

    elif name == "send_file":
        chat_id = args["chat_id"]
        file_path = args["file_path"]
        caption = args.get("caption")
        # Security: only allow files under workspace
        resolved = Path(file_path).resolve()
        if not resolved.is_relative_to(WORKSPACE_DIR.resolve()):
            return {"error": f"보안: workspace 외부 파일은 전송할 수 없습니다 ({file_path})"}
        if not resolved.exists():
            return {"error": f"파일을 찾을 수 없습니다: {file_path}"}
        sent = await tg.send_file(chat_id, str(resolved))
        if caption and sent:
            await tg.send_message(chat_id, caption)
        return {"sent": sent, "file": str(resolved)}

    elif name == "get_pending_messages":
        chat_id = args["chat_id"]
        result = await db.get_pending_messages_for_chat(chat_id)
        return {
            "pending_count": len(result),
            "messages": [
                {"content": m["content"], "created_at": m["created_at"]}
                for m in result
            ],
        }

    else:
        return {"error": f"Unknown tool: {name}"}


# ---------------------------------------------------------------------------
# get_weather implementation (Open-Meteo API — free, no API key)
# ---------------------------------------------------------------------------

async def _get_weather(args: dict) -> dict:
    city = args.get("city", "서울").strip()
    coords = _CITY_COORDS.get(city)

    # If not in preset list, try geocoding
    if not coords:
        coords = await _geocode_city(city)
    if not coords:
        return {"error": f"'{city}'의 좌표를 찾을 수 없습니다. 한국 주요 도시명을 입력하세요."}

    lat, lon = coords
    url = (
        f"https://api.open-meteo.com/v1/forecast?"
        f"latitude={lat}&longitude={lon}"
        f"&current=temperature_2m,relative_humidity_2m,apparent_temperature,"
        f"weather_code,wind_speed_10m,precipitation"
        f"&hourly=temperature_2m,precipitation_probability,weather_code"
        f"&forecast_days=2&timezone=Asia/Seoul"
    )

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        data = resp.json()

    current = data["current"]
    hourly = data["hourly"]

    # Build 24-hour forecast (next 24 entries from current hour)
    from datetime import datetime
    now_hour = datetime.now().hour
    forecast_24h = []
    for i in range(now_hour, min(now_hour + 24, len(hourly["time"]))):
        forecast_24h.append({
            "time": hourly["time"][i],
            "temp": hourly["temperature_2m"][i],
            "rain_prob": hourly["precipitation_probability"][i],
            "weather": _WEATHER_CODES.get(hourly["weather_code"][i], "알 수 없음"),
        })

    return {
        "city": city,
        "current": {
            "temperature": f"{current['temperature_2m']}°C",
            "feels_like": f"{current['apparent_temperature']}°C",
            "humidity": f"{current['relative_humidity_2m']}%",
            "wind_speed": f"{current['wind_speed_10m']}km/h",
            "precipitation": f"{current.get('precipitation', 0)}mm",
            "weather": _WEATHER_CODES.get(current["weather_code"], "알 수 없음"),
        },
        "forecast_24h": forecast_24h[:12],  # 12시간만 전달 (토큰 절약)
    }


async def _geocode_city(city: str) -> tuple[float, float] | None:
    url = "https://geocoding-api.open-meteo.com/v1/search"
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(url, params={"name": city, "count": 1, "language": "ko"})
            data = resp.json()
            if data.get("results"):
                r = data["results"][0]
                return (r["latitude"], r["longitude"])
    except Exception:
        pass
    return None


# ---------------------------------------------------------------------------
# web_search implementation (DuckDuckGo)
# ---------------------------------------------------------------------------

async def _web_search(args: dict) -> dict:
    query = args["query"]
    max_results = min(args.get("max_results", 5), 10)

    try:
        from duckduckgo_search import DDGS
        results = await asyncio.to_thread(
            lambda: list(DDGS().text(query, max_results=max_results))
        )
        return {
            "query": query,
            "results": [
                {"title": r["title"], "url": r["href"], "snippet": r["body"]}
                for r in results
            ],
            "count": len(results),
        }
    except Exception as e:
        log.error("Web search failed: %s", e)
        return {"error": f"검색 실패: {str(e)}", "query": query}


async def main():
    require_env()
    log.info("Starting MCP server...")
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(main())

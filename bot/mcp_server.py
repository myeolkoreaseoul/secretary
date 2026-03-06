"""MCP Server — exposes tools for Claude CLI to call.

Claude connects to this server via JSON-RPC (stdio transport).
Only explicitly registered functions are callable — no arbitrary code execution.

Optimized for minimal round-trips: 2 main tools instead of 8.
"""

import asyncio
import json
import logging
import re
import sys
from datetime import datetime, timedelta, timezone

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
from bot.config import require_env, TELEGRAM_ALLOWED_USERS

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
            description="할일을 추가합니다. 플래닝 시 estimated_minutes와 time_hint도 함께 설정하세요.",
            inputSchema={
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "할일 제목"},
                    "category": {"type": "string", "description": "카테고리명 (선택)"},
                    "due_date": {"type": "string", "description": "마감일 YYYY-MM-DD (선택)"},
                    "priority": {"type": "integer", "description": "우선순위 0~5 (기본: 0)"},
                    "estimated_minutes": {"type": "integer", "description": "예상 소요시간(분). AI가 추정 (선택)"},
                    "time_hint": {"type": "string", "description": "시간 힌트: '오전', '15:00', '점심 후' 등 (선택)"},
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
        Tool(
            name="get_daily_plan",
            description="오늘(또는 지정 날짜)의 계획, 할일, 어제 리뷰를 조회합니다. 플래닝 시 가장 먼저 호출하세요.",
            inputSchema={
                "type": "object",
                "properties": {
                    "date": {"type": "string", "description": "날짜 YYYY-MM-DD (기본: 오늘)"},
                },
                "required": [],
            },
        ),
        Tool(
            name="save_daily_plan",
            description="AI가 생성한 시간표를 저장합니다. 타임블록 배치가 완료되면 호출하세요.",
            inputSchema={
                "type": "object",
                "properties": {
                    "date": {"type": "string", "description": "날짜 YYYY-MM-DD"},
                    "plan": {
                        "type": "array",
                        "description": "타임블록 배열 [{start, end, task, category, priority}]",
                        "items": {
                            "type": "object",
                            "properties": {
                                "start": {"type": "string", "description": "시작 HH:MM"},
                                "end": {"type": "string", "description": "종료 HH:MM"},
                                "task": {"type": "string", "description": "할일 내용"},
                                "category": {"type": "string", "description": "카테고리"},
                                "priority": {"type": "integer", "description": "우선순위 0~3"},
                            },
                            "required": ["start", "end", "task"],
                        },
                    },
                    "plan_text": {"type": "string", "description": "오늘의 핵심 목표 한줄 요약"},
                },
                "required": ["date", "plan"],
            },
        ),
        Tool(
            name="update_plan_block",
            description="기존 계획의 특정 블록을 수정/삭제/삽입합니다. 수시 변경에 사용하세요.",
            inputSchema={
                "type": "object",
                "properties": {
                    "date": {"type": "string", "description": "날짜 YYYY-MM-DD (기본: 오늘)"},
                    "action": {
                        "type": "string",
                        "enum": ["delete", "update", "insert"],
                        "description": "delete: 블록 삭제, update: 블록 수정, insert: 새 블록 삽입",
                    },
                    "target_start": {"type": "string", "description": "대상 블록의 시작 시간 HH:MM (delete/update 시 필수)"},
                    "block": {
                        "type": "object",
                        "description": "새/수정 블록 {start, end, task, category, priority} (update/insert 시 필수)",
                        "properties": {
                            "start": {"type": "string"},
                            "end": {"type": "string"},
                            "task": {"type": "string"},
                            "category": {"type": "string"},
                            "priority": {"type": "integer"},
                        },
                    },
                },
                "required": ["action"],
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


def _validate_chat_id(chat_id: int) -> bool:
    """Verify chat_id is in the allowed users list."""
    if not TELEGRAM_ALLOWED_USERS:
        return True  # No whitelist configured — allow (bot.config handles this)
    return chat_id in TELEGRAM_ALLOWED_USERS


async def _dispatch(name: str, args: dict) -> dict:
    """Route tool calls to implementations."""

    # Validate chat_id for all tools that accept it
    if "chat_id" in args:
        chat_id_val = args["chat_id"]
        if isinstance(chat_id_val, int) and not _validate_chat_id(chat_id_val):
            log.warning("MCP tool %s rejected: unauthorized chat_id=%s", name, chat_id_val)
            return {"error": "unauthorized"}

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
            estimated_minutes=args.get("estimated_minutes"),
            time_hint=args.get("time_hint"),
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

    elif name == "get_daily_plan":
        return await _get_daily_plan(args)

    elif name == "save_daily_plan":
        return await _save_daily_plan(args)

    elif name == "update_plan_block":
        return await _update_plan_block(args)

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
        return {"error": "검색 중 오류가 발생했습니다", "query": query}


# ---------------------------------------------------------------------------
# Daily Plan tools
# ---------------------------------------------------------------------------

# Fixed time blocks — these NEVER move
FIXED_BLOCKS = [
    {"start": "09:00", "end": "09:30", "task": "아침식사", "category": "식사", "type": "fixed"},
    {"start": "12:00", "end": "13:00", "task": "점심", "category": "식사", "type": "fixed"},
    {"start": "15:00", "end": "15:20", "task": "간식", "category": "식사", "type": "fixed"},
    {"start": "18:00", "end": "18:30", "task": "저녁", "category": "식사", "type": "fixed"},
    {"start": "19:00", "end": "20:00", "task": "팀버핏", "category": "운동", "type": "fixed"},
]

FIXED_START_TIMES = {b["start"] for b in FIXED_BLOCKS}

_TIME_RE = re.compile(r"^\d{2}:\d{2}$")
_KST = timezone(timedelta(hours=9))


async def _get_daily_plan(args: dict) -> dict:
    kst = _KST
    date_str = args.get("date") or datetime.now(kst).strftime("%Y-%m-%d")
    yesterday = (datetime.strptime(date_str, "%Y-%m-%d") - timedelta(days=1)).strftime("%Y-%m-%d")

    # Fetch today's report, yesterday's report, and todos in parallel
    today_task = db._request("GET", f"daily_reports_v2?report_date=eq.{date_str}&select=stats,content")
    yesterday_task = db._request("GET", f"daily_reports_v2?report_date=eq.{yesterday}&select=stats")
    todos_task = db._request(
        "GET",
        "todos?is_done=eq.false&select=id,title,priority,due_date,estimated_minutes,time_hint&order=priority.desc,created_at.asc",
    )

    today_data, yesterday_data, todos = await asyncio.gather(
        today_task, yesterday_task, todos_task
    )

    today_data = today_data or []
    yesterday_data = yesterday_data or []
    todos = todos or []

    # Extract plan from today's stats
    today_stats = today_data[0]["stats"] if today_data else {}
    plan = today_stats.get("plan", []) if today_stats else []
    plan_text = today_stats.get("plan_text", "") if today_stats else ""

    # Extract yesterday's review
    yesterday_stats = yesterday_data[0]["stats"] if yesterday_data else {}
    yesterday_review = yesterday_stats.get("review", {}) if yesterday_stats else {}

    # Filter todos for today (due today, overdue, or no due date)
    relevant_todos = [
        t for t in todos
        if not t.get("due_date") or t["due_date"] <= date_str
    ]

    return {
        "date": date_str,
        "plan": plan,
        "plan_text": plan_text,
        "fixed_blocks": FIXED_BLOCKS,
        "todos": relevant_todos,
        "yesterday_review": yesterday_review,
    }


async def _save_daily_plan(args: dict) -> dict:
    date_str = args["date"]
    plan = args["plan"]
    # Defend against Claude sending plan as JSON string instead of list
    if isinstance(plan, str):
        try:
            plan = json.loads(plan)
        except (json.JSONDecodeError, TypeError):
            plan = []
    if not isinstance(plan, list):
        plan = []
    plan_text = args.get("plan_text", "")

    # Get existing stats to merge
    existing = await db._request("GET", f"daily_reports_v2?report_date=eq.{date_str}&select=stats")
    existing = existing or []
    existing_stats = existing[0]["stats"] if existing else {}
    if not existing_stats:
        existing_stats = {}

    # Merge plan into stats (preserve other fields like actual, review)
    new_stats = {**existing_stats, "plan": plan, "plan_text": plan_text, "fixed_blocks": FIXED_BLOCKS}

    if existing:
        # Row exists — PATCH
        await db._request(
            "PATCH",
            f"daily_reports_v2?report_date=eq.{date_str}",
            json_body={"stats": new_stats},
        )
    else:
        # New date — POST
        await db._request(
            "POST",
            "daily_reports_v2",
            json_body={"report_date": date_str, "stats": new_stats},
            headers={"Prefer": "return=minimal"},
        )

    return {"saved": True, "date": date_str, "block_count": len(plan)}


async def _update_plan_block(args: dict) -> dict:
    date_str = args.get("date") or datetime.now(_KST).strftime("%Y-%m-%d")
    action = args["action"]
    target_start = args.get("target_start")
    block = args.get("block")

    # Load current plan
    existing = await db._request("GET", f"daily_reports_v2?report_date=eq.{date_str}&select=stats")
    existing = existing or []
    existing_stats = existing[0]["stats"] if existing else {}
    if not existing_stats:
        existing_stats = {}
    plan = existing_stats.get("plan", [])
    if isinstance(plan, str):
        try:
            plan = json.loads(plan)
        except (json.JSONDecodeError, TypeError):
            plan = []
    if not isinstance(plan, list):
        plan = []
    plan = list(plan)

    if action == "delete":
        if not target_start:
            return {"error": "delete에는 target_start가 필요합니다"}
        if target_start in FIXED_START_TIMES:
            return {"error": f"고정 블록({target_start})은 삭제할 수 없습니다"}
        before = len(plan)
        plan = [b for b in plan if b.get("start") != target_start]
        if len(plan) == before:
            return {"error": f"{target_start} 시작 블록을 찾을 수 없습니다"}

    elif action == "update":
        if not target_start or not block:
            return {"error": "update에는 target_start와 block이 필요합니다"}
        if target_start in FIXED_START_TIMES:
            return {"error": f"고정 블록({target_start})은 수정할 수 없습니다"}
        found = False
        for i, b in enumerate(plan):
            if b.get("start") == target_start:
                plan[i] = {**b, **block}
                found = True
                break
        if not found:
            return {"error": f"{target_start} 시작 블록을 찾을 수 없습니다"}

    elif action == "insert":
        if not block or not block.get("start") or not block.get("end") or not block.get("task"):
            return {"error": "insert에는 block(start, end, task 포함)이 필요합니다"}
        # Validate time format
        new_start = block["start"]
        new_end = block["end"]
        if not _TIME_RE.match(new_start) or not _TIME_RE.match(new_end):
            return {"error": "시간은 HH:MM 형식이어야 합니다 (예: 09:30)"}
        # Check fixed block collision
        for fb in FIXED_BLOCKS:
            if new_start < fb["end"] and new_end > fb["start"]:
                return {"error": f"고정 블록({fb['start']}~{fb['end']} {fb['task']})과 겹칩니다"}
        plan.append(block)

    else:
        return {"error": f"알 수 없는 action: {action}. delete/update/insert 중 하나를 사용하세요"}

    # Sort by start time
    plan.sort(key=lambda b: b.get("start", ""))

    # Save back (preserve existing stats fields)
    new_stats = {**existing_stats, "plan": plan}

    if existing:
        # Row exists — PATCH
        await db._request(
            "PATCH",
            f"daily_reports_v2?report_date=eq.{date_str}",
            json_body={"stats": new_stats},
        )
    else:
        # No row yet — POST (upsert)
        await db._request(
            "POST",
            "daily_reports_v2",
            json_body={"report_date": date_str, "stats": new_stats},
            headers={"Prefer": "return=minimal,resolution=merge-duplicates"},
        )

    return {"updated": True, "action": action, "date": date_str, "block_count": len(plan)}


async def main():
    require_env()
    log.info("Starting MCP server...")
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(main())

"""Daily work summary generator.

Runs via cron at midnight KST (15:00 UTC).
Gathers yesterday's ai_conversations + ai_messages,
generates a summary via Haiku (OAuth), saves to daily_reports_v2,
sends to Telegram, and uploads to Notion.

Usage:
    python3 -m scripts.daily_work_summary              # yesterday
    python3 -m scripts.daily_work_summary --date 2026-03-10  # specific date
"""

import argparse
import asyncio
import json
import logging
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from bot.config import (
    SUPABASE_HEADERS,
    SUPABASE_REST_URL,
    TELEGRAM_ALLOWED_USERS,
)
from bot import telegram_sender as tg

import httpx

# GPT 시크릿키 (Codex OAuth)
CODEX_AUTH_PATH = Path.home() / ".codex" / "auth.json"
GPT_URL = "https://chatgpt.com/backend-api/codex/responses"


def _load_gpt_token() -> str:
    data = json.loads(CODEX_AUTH_PATH.read_text())
    return data["tokens"]["access_token"]


async def _refresh_gpt_token() -> str:
    data = json.loads(CODEX_AUTH_PATH.read_text())
    async with httpx.AsyncClient() as c:
        resp = await c.post(
            "https://auth.openai.com/oauth/token",
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            data={
                "grant_type": "refresh_token",
                "refresh_token": data["tokens"]["refresh_token"],
                "client_id": "app_EMoamEEZ73f0CkXaXp7hrann",
                "scope": "openid profile email offline_access api.connectors.read api.connectors.invoke",
            },
        )
        resp.raise_for_status()
        new = resp.json()
    data["tokens"]["access_token"] = new["access_token"]
    if "refresh_token" in new:
        data["tokens"]["refresh_token"] = new["refresh_token"]
    CODEX_AUTH_PATH.write_text(json.dumps(data, indent=2))
    log.info("Refreshed GPT token")
    return new["access_token"]


async def _call_gpt(token: str, instruction: str, user_msg: str) -> str:
    body = {
        "model": "gpt-5.4",
        "instructions": instruction,
        "input": [{"type": "message", "role": "user", "content": user_msg}],
        "store": False,
        "stream": True,
    }
    full = ""
    async with httpx.AsyncClient(timeout=60) as c:
        async with c.stream("POST", GPT_URL, headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }, json=body) as resp:
            if resp.status_code == 401:
                raise PermissionError("Token expired")
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if line.startswith("data: "):
                    ds = line[6:]
                    if ds == "[DONE]":
                        break
                    try:
                        d = json.loads(ds)
                        if d.get("type") == "response.output_text.delta":
                            full += d.get("delta", "")
                    except json.JSONDecodeError:
                        pass
    return full.strip()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
log = logging.getLogger("daily_work_summary")

KST = timezone(timedelta(hours=9))

# Notion page IDs
NOTION_WORK_LOG_ID = "31aa8c7e-ea73-8187-9e85-ca71e5d6e52f"
NOTION_CLI = Path.home() / "bin" / "notion-cli"

# Token limits per conversation
MAX_USER_MESSAGES = 5
MAX_CHARS_PER_MESSAGE = 500

# Project path → display name mapping
PROJECT_NAMES = {
    "jd-platform": "jd-platform",
    "tessera": "tessera",
    "sangsi-checker": "sangsi-checker",
    "rnd-audit-tool": "rnd-audit-tool",
    "jd-audit-portal": "jd-audit-portal",
    "userguide-demo": "jd-audit-portal",
    "svvys": "svvys",
    "secretary": "secretary",
    "scouter": "scouter",
    "youtube-digest": "youtube-digest",
    "settlement-qna": "settlement-qna",
}


def extract_project_name(project_path: str | None) -> str:
    """Extract a short project name from a full path."""
    if not project_path:
        return "unknown"
    path = project_path.rstrip("/")
    name = path.split("/")[-1]
    return PROJECT_NAMES.get(name, name)


async def fetch_conversations(client: httpx.AsyncClient, date_str: str) -> list[dict]:
    """Fetch ai_conversations for a specific date (KST).

    Only includes claude_code and codex providers (excludes gemini_cli,
    gateway_* etc. which are pipeline API calls, not coding sessions).
    """
    start = f"{date_str}T00:00:00+09:00"
    end = f"{date_str}T23:59:59+09:00"
    resp = await client.get(
        f"{SUPABASE_REST_URL}/ai_conversations",
        headers=SUPABASE_HEADERS,
        params={
            "select": "id,provider,project_path,title,model,started_at,ended_at,message_count",
            "provider": "in.(claude_code,codex)",
            "started_at": f"gte.{start}",
            "and": f"(started_at.lte.{end})",
            "order": "started_at.asc",
        },
    )
    resp.raise_for_status()
    return resp.json()


async def fetch_messages_for_conversation(
    client: httpx.AsyncClient, conv_id: str
) -> list[dict]:
    """Fetch user + assistant messages for a conversation (limited)."""
    resp = await client.get(
        f"{SUPABASE_REST_URL}/ai_messages",
        headers=SUPABASE_HEADERS,
        params={
            "select": "role,content,message_at",
            "conversation_id": f"eq.{conv_id}",
            "role": "in.(user,assistant)",
            "order": "message_at.asc",
            "limit": str(MAX_USER_MESSAGES * 2),
        },
    )
    resp.raise_for_status()
    return resp.json()


def build_conversation_context(
    conversations: list[dict], messages_by_conv: dict[str, list[dict]]
) -> dict[str, list[dict]]:
    """Group conversations by project with their messages."""
    projects: dict[str, list[dict]] = {}
    for conv in conversations:
        project = extract_project_name(conv.get("project_path"))
        if project not in projects:
            projects[project] = []

        user_msgs = []
        for msg in messages_by_conv.get(conv["id"], []):
            if msg["role"] == "user" and msg.get("content"):
                content = msg["content"][:MAX_CHARS_PER_MESSAGE]
                user_msgs.append(content)
                if len(user_msgs) >= MAX_USER_MESSAGES:
                    break

        projects[project].append({
            "title": conv.get("title", ""),
            "model": conv.get("model", ""),
            "message_count": conv.get("message_count", 0),
            "user_messages": user_msgs,
        })
    return projects


async def generate_summary_via_gpt(
    date_str: str, projects: dict[str, list[dict]]
) -> str | None:
    """Call GPT-5.4 via 시크릿키 to generate a work summary."""
    context_parts = []
    for project, convs in projects.items():
        context_parts.append(f"\n[{project}] {len(convs)}개 세션:")
        for c in convs:
            context_parts.append(f"  - 제목: {c['title']}")
            if c["user_messages"]:
                for i, msg in enumerate(c["user_messages"], 1):
                    context_parts.append(f"    사용자 메시지 {i}: {msg}")

    context = "\n".join(context_parts)

    instruction = (
        "코딩 작업 일일 요약을 작성하는 전문가입니다.\n"
        "요구사항:\n"
        "- 프로젝트별로 핵심 작업만 간결하게 정리 (각 1-2줄)\n"
        "- 마크다운 없이 텔레그램에서 읽기 쉬운 일반 텍스트\n"
        "- 기술적 세부사항보다 '무엇을 했는지'에 초점\n"
        "- 각 프로젝트는 [프로젝트명] N 세션 형태로 시작\n"
        "- 마지막에 총 세션 수 표시"
    )

    user_msg = f"{date_str} 코딩 작업 요약을 작성하세요.\n\n세션 목록:\n{context}"

    token = _load_gpt_token()
    try:
        return await _call_gpt(token, instruction, user_msg)
    except PermissionError:
        token = await _refresh_gpt_token()
        return await _call_gpt(token, instruction, user_msg)
    except Exception as e:
        log.error("GPT API error: %s", e)
        return None


def generate_fallback_summary(
    date_str: str, projects: dict[str, list[dict]]
) -> str:
    """Generate a simple summary without AI."""
    lines = [f"\U0001f4cb {date_str} 작업 요약\n"]
    total = 0
    for project, convs in sorted(projects.items()):
        n = len(convs)
        total += n
        lines.append(f"[{project}] {n} 세션")
        for c in convs:
            if c["title"]:
                lines.append(f"- {c['title']}")
        lines.append("")
    lines.append(f"총 {total}세션")
    return "\n".join(lines)


async def save_to_db(
    client: httpx.AsyncClient, date_str: str, content: str, projects: dict
):
    """Save work summary to daily_reports_v2 (append to existing or create)."""
    resp = await client.get(
        f"{SUPABASE_REST_URL}/daily_reports_v2",
        headers=SUPABASE_HEADERS,
        params={"report_date": f"eq.{date_str}", "select": "id,content"},
    )
    resp.raise_for_status()
    existing = resp.json()

    session_count = sum(len(convs) for convs in projects.values())
    stats = {
        "coding_sessions": session_count,
        "projects": list(projects.keys()),
    }

    if existing:
        # Append work summary to existing report
        old_content = existing[0].get("content", "")
        merged = f"{old_content}\n\n---\n\n{content}" if old_content else content
        resp = await client.patch(
            f"{SUPABASE_REST_URL}/daily_reports_v2",
            headers={**SUPABASE_HEADERS, "Prefer": "return=representation"},
            params={"report_date": f"eq.{date_str}"},
            json={"content": merged, "stats": stats},
        )
    else:
        resp = await client.post(
            f"{SUPABASE_REST_URL}/daily_reports_v2",
            headers={
                **SUPABASE_HEADERS,
                "Prefer": "resolution=merge-duplicates,return=representation",
            },
            json={
                "report_date": date_str,
                "content": content,
                "stats": stats,
            },
        )
    return resp.status_code < 300


def upload_to_notion(date_str: str, content: str) -> bool:
    """Create a page under 작업로그 in Notion."""
    if not NOTION_CLI.exists():
        log.warning("notion-cli not found at %s", NOTION_CLI)
        return False

    # Create page
    page_body = json.dumps({
        "parent": {"page_id": NOTION_WORK_LOG_ID},
        "icon": {"type": "emoji", "emoji": "\U0001f4cb"},
        "properties": {
            "title": {
                "title": [{"text": {"content": f"{date_str} 작업 요약"}}]
            }
        },
    })

    try:
        result = subprocess.run(
            [str(NOTION_CLI), "create-page", page_body],
            capture_output=True, text=True, timeout=30,
        )
        if result.returncode != 0:
            log.error("Notion create-page failed: %s", result.stderr[:200])
            return False

        page_data = json.loads(result.stdout)
        page_id = page_data.get("id", "")
        if not page_id:
            log.error("No page ID returned from Notion")
            return False

        # Append content as blocks (Notion API limit: 100 blocks per request)
        blocks = []
        for line in content.split("\n"):
            if not line.strip():
                continue
            # Notion rich_text content limit: 2000 chars
            line = line[:2000]
            blocks.append({
                "object": "block",
                "type": "paragraph",
                "paragraph": {
                    "rich_text": [{"type": "text", "text": {"content": line}}]
                },
            })

        # Send in chunks of 100 blocks
        for i in range(0, len(blocks), 100):
            chunk = blocks[i:i + 100]
            blocks_body = json.dumps({"children": chunk})
            subprocess.run(
                [str(NOTION_CLI), "append-blocks", page_id, blocks_body],
                capture_output=True, text=True, timeout=30,
            )

        log.info("Notion page created: %s", page_id)
        return True
    except Exception as e:
        log.error("Notion upload error: %s", e)
        return False


async def run(date_str: str, skip_telegram: bool = False, skip_notion: bool = False):
    """Main pipeline for a single date."""
    log.info("Generating work summary for %s", date_str)

    async with httpx.AsyncClient(timeout=30.0) as client:
        # 1. Fetch conversations
        conversations = await fetch_conversations(client, date_str)
        if not conversations:
            log.info("No AI conversations for %s, skipping", date_str)
            return None

        log.info("Found %d conversations for %s", len(conversations), date_str)

        # 2. Fetch messages for each conversation
        messages_by_conv: dict[str, list[dict]] = {}
        for conv in conversations:
            msgs = await fetch_messages_for_conversation(client, conv["id"])
            messages_by_conv[conv["id"]] = msgs

        # 3. Group by project
        projects = build_conversation_context(conversations, messages_by_conv)

        # 4. Generate summary via GPT
        summary = await generate_summary_via_gpt(date_str, projects)
        if not summary:
            summary = generate_fallback_summary(date_str, projects)
        else:
            summary = f"\U0001f4cb {date_str} 작업 요약\n\n{summary}"

        # 5. Save to DB
        saved = await save_to_db(client, date_str, summary, projects)
        if saved:
            log.info("Work summary saved to DB for %s", date_str)
        else:
            log.error("Failed to save work summary to DB")

        # 6. Send to Telegram
        if not skip_telegram:
            for chat_id in TELEGRAM_ALLOWED_USERS:
                await tg.send_message(chat_id, summary, parse_mode=None)
                log.info("Work summary sent to chat_id=%s", chat_id)

        # 7. Upload to Notion
        if not skip_notion:
            upload_to_notion(date_str, summary)

        return summary


async def main():
    parser = argparse.ArgumentParser(description="Daily work summary generator")
    parser.add_argument(
        "--date",
        help="Target date (YYYY-MM-DD). Default: yesterday KST.",
    )
    parser.add_argument(
        "--skip-telegram", action="store_true",
        help="Skip Telegram notification",
    )
    parser.add_argument(
        "--skip-notion", action="store_true",
        help="Skip Notion upload",
    )
    args = parser.parse_args()

    if args.date:
        date_str = args.date
    else:
        yesterday = datetime.now(KST) - timedelta(days=1)
        date_str = yesterday.strftime("%Y-%m-%d")

    await run(date_str, skip_telegram=args.skip_telegram, skip_notion=args.skip_notion)


if __name__ == "__main__":
    asyncio.run(main())

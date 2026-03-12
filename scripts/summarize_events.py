"""Summarize activity_events titles using GPT 시크릿키 (Codex OAuth).

Reads conversations' messages, calls GPT-5.4 via chatgpt.com backend API
to generate 1-line summaries, then updates activity_events titles.

Usage:
    python3 -m scripts.summarize_events               # summarize events with bad titles
    python3 -m scripts.summarize_events --all          # re-summarize all events
    python3 -m scripts.summarize_events --dry-run      # preview without updating
"""

import asyncio
import argparse
import json
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from bot.config import SUPABASE_REST_URL, SUPABASE_HEADERS

import httpx

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
log = logging.getLogger("summarize_events")

CODEX_AUTH_PATH = Path.home() / ".codex" / "auth.json"
GPT_URL = "https://chatgpt.com/backend-api/codex/responses"

# Patterns that indicate a bad/generic title needing summary
BAD_TITLE_PATTERNS = [
    "코딩 세션",
    "Implement the following plan",
    "Explore the",
    "This session is being continued",
    "I need to",
    "(continued)",
]


def load_gpt_token() -> str:
    """Load access_token from Codex auth.json."""
    data = json.loads(CODEX_AUTH_PATH.read_text())
    return data["tokens"]["access_token"]


async def refresh_gpt_token() -> str:
    """Refresh the Codex OAuth token."""
    data = json.loads(CODEX_AUTH_PATH.read_text())
    refresh_token = data["tokens"]["refresh_token"]

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://auth.openai.com/oauth/token",
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            data={
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
                "client_id": "app_EMoamEEZ73f0CkXaXp7hrann",
                "scope": "openid profile email offline_access api.connectors.read api.connectors.invoke",
            },
        )
        resp.raise_for_status()
        new_tokens = resp.json()

    # Update auth.json
    data["tokens"]["access_token"] = new_tokens["access_token"]
    if "refresh_token" in new_tokens:
        data["tokens"]["refresh_token"] = new_tokens["refresh_token"]
    if "id_token" in new_tokens:
        data["tokens"]["id_token"] = new_tokens["id_token"]
    CODEX_AUTH_PATH.write_text(json.dumps(data, indent=2))
    log.info("Refreshed GPT token")
    return new_tokens["access_token"]


async def call_gpt(token: str, instruction: str, user_msg: str) -> str:
    """Call GPT-5.4 via Codex backend API (streaming required)."""
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    body = {
        "model": "gpt-5.4",
        "instructions": instruction,
        "input": [{"type": "message", "role": "user", "content": user_msg}],
        "store": False,
        "stream": True,
    }

    full_text = ""
    async with httpx.AsyncClient(timeout=60) as client:
        async with client.stream("POST", GPT_URL, headers=headers, json=body) as resp:
            if resp.status_code == 401:
                raise PermissionError("Token expired")
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if line.startswith("data: "):
                    data_str = line[6:]
                    if data_str == "[DONE]":
                        break
                    try:
                        data = json.loads(data_str)
                        if data.get("type") == "response.output_text.delta":
                            full_text += data.get("delta", "")
                    except json.JSONDecodeError:
                        pass

    return full_text.strip()


async def fetch_events_to_summarize(client: httpx.AsyncClient, all_events: bool) -> list[dict]:
    """Fetch activity_events that need summarization."""
    params = {
        "select": "id,title,metadata,started_at,duration_minutes",
        "source": "eq.ai_coding",
        "order": "started_at.desc",
    }

    if not all_events:
        # Fetch events with bad titles OR unknown project
        or_filters = [f"title.ilike.%{p}%" for p in BAD_TITLE_PATTERNS]
        or_filters.append("title.ilike.%[unknown]%")
        params["or"] = f"({','.join(or_filters)})"

    all_rows = []
    offset = 0
    while True:
        paged = {**params, "limit": "200", "offset": str(offset)}
        resp = await client.get(
            f"{SUPABASE_REST_URL}/activity_events",
            headers=SUPABASE_HEADERS,
            params=paged,
        )
        resp.raise_for_status()
        rows = resp.json()
        all_rows.extend(rows)
        if len(rows) < 200:
            break
        offset += 200

    return all_rows


async def fetch_conversation_messages(client: httpx.AsyncClient, conv_id: str) -> list[dict]:
    """Fetch user messages from a conversation for context."""
    resp = await client.get(
        f"{SUPABASE_REST_URL}/ai_messages",
        headers=SUPABASE_HEADERS,
        params={
            "select": "role,content",
            "conversation_id": f"eq.{conv_id}",
            "role": "eq.user",
            "order": "created_at.asc",
            "limit": "6",
        },
    )
    resp.raise_for_status()
    return resp.json()


async def update_event(client: httpx.AsyncClient, event_id: str, new_title: str, metadata: dict | None = None):
    """Update activity_event title and optionally metadata."""
    body: dict = {"title": new_title}
    if metadata:
        body["metadata"] = metadata
    resp = await client.patch(
        f"{SUPABASE_REST_URL}/activity_events",
        headers={**SUPABASE_HEADERS, "Prefer": "return=minimal"},
        params={"id": f"eq.{event_id}"},
        json=body,
    )
    resp.raise_for_status()


KNOWN_PROJECTS = [
    "jd-platform", "tessera", "sangsi-checker", "rnd-audit-tool",
    "jd-audit-portal", "svvys", "secretary", "scouter",
    "youtube-digest", "settlement-qna",
]

SUMMARY_INSTRUCTION = """You are a work log summarizer and project classifier.

Given a coding session's user messages, produce:
1. **project**: classify into one of the known projects, or "기타" if none match
2. **title**: a concise Korean summary (1 line, max 60 chars) of what was accomplished

Known projects: """ + ", ".join(KNOWN_PROJECTS) + """

Rules:
- Write title in Korean
- Focus on WHAT was done, not the commands given
- If it's about fixing a bug, say what bug
- If it's about building a feature, say what feature
- Do NOT include project names in the title (they're added as prefix)
- Do NOT include timestamps or duration
- Do NOT start with "코딩 세션" or generic words
- For project classification: look at file paths, imports, domain keywords, table names
  - "settlement-qna", "정산", "QnA 시스템" → settlement-qna
  - "tessera", "정산검토", "RPA" → tessera
  - "secretary", "비서", "time page", "telegram bot" → secretary
  - "jd-platform", "PMS", "R&D" → jd-platform
  - "scouter", "트렌드", "뉴스" → scouter
  - "youtube", "digest", "yt-" → youtube-digest
  - If truly unclear, use "기타"

Output ONLY valid JSON: {"project": "...", "title": "..."}
"""


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--all", action="store_true", help="Re-summarize all events")
    parser.add_argument("--dry-run", action="store_true", help="Preview without updating")
    parser.add_argument("--limit", type=int, default=0, help="Max events to process")
    args = parser.parse_args()

    token = load_gpt_token()

    async with httpx.AsyncClient(timeout=30) as client:
        events = await fetch_events_to_summarize(client, args.all)
        if args.limit > 0:
            events = events[:args.limit]

        log.info("Found %d events to summarize", len(events))

        if not events:
            return

        updated = 0
        errors = 0

        for i, event in enumerate(events):
            metadata = event.get("metadata") or {}
            ref_id = metadata.get("ref_id")
            project = metadata.get("project", "unknown")

            if not ref_id:
                log.warning("Event %s has no ref_id, skipping", event["id"])
                continue

            # Fetch conversation messages
            messages = await fetch_conversation_messages(client, ref_id)
            if not messages:
                log.warning("No messages for conv %s, skipping", ref_id)
                continue

            # Build context for GPT
            user_texts = []
            for msg in messages:
                content = (msg.get("content") or "").strip()
                if content and len(content) > 5:
                    # Truncate each message
                    user_texts.append(content[:500])

            if not user_texts:
                continue

            proj_hint = f"프로젝트: {project}" if project != "unknown" else "프로젝트: 미분류 (분류 필요)"
            context = f"{proj_hint}\n세션 길이: {event.get('duration_minutes', 0)}분\n\n사용자 메시지:\n"
            context += "\n---\n".join(user_texts[:5])

            # Call GPT
            try:
                summary = await call_gpt(token, SUMMARY_INSTRUCTION, context)
            except PermissionError:
                log.info("Token expired, refreshing...")
                token = await refresh_gpt_token()
                summary = await call_gpt(token, SUMMARY_INSTRUCTION, context)
            except Exception as e:
                log.error("GPT call failed for %s: %s", event["id"], e)
                errors += 1
                if errors > 5:
                    log.error("Too many errors, stopping")
                    break
                continue

            if not summary or len(summary) < 3:
                continue

            # Parse JSON response from GPT
            classified_project = project
            clean_title = summary.strip()
            try:
                # Try to extract JSON
                json_match = clean_title
                if "{" in clean_title:
                    json_match = clean_title[clean_title.index("{"):clean_title.rindex("}") + 1]
                parsed = json.loads(json_match)
                classified_project = parsed.get("project", project)
                clean_title = parsed.get("title", "")
            except (json.JSONDecodeError, ValueError):
                # Fallback: treat entire response as title
                clean_title = clean_title.strip('"').strip("'")

            if not clean_title or len(clean_title) < 3:
                continue

            if len(clean_title) > 80:
                clean_title = clean_title[:77] + "..."

            # Validate project
            if classified_project not in KNOWN_PROJECTS and classified_project != "기타":
                classified_project = project  # keep original if GPT hallucinated

            new_title = f"[{classified_project}] {clean_title}"

            # Update metadata if project changed from unknown
            updated_metadata = None
            if project == "unknown" and classified_project != "unknown":
                updated_metadata = {**metadata, "project": classified_project}

            if args.dry_run:
                proj_change = f" ({project}→{classified_project})" if classified_project != project else ""
                log.info("[DRY] %s → %s%s", event["title"][:40], new_title, proj_change)
            else:
                await update_event(client, event["id"], new_title, updated_metadata)
                log.info("[%d/%d] %s", i + 1, len(events), new_title)
                updated += 1

            # Rate limit: small delay between GPT calls
            await asyncio.sleep(0.5)

        log.info("Done. Updated: %d, Errors: %d", updated, errors)


if __name__ == "__main__":
    asyncio.run(main())

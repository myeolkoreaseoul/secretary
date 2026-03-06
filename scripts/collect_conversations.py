"""AI CLI 대화 수집 데몬.

CLI 대화 파일(Claude Code, Codex, Gemini)을 파싱하여 Supabase에 동기화.
10분마다 systemd timer로 실행.

사용법:
  python -m scripts.collect_conversations [--dry-run] [--provider claude_code|codex|gemini_cli]
"""

from __future__ import annotations

import argparse
import asyncio
import fcntl
import logging
import sys
from pathlib import Path

import httpx

# bot/config.py의 설정을 재사용
sys.path.insert(0, str(Path(__file__).parent.parent))
from bot.config import SUPABASE_REST_URL, SUPABASE_HEADERS, SUPABASE_URL, SUPABASE_SERVICE_KEY

from scripts.collectors import ParsedConversation
from scripts.collectors import claude_code, codex_cli, gemini_cli

logger = logging.getLogger("collector")

LOCK_FILE = Path(__file__).parent / ".collect_conversations.lock"
BATCH_SIZE = 10  # 한 번에 처리할 대화 수
MSG_BATCH_SIZE = 100  # 메시지 분할 INSERT 크기


# ─── Supabase HTTP 클라이언트 ─────────────────────────────

_client: httpx.AsyncClient | None = None


def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(timeout=30.0)
    return _client


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


# ─── 기존 데이터 조회 ─────────────────────────────────────

async def get_existing_conversations(provider: str) -> dict[str, dict]:
    """이미 수집된 대화 목록 조회. {external_id: {id, source_size}}"""
    results = {}
    offset = 0
    limit = 1000
    while True:
        data = await _request("GET", "ai_conversations", params={
            "select": "id,external_id,source_size",
            "provider": f"eq.{provider}",
            "offset": str(offset),
            "limit": str(limit),
        })
        if not data:
            break
        for row in data:
            results[row["external_id"]] = {
                "id": row["id"],
                "source_size": row["source_size"],
            }
        if len(data) < limit:
            break
        offset += limit
    return results


# ─── UPSERT / INSERT ─────────────────────────────────────

async def upsert_conversation(conv: ParsedConversation) -> str | None:
    """대화 UPSERT → conversation_id 반환."""
    meta = conv.meta
    body = {
        "provider": meta.provider,
        "external_id": meta.external_id,
        "project_path": meta.project_path,
        "title": meta.title,
        "model": meta.model,
        "started_at": meta.started_at.isoformat(),
        "ended_at": conv.messages[-1].message_at.isoformat() if conv.messages else None,
        "message_count": len(conv.messages),
        "metadata": meta.metadata,
        "source_path": meta.source_path,
        "source_size": meta.source_size,
    }

    data = await _request("POST", "ai_conversations", json_body=body, params={
        "on_conflict": "provider,external_id",
    }, extra_headers={
        "Prefer": "return=representation,resolution=merge-duplicates",
    })

    if data and len(data) > 0:
        return data[0]["id"]
    return None


async def delete_messages(conversation_id: str):
    """기존 메시지 삭제 (재삽입 전)."""
    await _request("DELETE", "ai_messages", params={
        "conversation_id": f"eq.{conversation_id}",
    })


async def insert_messages(conversation_id: str, messages: list):
    """메시지 벌크 INSERT (분할)."""
    for i in range(0, len(messages), MSG_BATCH_SIZE):
        batch = messages[i:i + MSG_BATCH_SIZE]
        bodies = []
        for msg in batch:
            bodies.append({
                "conversation_id": conversation_id,
                "role": msg.role,
                "content": msg.content,
                "token_count": msg.token_count,
                "model": msg.model,
                "metadata": msg.metadata,
                "message_at": msg.message_at.isoformat(),
            })
        await _request("POST", "ai_messages", json_body=bodies, extra_headers={
            "Prefer": "return=minimal",
        })


async def insert_usage(conversation_id: str, conv: ParsedConversation):
    """사용량 정보 INSERT (있는 경우만)."""
    if conv.usage is None:
        return
    body = {
        "conversation_id": conversation_id,
        "provider": conv.meta.provider,
        "model": conv.usage.model,
        "input_tokens": conv.usage.input_tokens,
        "output_tokens": conv.usage.output_tokens,
        "cache_read_tokens": conv.usage.cache_read_tokens,
        "cache_write_tokens": conv.usage.cache_write_tokens,
        "total_cost_usd": conv.usage.total_cost_usd,
    }
    await _request("POST", "ai_usage", json_body=body, extra_headers={
        "Prefer": "return=minimal",
    })


# ─── 프로바이더별 동기화 ──────────────────────────────────

PROVIDERS = {
    "claude_code": {
        "module": claude_code,
        "base_path": Path.home() / ".claude" / "projects",
    },
    "codex": {
        "module": codex_cli,
        "base_path": Path.home() / ".codex",
    },
    "gemini_cli": {
        "module": gemini_cli,
        "base_path": Path.home() / ".gemini",
    },
}


async def sync_provider(provider_name: str, dry_run: bool = False) -> dict:
    """특정 프로바이더의 대화를 동기화."""
    config = PROVIDERS[provider_name]
    module = config["module"]
    base_path = config["base_path"]

    result = {"provider": provider_name, "discovered": 0, "new": 0, "updated": 0, "skipped": 0, "errors": 0}

    # 1. 로컬 대화 발견
    local_convos = module.discover_conversations(base_path)
    result["discovered"] = len(local_convos)

    if not local_convos:
        return result

    # 2. 기존 수집 데이터 조회
    existing = {} if dry_run else await get_existing_conversations(provider_name)

    # 3. 신규/변경 필터링
    to_process = []
    for conv_info in local_convos:
        ext_id = conv_info["session_id"]
        existing_entry = existing.get(ext_id)

        if existing_entry:
            # source_size가 같으면 변경 없음 → 스킵
            if existing_entry["source_size"] == conv_info["size"]:
                result["skipped"] += 1
                continue
        to_process.append((conv_info, existing_entry))

    logger.info("[%s] %d to process (of %d discovered, %d skipped)",
                provider_name, len(to_process), len(local_convos), result["skipped"])

    # 4. 배치 처리
    for i in range(0, len(to_process), BATCH_SIZE):
        batch = to_process[i:i + BATCH_SIZE]
        for conv_info, existing_entry in batch:
            try:
                parsed = module.parse_conversation(conv_info)
                if parsed is None or not parsed.messages:
                    result["skipped"] += 1
                    continue

                if dry_run:
                    logger.info("[DRY] Would sync: %s (%d msgs)",
                                parsed.meta.external_id[:16], len(parsed.messages))
                    result["new"] += 1
                    continue

                conv_id = await upsert_conversation(parsed)
                if not conv_id:
                    result["errors"] += 1
                    continue

                if existing_entry:
                    # 변경된 대화 → 기존 메시지 삭제 후 재삽입
                    await delete_messages(conv_id)
                    result["updated"] += 1
                else:
                    result["new"] += 1

                await insert_messages(conv_id, parsed.messages)
                await insert_usage(conv_id, parsed)

            except Exception as e:
                logger.error("[%s] Error processing %s: %s",
                             provider_name, conv_info.get("session_id", "?")[:16], e)
                result["errors"] += 1

    return result


# ─── 메인 ────────────────────────────────────────────────

async def main(providers: list[str] | None = None, dry_run: bool = False):
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        logger.error("SUPABASE_URL and SUPABASE_SERVICE_KEY required")
        sys.exit(1)

    target_providers = providers or list(PROVIDERS.keys())

    results = []
    for provider_name in target_providers:
        if provider_name not in PROVIDERS:
            logger.warning("Unknown provider: %s", provider_name)
            continue
        result = await sync_provider(provider_name, dry_run=dry_run)
        results.append(result)
        logger.info("[%s] Done: new=%d, updated=%d, skipped=%d, errors=%d",
                     result["provider"], result["new"], result["updated"],
                     result["skipped"], result["errors"])

    # 클라이언트 정리
    global _client
    if _client:
        await _client.aclose()
        _client = None

    return results


def run():
    parser = argparse.ArgumentParser(description="AI CLI 대화 수집기")
    parser.add_argument("--dry-run", action="store_true", help="실제 DB 저장 없이 시뮬레이션")
    parser.add_argument("--provider", choices=list(PROVIDERS.keys()), help="특정 프로바이더만 처리")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    # 동시 실행 방지 (fcntl 락)
    lock_fd = open(LOCK_FILE, "w")
    try:
        fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        logger.warning("Another collector instance is already running")
        sys.exit(0)

    try:
        providers = [args.provider] if args.provider else None
        asyncio.run(main(providers=providers, dry_run=args.dry_run))
    finally:
        fcntl.flock(lock_fd, fcntl.LOCK_UN)
        lock_fd.close()


if __name__ == "__main__":
    run()

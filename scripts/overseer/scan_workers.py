"""Worker scanner — detects active Claude Code sessions, Telegram bot, and Codex CLI."""

import json
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path

from .config import SUPABASE_REST_URL, SUPABASE_HEADERS, PROJECTS, logger

# ── 상수 ──────────────────────────────────────────────
# 민감 패턴 (API 키, 토큰, 비밀번호 등)
_SENSITIVE_RE = re.compile(
    r'(api[_-]?key|token|secret|password|credential|bearer|authorization)[=:\s]+'
    r'[^\s,;]{8,}',
    re.IGNORECASE,
)

ACTIVE_THRESHOLD_MIN = 30      # 30분 이내 → active
IDLE_THRESHOLD_MIN = 120       # 2시간 이내 → idle, 이후 → offline
MACBOOK_SSH = "john@100.126.175.94"
SSH_TIMEOUT = 5

# 프로젝트 경로 → project 매핑
_PROJECT_MAP: dict[str, dict] | None = None


def _get_project_map() -> dict[str, dict]:
    """Build path → project mapping (cached)."""
    global _PROJECT_MAP
    if _PROJECT_MAP is None:
        _PROJECT_MAP = {}
        for p in PROJECTS:
            path = p.get("path")
            if path:
                _PROJECT_MAP[path] = p
                # 심볼릭 링크 대비: 이름으로도 매핑
                _PROJECT_MAP[p["name"]] = p
    return _PROJECT_MAP


def _resolve_project(project_path: str | None, project_name: str | None) -> dict | None:
    """프로젝트 경로나 이름으로 매핑."""
    pm = _get_project_map()
    if project_path:
        # 정확히 일치
        if project_path in pm:
            return pm[project_path]
        # 포함 관계 (e.g., /home/john/jd-platform/src → /home/john/jd-platform)
        for p_path, proj in pm.items():
            if p_path.startswith("/") and project_path.startswith(p_path):
                return proj
    if project_name and project_name in pm:
        return pm[project_name]
    return None


def _sanitize_task(text: str | None) -> str | None:
    """작업 텍스트에서 민감 정보를 제거하고 50자로 제한."""
    if not text:
        return None
    # 민감 패턴 마스킹
    text = _SENSITIVE_RE.sub("[REDACTED]", text)
    # 50자 제한
    if len(text) > 50:
        text = text[:47] + "..."
    return text.strip() or None


def _minutes_ago(ts: datetime) -> float:
    """타임스탬프가 몇 분 전인지 계산."""
    now = datetime.now(timezone.utc)
    diff = now - ts
    return diff.total_seconds() / 60


def _determine_status(minutes: float) -> str:
    """활동 시각 기반 상태 판정."""
    if minutes <= ACTIVE_THRESHOLD_MIN:
        return "active"
    elif minutes <= IDLE_THRESHOLD_MIN:
        return "idle"
    return "offline"


def _match_project_dir(dir_name: str) -> tuple[str | None, dict | None]:
    """Claude 프로젝트 디렉토리명을 실제 프로젝트 경로에 매핑.

    디렉토리명 형식: -home-john-projects-secretary (경로의 /를 -로 치환)
    문제: 폴더명 자체에 하이픈이 포함될 수 있음 (e.g. secretary-overseer)
    해결: PROJECTS의 실제 경로를 같은 방식으로 인코딩해서 비교.
    """
    for proj in PROJECTS:
        path = proj.get("path")
        if not path:
            continue
        # 실제 경로 → Claude 인코딩: /home/john/projects/secretary → -home-john-projects-secretary
        encoded = path.replace("/", "-")
        if encoded.startswith("-"):
            encoded_clean = encoded  # 이미 - 시작
        else:
            encoded_clean = "-" + encoded
        if dir_name == encoded_clean:
            return path, proj

    # 매칭 실패 시 fallback: 단순 변환 (경로만 반환, 프로젝트는 None)
    fallback = dir_name.replace("-", "/", 1)  # 첫 - 만 / 로
    # 나머지는 그대로 — 완전한 복원은 불가하므로 project_path만 제공
    fallback_full = dir_name
    if fallback_full.startswith("-"):
        fallback_full = "/" + fallback_full[1:]
    # 최소한 /home/john 부분은 복원
    fallback_full = fallback_full.replace("-", "/", 3)  # /home/john/xxx-yyy
    return fallback_full, None


# ── Claude Code 스캐너 ────────────────────────────────

def _scan_claude_code() -> list[dict]:
    """~/.claude/ 디렉토리에서 Claude Code 세션 탐지."""
    workers = []
    claude_dir = Path.home() / ".claude"

    # projects 디렉토리 탐색 — 각 프로젝트별 세션 확인
    projects_dir = claude_dir / "projects"
    if not projects_dir.exists():
        return workers

    seen_sessions: set[str] = set()

    for project_dir in projects_dir.iterdir():
        if not project_dir.is_dir():
            continue

        # 세션 파일들 탐색 (*.jsonl)
        for session_file in sorted(project_dir.glob("*.jsonl"), key=lambda f: f.stat().st_mtime, reverse=True):
            session_id = session_file.stem
            if session_id in seen_sessions:
                continue

            try:
                stat = session_file.stat()
                mtime = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc)
                mins = _minutes_ago(mtime)

                # 2시간 초과 세션은 무시
                if mins > IDLE_THRESHOLD_MIN:
                    continue

                seen_sessions.add(session_id)
                status = _determine_status(mins)

                # 세션 파일에서 프로젝트 경로 추출 (디렉토리명에서)
                # 디렉토리명 형식: -home-john-projectname (하이픈이 경로 구분자)
                # 단순 replace("-", "/") 하면 폴더명 내 하이픈까지 변환됨
                # → PROJECTS의 실제 경로와 직접 매칭
                project_path, proj = _match_project_dir(project_dir.name)

                # 현재 작업 추출 — 마지막 몇 줄 파싱
                current_task = _extract_current_task(session_file)

                workers.append({
                    "worker_id": f"claude_code:{session_id[:12]}",
                    "worker_type": "claude_code",
                    "machine": "vivobook_wsl",
                    "session_id": session_id[:12],
                    "project_path": project_path,
                    "project_name": proj["name"] if proj else None,
                    "status": status,
                    "current_task": current_task,
                    "task_detail": [],
                    "last_activity": mtime.isoformat(),
                })
            except Exception as e:
                logger.debug("Error parsing session %s: %s", session_file.name, e)

    return workers


def _extract_current_task(session_file: Path) -> str | None:
    """세션 파일의 마지막 줄들에서 현재 작업 추출."""
    try:
        # tail -20으로 마지막 줄들만 읽기
        result = subprocess.run(
            ["tail", "-20", str(session_file)],
            capture_output=True, text=True, timeout=5,
        )
        if not result.stdout:
            return None

        # 역순으로 assistant 메시지에서 TaskUpdate/TaskCreate 찾기
        lines = result.stdout.strip().splitlines()
        for line in reversed(lines):
            try:
                entry = json.loads(line)
                # 사용자 메시지에서 작업 힌트 추출
                if entry.get("role") == "human":
                    content = entry.get("content", "")
                    if isinstance(content, str) and len(content) > 5:
                        return _sanitize_task(content)
                    elif isinstance(content, list):
                        for block in content:
                            if isinstance(block, dict) and block.get("type") == "text":
                                text = block.get("text", "")
                                if len(text) > 5:
                                    return _sanitize_task(text)
            except (json.JSONDecodeError, KeyError):
                continue
        return None
    except Exception:
        return None


# ── 텔레그램 봇 스캐너 ────────────────────────────────

def _scan_telegram_bot() -> list[dict]:
    """PM2 상태 + 봇 활동으로 텔레그램 봇 상태 확인."""
    workers = []

    # PM2 상태 확인
    try:
        result = subprocess.run(
            ["pm2", "jlist"], capture_output=True, text=True, timeout=10,
        )
        pm2_list = json.loads(result.stdout) if result.stdout else []
    except Exception:
        pm2_list = []

    bot_process = None
    for proc in pm2_list:
        if proc.get("name") in ("secretary-bot", "secretary"):
            bot_process = proc
            break

    if not bot_process:
        workers.append({
            "worker_id": "telegram_bot",
            "worker_type": "telegram_bot",
            "machine": "vivobook_wsl",
            "session_id": None,
            "project_path": "/home/john/projects/secretary",
            "project_name": "secretary",
            "status": "offline",
            "current_task": None,
            "task_detail": [],
            "last_activity": None,
        })
        return workers

    pm2_status = bot_process.get("pm2_env", {}).get("status", "stopped")
    uptime = bot_process.get("pm2_env", {}).get("pm_uptime")

    # 활동 시각 결정
    last_activity = None
    if uptime:
        last_activity = datetime.fromtimestamp(uptime / 1000, tz=timezone.utc)

    # 봇 세션 파일 확인
    sessions_file = Path.home() / "projects" / "secretary" / "bot" / "sessions.json"
    if sessions_file.exists():
        try:
            sessions = json.loads(sessions_file.read_text())
            if isinstance(sessions, dict) and sessions.get("last_used"):
                lu = datetime.fromisoformat(sessions["last_used"])
                if lu.tzinfo is None:
                    lu = lu.replace(tzinfo=timezone.utc)
                last_activity = lu
        except Exception:
            pass

    if pm2_status == "online":
        if last_activity:
            mins = _minutes_ago(last_activity)
            status = _determine_status(mins)
        else:
            status = "idle"
    else:
        status = "offline"

    workers.append({
        "worker_id": "telegram_bot",
        "worker_type": "telegram_bot",
        "machine": "vivobook_wsl",
        "session_id": None,
        "project_path": "/home/john/projects/secretary",
        "project_name": "secretary",
        "status": status,
        "current_task": "텔레그램 봇 대기 중" if status == "idle" else None,
        "task_detail": [],
        "last_activity": last_activity.isoformat() if last_activity else None,
    })

    return workers


# ── 맥북 Codex CLI 스캐너 ─────────────────────────────

def _scan_macbook_codex() -> list[dict]:
    """SSH로 맥북의 Codex CLI 상태 확인."""
    workers = []

    try:
        result = subprocess.run(
            ["ssh", "-o", f"ConnectTimeout={SSH_TIMEOUT}",
             "-o", "StrictHostKeyChecking=accept-new",
             MACBOOK_SSH,
             "cat ~/.codex-cli/history.jsonl 2>/dev/null | tail -50"],
            capture_output=True, text=True, timeout=SSH_TIMEOUT + 5,
        )
        if result.returncode != 0 or not result.stdout.strip():
            workers.append({
                "worker_id": "codex_cli:macbook",
                "worker_type": "codex_cli",
                "machine": "macbook_pro",
                "session_id": None,
                "project_path": None,
                "project_name": None,
                "status": "offline",
                "current_task": "확인불가 (SSH 연결 실패)" if result.returncode != 0 else None,
                "task_detail": [],
                "last_activity": None,
            })
            return workers

        # 마지막 항목에서 활동 시각 추출
        lines = result.stdout.strip().splitlines()
        last_activity = None
        current_task = None

        for line in reversed(lines):
            try:
                entry = json.loads(line)
                ts_str = entry.get("timestamp") or entry.get("created_at")
                if ts_str:
                    ts = datetime.fromisoformat(ts_str)
                    if ts.tzinfo is None:
                        ts = ts.replace(tzinfo=timezone.utc)
                    last_activity = ts
                    current_task = _sanitize_task(entry.get("prompt", entry.get("message", "")))
                    break
            except (json.JSONDecodeError, ValueError):
                continue

        if last_activity:
            mins = _minutes_ago(last_activity)
            status = _determine_status(mins)
        else:
            status = "offline"

        workers.append({
            "worker_id": "codex_cli:macbook",
            "worker_type": "codex_cli",
            "machine": "macbook_pro",
            "session_id": None,
            "project_path": None,
            "project_name": "scouter",
            "status": status,
            "current_task": current_task,
            "task_detail": [],
            "last_activity": last_activity.isoformat() if last_activity else None,
        })
    except subprocess.TimeoutExpired:
        workers.append({
            "worker_id": "codex_cli:macbook",
            "worker_type": "codex_cli",
            "machine": "macbook_pro",
            "session_id": None,
            "project_path": None,
            "project_name": None,
            "status": "offline",
            "current_task": "확인불가 (타임아웃)",
            "task_detail": [],
            "last_activity": None,
        })
    except Exception as e:
        logger.warning("Macbook codex scan failed: %s", e)
        workers.append({
            "worker_id": "codex_cli:macbook",
            "worker_type": "codex_cli",
            "machine": "macbook_pro",
            "session_id": None,
            "project_path": None,
            "project_name": None,
            "status": "offline",
            "current_task": f"확인불가 ({e})",
            "task_detail": [],
            "last_activity": None,
        })

    return workers


# ── 프로젝트 ID 리졸버 ────────────────────────────────

def _resolve_project_ids(workers: list[dict]) -> list[dict]:
    """프로젝트 이름을 Supabase project ID로 매핑."""
    import requests

    try:
        url = f"{SUPABASE_REST_URL}/overseer_projects?select=id,name,path"
        resp = requests.get(url, headers=SUPABASE_HEADERS, timeout=10)
        resp.raise_for_status()
        projects = resp.json()
    except Exception as e:
        logger.warning("Failed to fetch projects for ID mapping: %s", e)
        return workers

    name_to_id = {p["name"]: p["id"] for p in projects}
    path_to_id = {p["path"]: p["id"] for p in projects}

    for w in workers:
        project_id = None
        if w.get("project_name"):
            project_id = name_to_id.get(w["project_name"])
        if not project_id and w.get("project_path"):
            project_id = path_to_id.get(w["project_path"])
            # 부분 매칭
            if not project_id:
                for pp, pid in path_to_id.items():
                    if w["project_path"].startswith(pp):
                        project_id = pid
                        break
        w["project_id"] = project_id

    return workers


# ── 메인 ──────────────────────────────────────────────

def scan_all() -> list[dict]:
    """모든 워커를 스캔하고 프로젝트 ID를 매핑한 결과 반환."""
    logger.info("Scanning workers...")

    workers = []

    # 1. Claude Code
    cc_workers = _scan_claude_code()
    logger.info("  Claude Code: %d sessions found", len(cc_workers))
    workers.extend(cc_workers)

    # 2. Telegram Bot
    tg_workers = _scan_telegram_bot()
    logger.info("  Telegram Bot: status=%s", tg_workers[0]["status"] if tg_workers else "none")
    workers.extend(tg_workers)

    # 3. Macbook Codex
    cx_workers = _scan_macbook_codex()
    logger.info("  Codex CLI: status=%s", cx_workers[0]["status"] if cx_workers else "none")
    workers.extend(cx_workers)

    # 프로젝트 ID 매핑
    workers = _resolve_project_ids(workers)

    return workers

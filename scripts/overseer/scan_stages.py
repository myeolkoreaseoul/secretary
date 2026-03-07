"""Stage scanner — auto-infer current project stage from progress.md, git branch, and commits."""

import re
import subprocess
from pathlib import Path
from datetime import datetime, timezone
from urllib.parse import quote

import requests

from .config import SUPABASE_REST_URL, SUPABASE_HEADERS, PROJECTS, logger


def _run_git(cmd: list[str], cwd: str) -> str:
    """Git 명령 실행, 실패 시 빈 문자열."""
    try:
        r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=10)
        return r.stdout.strip()
    except Exception:
        return ""


def _parse_progress_md(project_path: str) -> tuple[str | None, str | None]:
    """progress.md에서 현재 진행 단계 파싱.

    Returns: (current_stage, stage_detail) or (None, None)

    전략:
    1. 마지막 ## 섹션 중 WIP/진행중/in progress 키워드가 있는 항목
    2. 없으면 마지막 ## 섹션 자체를 current_stage로
    """
    progress_file = Path(project_path) / "progress.md"
    if not progress_file.exists():
        return None, None

    try:
        content = progress_file.read_text(encoding="utf-8")
    except Exception:
        return None, None

    if not content.strip():
        return None, None

    # ## 섹션 파싱
    sections: list[tuple[str, str]] = []  # (heading, body)
    current_heading = ""
    current_body_lines: list[str] = []

    for line in content.splitlines():
        if line.startswith("## "):
            if current_heading:
                sections.append((current_heading, "\n".join(current_body_lines).strip()))
            current_heading = line[3:].strip()
            current_body_lines = []
        elif current_heading:
            current_body_lines.append(line)

    if current_heading:
        sections.append((current_heading, "\n".join(current_body_lines).strip()))

    if not sections:
        return None, None

    # WIP/진행중 키워드가 있는 섹션 찾기 (뒤에서부터)
    wip_patterns = re.compile(r'(WIP|진행중|진행 중|in progress|현재|작업중|작업 중)', re.IGNORECASE)

    for heading, body in reversed(sections):
        if wip_patterns.search(heading) or wip_patterns.search(body[:500]):
            # 미완료 체크박스(- [ ])가 있는 항목들 추출
            unchecked = [
                m.group(1).strip()
                for m in re.finditer(r'- \[ \] (.+)', body)
            ]
            detail = ", ".join(unchecked[:5]) if unchecked else body[:200]
            return heading, detail

    # WIP 키워드가 없으면 마지막 섹션
    last_heading, last_body = sections[-1]
    unchecked = [
        m.group(1).strip()
        for m in re.finditer(r'- \[ \] (.+)', last_body)
    ]
    detail = ", ".join(unchecked[:5]) if unchecked else last_body[:200]
    return last_heading, detail


def _infer_from_branch(project_path: str) -> str | None:
    """Git 브랜치명에서 단계 추론.

    패턴 예: feat/phase3-council-wip → "Phase 3 Council (WIP)"
    """
    branch = _run_git(["git", "rev-parse", "--abbrev-ref", "HEAD"], project_path)
    if not branch or branch in ("main", "master", "develop", "HEAD"):
        return None

    # 브랜치명 정리
    # feat/phase5-worker-tracking → Phase 5 Worker Tracking
    name = branch.split("/")[-1]  # prefix 제거 (feat/, fix/, etc.)
    name = name.replace("-", " ").replace("_", " ")

    # WIP 태그
    is_wip = "wip" in name.lower()
    name = re.sub(r'\bwip\b', '', name, flags=re.IGNORECASE).strip()

    # Phase 숫자 정리
    name = re.sub(r'phase\s*(\d+)', r'Phase \1:', name, flags=re.IGNORECASE)

    # 타이틀 케이스
    name = name.strip().title()

    if is_wip:
        name += " (WIP)"

    return name if name else None


def _infer_from_commit(project_path: str) -> str | None:
    """최근 커밋 메시지를 stage_detail로."""
    msg = _run_git(["git", "log", "-1", "--format=%s"], project_path)
    return msg[:200] if msg else None


def scan_project(project: dict) -> dict | None:
    """단일 프로젝트의 작업 단계 추론.

    Returns: {"current_stage": ..., "stage_detail": ...} or None
    """
    path = project.get("path")
    if not path or not Path(path).exists():
        return None

    # 우선순위 1: progress.md
    stage, detail = _parse_progress_md(path)
    if stage:
        return {"current_stage": stage, "stage_detail": detail}

    # 우선순위 2: branch name
    branch_stage = _infer_from_branch(path)
    commit_detail = _infer_from_commit(path)
    if branch_stage:
        return {"current_stage": branch_stage, "stage_detail": commit_detail}

    # 우선순위 3: 최근 커밋만이라도
    if commit_detail:
        return {"current_stage": None, "stage_detail": commit_detail}

    return None


def scan() -> list[dict]:
    """모든 프로젝트의 작업 단계 추론 및 DB 업데이트."""
    logger.info("Scanning project stages...")
    results = []

    for proj in PROJECTS:
        stage_data = scan_project(proj)
        if not stage_data:
            continue

        results.append({
            "name": proj["name"],
            **stage_data,
        })

        # Supabase overseer_projects 직접 PATCH
        try:
            url = f"{SUPABASE_REST_URL}/overseer_projects?name=eq.{quote(proj['name'], safe='')}"
            headers = {**SUPABASE_HEADERS, "Prefer": "return=minimal"}
            payload = {
                "current_stage": stage_data.get("current_stage"),
                "stage_detail": stage_data.get("stage_detail"),
                "stage_updated": datetime.now(timezone.utc).isoformat(),
            }
            resp = requests.patch(url, headers=headers, json=payload, timeout=10)
            resp.raise_for_status()
            logger.info(
                "  %s: stage=%s",
                proj["name"],
                stage_data.get("current_stage", "(커밋만)"),
            )
        except Exception as e:
            logger.error("  %s stage update failed: %s", proj["name"], e)

    return results

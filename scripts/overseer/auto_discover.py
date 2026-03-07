"""자동 프로젝트 감지 — ~/에서 .git 디렉토리를 스캔하여 미등록 프로젝트를 발견."""

import os
import re
import subprocess
from pathlib import Path

import requests

from .config import (
    SUPABASE_REST_URL, SUPABASE_HEADERS, NOTION_TREE,
    flatten_projects, logger,
)

HOME = Path.home()

# 스캔에서 제외할 디렉토리 패턴
EXCLUDE_DIRS = {
    ".cache", ".local", ".npm", ".nvm", ".cargo", ".rustup",
    ".pyenv", ".conda", "node_modules", ".git", "__pycache__",
    ".claude", ".openclaw", "snap", ".vscode-server",
    ".config", ".bun", ".deno",
}

# 최대 깊이 (HOME 기준)
MAX_DEPTH = 3

# Notion 라우팅 — 프로젝트명 → 카테고리
NOTION_ROUTING = {
    r"jd-platform":                 ("정동회계법인", "사내시스템"),
    r"meeting-room":                ("정동회계법인", "사내시스템"),
    r"tessera|sangsi|rnd-audit":    ("정동회계법인", "정산자동화"),
    r"jd-audit-portal|proposal":    ("정동회계법인", "외부고객서비스"),
    r"svvys|secretary":             ("개인/사이드", None),
    r"scouter|openclaw":            ("개인/사이드", None),
}

# 카테고리 → Notion 페이지 ID
CATEGORY_NOTION_IDS = {}
def _build_category_map(tree=NOTION_TREE):
    """NOTION_TREE에서 org/category별 notion_id 매핑 구축."""
    for org in tree.get("children", []):
        org_name = org["name"]
        # org 자체가 카테고리 역할인 경우 (개인/사이드)
        CATEGORY_NOTION_IDS[(org_name, None)] = org["id"]
        for cat in org.get("children", []):
            if cat.get("type") == "category":
                CATEGORY_NOTION_IDS[(org_name, cat["name"])] = cat["id"]

_build_category_map()


def _get_github_remote(git_dir: Path) -> str | None:
    """git remote에서 GitHub repo slug 추출."""
    try:
        result = subprocess.run(
            ["git", "-C", str(git_dir), "remote", "get-url", "origin"],
            capture_output=True, text=True, timeout=5,
        )
        url = result.stdout.strip()
        if not url:
            return None
        # git@github.com:user/repo.git or https://github.com/user/repo.git
        m = re.search(r"github\.com[:/](.+?)(?:\.git)?$", url)
        return m.group(1) if m else None
    except Exception:
        return None


def _detect_parent(project_path: Path, known_paths: set[str]) -> str | None:
    """프로젝트가 다른 프로젝트 안에 있는지 감지 (하위 프로젝트)."""
    parent = project_path.parent
    while parent != HOME and parent != parent.parent:
        if str(parent) in known_paths and str(parent) != str(project_path):
            return str(parent)
        parent = parent.parent
    return None


def _route_to_category(name: str) -> tuple[str, str | None]:
    """프로젝트명에서 Notion 카테고리 결정."""
    for pattern, (org, cat) in NOTION_ROUTING.items():
        if re.search(pattern, name):
            return (org, cat)
    # 기본: 정동회계법인 > 기타/완료
    return ("정동회계법인", "기타/완료")


def scan_for_projects() -> list[dict]:
    """HOME 아래의 .git 디렉토리를 찾아 프로젝트 목록 반환."""
    found = []

    for root, dirs, _files in os.walk(HOME, topdown=True):
        root_path = Path(root)
        depth = len(root_path.relative_to(HOME).parts)

        # 깊이 제한
        if depth >= MAX_DEPTH:
            dirs.clear()
            continue

        # 제외 디렉토리 필터
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS and not d.startswith(".")]

        if ".git" in os.listdir(root_path):
            project_path = root_path
            name = project_path.name
            github = _get_github_remote(project_path)

            found.append({
                "name": name,
                "path": str(project_path),
                "github_repo": github,
                "auto_discovered": True,
            })

    return found


def _get_registered_projects() -> dict[str, dict]:
    """DB에서 이미 등록된 프로젝트 조회. path → project dict."""
    url = f"{SUPABASE_REST_URL}/overseer_projects?select=id,name,path,parent_id,auto_discovered,category"
    headers = {**SUPABASE_HEADERS}
    headers.pop("Prefer", None)
    try:
        resp = requests.get(url, headers=headers, timeout=10)
        resp.raise_for_status()
        return {p["path"]: p for p in resp.json() if p.get("path")}
    except Exception as e:
        logger.error("Failed to fetch registered projects: %s", e)
        return {}


def _register_project(proj: dict) -> str | None:
    """새 프로젝트를 DB에 등록."""
    url = f"{SUPABASE_REST_URL}/overseer_projects"
    headers = {**SUPABASE_HEADERS, "Prefer": "return=representation,resolution=merge-duplicates"}

    org, cat = _route_to_category(proj["name"])
    category = f"{org} > {cat}" if cat else org

    payload = {
        "name": proj["name"],
        "path": proj["path"],
        "github_repo": proj.get("github_repo"),
        "auto_discovered": True,
        "category": category,
        "status": "active",
    }

    try:
        resp = requests.post(url, headers=headers, json=payload, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        return data[0]["id"] if data else None
    except Exception as e:
        logger.error("register_project %s failed: %s", proj["name"], e)
        return None


def _set_parent(project_id: str, parent_id: str):
    """하위 프로젝트 관계 설정."""
    url = f"{SUPABASE_REST_URL}/overseer_projects?id=eq.{project_id}"
    headers = {**SUPABASE_HEADERS, "Prefer": "return=minimal"}
    try:
        requests.patch(url, headers=headers, json={"parent_id": parent_id}, timeout=10)
    except Exception as e:
        logger.error("set_parent failed: %s", e)


def discover_and_register() -> dict:
    """자동 감지 실행: 새 프로젝트 등록 + 하위 프로젝트 관계 설정."""
    discovered = scan_for_projects()
    registered = _get_registered_projects()

    registered_paths = set(registered.keys())
    all_paths = registered_paths | {p["path"] for p in discovered}

    new_count = 0
    parent_count = 0

    for proj in discovered:
        path = proj["path"]

        if path not in registered:
            # 새 프로젝트 등록
            project_id = _register_project(proj)
            if project_id:
                new_count += 1
                registered[path] = {"id": project_id, "path": path, "name": proj["name"]}
                logger.info("Auto-discovered: %s (%s)", proj["name"], path)

    # 2차: 하위 프로젝트 관계 설정
    for path, proj_data in registered.items():
        if not path:
            continue
        parent_path = _detect_parent(Path(path), all_paths)
        if parent_path and parent_path in registered:
            parent_id = registered[parent_path]["id"]
            if proj_data.get("parent_id") != parent_id:
                _set_parent(proj_data["id"], parent_id)
                parent_count += 1
                logger.info(
                    "  %s → parent: %s",
                    proj_data["name"], registered[parent_path]["name"],
                )

    logger.info(
        "=== Auto-discover: %d scanned, %d new, %d parent links ===",
        len(discovered), new_count, parent_count,
    )

    return {"scanned": len(discovered), "new": new_count, "parents": parent_count}


if __name__ == "__main__":
    discover_and_register()

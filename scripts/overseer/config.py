"""Overseer configuration — Notion 트리와 1:1 대응하는 프로젝트 레지스트리."""

import sys
from pathlib import Path

# Reuse bot config for Supabase credentials
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "bot"))
from config import SUPABASE_REST_URL, SUPABASE_HEADERS, logger  # noqa: E402

# ── Notion 트리 구조 ────────────────────────────────────
# 이 구조가 곧 대시보드의 구조이자 Notion 페이지 트리
NOTION_TREE = {
    "id": "31aa8c7e-ea73-80a0-bab4-d40155c8fc39",
    "name": "루트",
    "children": [
        {
            "id": "31aa8c7e-ea73-8158-8e07-ea8fa3da5765",
            "name": "정동회계법인",
            "type": "org",
            "children": [
                {
                    "id": "31aa8c7e-ea73-8131-95d8-d8d4fbec7b23",
                    "name": "사내시스템",
                    "type": "category",
                    "children": [
                        {
                            "id": "31aa8c7e-ea73-819b-be60-dc6df89b43ac",
                            "name": "jd-platform",
                            "label": "R&D 과제관리 PMS",
                            "type": "project",
                            "path": "/home/john/jd-platform",
                            "github": "myeolkoreaseoul/jd-platform",
                            "tags": ["nextjs", "supabase"],
                        },
                        {
                            "id": "31aa8c7e-ea73-8119-8120-f6a5c9d21700",
                            "name": "meeting-room",
                            "label": "회의실 예약",
                            "type": "project",
                            "status_override": "paused",
                            "path": None,
                            "github": None,
                            "tags": [],
                        },
                    ],
                },
                {
                    "id": "31aa8c7e-ea73-81f3-8843-e59a10db8375",
                    "name": "정산자동화",
                    "type": "category",
                    "children": [
                        {
                            "id": "31aa8c7e-ea73-81e1-b4c0-d89fbe6ed5a2",
                            "name": "tessera",
                            "label": "e나라도움 RPA 정산검토",
                            "type": "project",
                            "path": "/home/john/tessera",
                            "github": "myeolkoreaseoul/tessera",
                            "tags": ["python", "rpa"],
                        },
                        {
                            "id": "31aa8c7e-ea73-8168-91f7-f8033f19a9c5",
                            "name": "sangsi-checker",
                            "label": "상시점검 문구 생성기 v2",
                            "type": "project",
                            "path": "/home/john/sangsi-checker",
                            "github": "myeolkoreaseoul/sangsi-checker",
                            "tags": ["python", "chrome-ext"],
                        },
                        {
                            "id": "31aa8c7e-ea73-810a-9542-d868b18c93b0",
                            "name": "rnd-audit-tool",
                            "label": "정산검토 도구",
                            "type": "project",
                            "path": "/home/john/rnd-audit-tool",
                            "github": "myeolkoreaseoul/rnd-audit-tool",
                            "tags": ["python"],
                        },
                    ],
                },
                {
                    "id": "31aa8c7e-ea73-812b-9380-c28a08e4637a",
                    "name": "외부고객서비스",
                    "type": "category",
                    "children": [
                        {
                            "id": "31aa8c7e-ea73-81f3-ae28-f1bfe698f6ff",
                            "name": "jd-audit-portal",
                            "label": "고객별 정산검토 포털",
                            "type": "project",
                            "path": "/home/john/userguide-demo",
                            "github": "myeolkoreaseoul/jd-audit-portal",
                            "tags": ["nextjs"],
                        },
                        {
                            "id": "31aa8c7e-ea73-8105-8e7f-e3b68943badd",
                            "name": "proposal-ai",
                            "label": "제안서 AI 생성",
                            "type": "project",
                            "status_override": "paused",
                            "path": None,
                            "github": None,
                            "tags": [],
                        },
                    ],
                },
                {
                    "id": "31aa8c7e-ea73-811c-a5a8-ce2b407f9ebf",
                    "name": "기타/완료",
                    "type": "category",
                    "children": [],
                },
            ],
        },
        {
            "id": "31aa8c7e-ea73-8116-a256-c167945ff3d3",
            "name": "개인/사이드",
            "type": "org",
            "children": [
                {
                    "id": "31aa8c7e-ea73-8160-b1d8-ef3f6a5953fb",
                    "name": "svvys",
                    "label": "프리미엄 파티 관리",
                    "type": "project",
                    "path": "/home/john/svvys",
                    "github": "myeolkoreaseoul/svvys",
                    "tags": ["nextjs", "supabase"],
                },
                {
                    "id": "31aa8c7e-ea73-8188-b3d9-dff39d3b9f16",
                    "name": "secretary",
                    "label": "AI 비서 대시보드",
                    "type": "project",
                    "path": "/home/john/projects/secretary",
                    "github": "myeolkoreaseoul/secretary",
                    "tags": ["nextjs", "python", "telegram"],
                },
                {
                    "id": "31ba8c7e-ea73-819b-82a9-cd20920318f4",
                    "name": "scouter",
                    "label": "소셜 트렌드 선행 감지",
                    "type": "project",
                    "path": None,
                    "github": None,
                    "tags": ["python", "macbook"],
                },
            ],
        },
        {
            "id": "31aa8c7e-ea73-8101-a5ca-f2df14ad632f",
            "name": "인프라/운영",
            "type": "org",
            "children": [],
        },
    ],
}


def flatten_projects(tree: dict = NOTION_TREE) -> list[dict]:
    """트리에서 type=project인 노드만 플랫하게 추출."""
    results = []
    _walk(tree, [], results)
    return results


def _walk(node: dict, breadcrumb: list[str], results: list[dict]):
    if node.get("type") == "project":
        results.append({
            "name": node["name"],
            "label": node.get("label", ""),
            "path": node.get("path"),
            "github_repo": node.get("github"),
            "notion_id": node["id"],
            "description": node.get("label", ""),
            "tags": node.get("tags", []),
            "status_override": node.get("status_override"),
            "breadcrumb": breadcrumb.copy(),
        })
    for child in node.get("children", []):
        _walk(child, breadcrumb + [node["name"]], results)


# 하위 호환 — 기존 main.py 등에서 PROJECTS 사용
PROJECTS = [p for p in flatten_projects() if p.get("path")]

# Warning thresholds
THRESHOLDS = {
    "unpushed_warn": 10,
    "uncommitted_warn": 20,
    "stale_branches_warn": 5,
    "junk_mb_warn": 100,
    "total_size_gb_warn": 5,
    "inactive_days_paused": 30,
}

"""Overseer configuration — project registry and settings."""

import sys
from pathlib import Path

# Reuse bot config for Supabase credentials
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "bot"))
from config import SUPABASE_REST_URL, SUPABASE_HEADERS, logger  # noqa: E402

PROJECTS = [
    {
        "name": "jd-platform",
        "path": "/home/john/jd-platform",
        "github_repo": "myeolkoreaseoul/jd-platform",
        "notion_id": "31aa8c7e-ea73-819b-be60-dc6df89b43ac",
        "description": "R&D PMS 사내시스템",
        "tags": ["nextjs", "supabase", "work"],
    },
    {
        "name": "tessera",
        "path": "/home/john/tessera",
        "github_repo": "myeolkoreaseoul/tessera",
        "notion_id": "31aa8c7e-ea73-81e1-b4c0-d89fbe6ed5a2",
        "description": "정산검토 RPA",
        "tags": ["python", "rpa", "work"],
    },
    {
        "name": "sangsi-checker",
        "path": "/home/john/sangsi-checker",
        "github_repo": "myeolkoreaseoul/sangsi-checker",
        "notion_id": "31aa8c7e-ea73-8168-91f7-f8033f19a9c5",
        "description": "상시점검 v2",
        "tags": ["python", "chrome-ext", "work"],
    },
    {
        "name": "rnd-audit-tool",
        "path": "/home/john/rnd-audit-tool",
        "github_repo": "myeolkoreaseoul/rnd-audit-tool",
        "notion_id": "31aa8c7e-ea73-810a-9542-d868b18c93b0",
        "description": "정산검토 도구",
        "tags": ["python", "work"],
    },
    {
        "name": "secretary",
        "path": "/home/john/projects/secretary",
        "github_repo": "myeolkoreaseoul/secretary",
        "notion_id": "31aa8c7e-ea73-8188-b3d9-dff39d3b9f16",
        "description": "AI 비서 시스템",
        "tags": ["nextjs", "python", "telegram", "side"],
    },
    {
        "name": "svvys",
        "path": "/home/john/svvys",
        "github_repo": "myeolkoreaseoul/svvys",
        "notion_id": "31aa8c7e-ea73-8160-b1d8-ef3f6a5953fb",
        "description": "파티 관리 서비스",
        "tags": ["nextjs", "supabase", "side"],
    },
    {
        "name": "jd-audit-portal",
        "path": "/home/john/userguide-demo",
        "github_repo": "myeolkoreaseoul/jd-audit-portal",
        "notion_id": "31aa8c7e-ea73-81f3-ae28-f1bfe698f6ff",
        "description": "외부 고객 포털",
        "tags": ["nextjs", "work"],
    },
]

# Warning thresholds
THRESHOLDS = {
    "unpushed_warn": 10,
    "uncommitted_warn": 20,
    "stale_branches_warn": 5,
    "junk_mb_warn": 100,
    "total_size_gb_warn": 5,
    "inactive_days_paused": 30,
}

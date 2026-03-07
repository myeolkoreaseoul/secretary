#!/usr/bin/env python3
"""Overseer orchestrator — runs scans and uploads to Supabase."""

import argparse
import json
import sys
from pathlib import Path

# Ensure bot/ is importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "bot"))

import requests

from .config import SUPABASE_REST_URL, SUPABASE_HEADERS, PROJECTS, THRESHOLDS, logger
from . import scan_git, scan_fs, scan_services


def upsert_project(project: dict) -> str | None:
    """Upsert project into overseer_projects. Returns project UUID."""
    url = f"{SUPABASE_REST_URL}/overseer_projects"
    headers = {**SUPABASE_HEADERS, "Prefer": "return=representation,resolution=merge-duplicates"}

    payload = {
        "name": project["name"],
        "path": project["path"],
        "github_repo": project.get("github_repo"),
        "notion_id": project.get("notion_id"),
        "description": project.get("description"),
        "tags": project.get("tags", []),
    }

    try:
        resp = requests.post(url, headers=headers, json=payload, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        return data[0]["id"] if data else None
    except Exception as e:
        logger.error("upsert_project %s failed: %s", project["name"], e)
        return None


def insert_snapshot(table: str, data: dict):
    """Insert a snapshot row into the given table."""
    url = f"{SUPABASE_REST_URL}/{table}"
    try:
        resp = requests.post(url, headers=SUPABASE_HEADERS, json=data, timeout=10)
        resp.raise_for_status()
    except Exception as e:
        logger.error("insert %s failed: %s", table, e)


def update_project_status(project_id: str, status: str):
    """Update project status (active/paused)."""
    url = f"{SUPABASE_REST_URL}/overseer_projects?id=eq.{project_id}"
    headers = {**SUPABASE_HEADERS, "Prefer": "return=minimal"}
    try:
        requests.patch(url, headers=headers, json={"status": status}, timeout=10)
    except Exception as e:
        logger.error("status update failed: %s", e)


def run_scan(scan_type: str = "all"):
    """Run scans for all projects."""
    logger.info("=== Overseer scan started (type=%s) ===", scan_type)

    for proj in PROJECTS:
        logger.info("Scanning %s ...", proj["name"])
        project_id = upsert_project(proj)
        if not project_id:
            continue

        # Git scan (always, or when type=git/all)
        if scan_type in ("all", "git"):
            git_data = scan_git.scan(proj)
            if git_data:
                git_data["project_id"] = project_id
                insert_snapshot("overseer_git_snapshots", git_data)

                # Auto-detect paused projects
                if git_data.get("commit_date"):
                    from datetime import datetime, timezone
                    try:
                        cd = datetime.fromisoformat(git_data["commit_date"])
                        days = (datetime.now(timezone.utc) - cd).days
                        if days > THRESHOLDS["inactive_days_paused"]:
                            update_project_status(project_id, "paused")
                    except (ValueError, TypeError):
                        pass

                logger.info(
                    "  git: branch=%s unpushed=%d uncommitted=%d stale=%d",
                    git_data["branch"], git_data["unpushed"],
                    git_data["uncommitted"], git_data["stale_branches"],
                )

        # FS scan (hourly or when type=fs/all)
        if scan_type in ("all", "fs"):
            fs_data = scan_fs.scan(proj)
            if fs_data:
                fs_data["project_id"] = project_id
                insert_snapshot("overseer_fs_snapshots", fs_data)
                logger.info(
                    "  fs: total=%.1fMB junk=%.1fMB files=%d",
                    fs_data["total_size_mb"], fs_data["junk_mb"], fs_data["file_count"],
                )

        # Service scan (5min or when type=svc/all)
        if scan_type in ("all", "svc"):
            svc_data = scan_services.scan(proj)
            if svc_data:
                svc_data["project_id"] = project_id
                insert_snapshot("overseer_service_snapshots", svc_data)
                logger.info(
                    "  svc: pm2=%s port=%s open=%s",
                    svc_data.get("pm2_status"), svc_data.get("port"), svc_data.get("port_open"),
                )

    logger.info("=== Overseer scan complete ===")


def main():
    parser = argparse.ArgumentParser(description="Overseer scanner")
    parser.add_argument(
        "--type", choices=["all", "git", "fs", "svc"], default="all",
        help="Scan type: all, git, fs, svc",
    )
    args = parser.parse_args()
    run_scan(args.type)


if __name__ == "__main__":
    main()

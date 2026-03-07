"""Action executor — cleanup, pruning, archiving."""

import os
import shutil
import subprocess
from pathlib import Path

from .config import logger


def delete_junk(project_path: str, dry_run: bool = True) -> dict:
    """Delete junk files/dirs (node_modules cache, __pycache__, etc.)."""
    junk_dirs = {"__pycache__", ".mypy_cache", ".pytest_cache", ".cache", ".turbo", "coverage", ".nyc_output"}
    root = Path(project_path)
    deleted = []
    total_mb = 0.0

    for dirpath, dirnames, _ in os.walk(str(root)):
        if ".git" in dirpath:
            continue
        for d in dirnames:
            if d in junk_dirs:
                full = os.path.join(dirpath, d)
                rel = os.path.relpath(full, str(root))
                size = _dir_size(full)
                size_mb = round(size / (1024 * 1024), 2)
                deleted.append({"path": rel, "size_mb": size_mb})
                total_mb += size_mb
                if not dry_run:
                    shutil.rmtree(full, ignore_errors=True)
                    logger.info("Deleted %s (%.1f MB)", rel, size_mb)

    return {
        "action": "delete_junk",
        "dry_run": dry_run,
        "items": deleted,
        "total_mb": round(total_mb, 2),
    }


def prune_branches(project_path: str, dry_run: bool = True) -> dict:
    """Prune merged and stale branches."""
    pruned = []
    try:
        # Get merged branches (except current and main/master)
        result = subprocess.run(
            ["git", "branch", "--merged"],
            cwd=project_path, capture_output=True, text=True, timeout=10,
        )
        for line in result.stdout.splitlines():
            branch = line.strip().lstrip("* ")
            if branch in ("main", "master", ""):
                continue
            pruned.append(branch)
            if not dry_run:
                subprocess.run(
                    ["git", "branch", "-d", branch],
                    cwd=project_path, capture_output=True, timeout=10,
                )
                logger.info("Pruned branch: %s", branch)
    except Exception as e:
        logger.error("prune_branches error: %s", e)

    return {
        "action": "prune_branches",
        "dry_run": dry_run,
        "branches": pruned,
        "count": len(pruned),
    }


def archive_project(project_path: str, dry_run: bool = True) -> dict:
    """Archive a project (tar.gz + mark as archived)."""
    root = Path(project_path)
    archive_name = f"{root.name}.tar.gz"
    archive_path = root.parent / "archives" / archive_name

    if dry_run:
        return {
            "action": "archive",
            "dry_run": True,
            "archive_path": str(archive_path),
            "source": str(root),
        }

    archive_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        subprocess.run(
            ["tar", "-czf", str(archive_path), "-C", str(root.parent), root.name],
            check=True, timeout=300,
        )
        logger.info("Archived %s → %s", root, archive_path)
    except Exception as e:
        logger.error("archive error: %s", e)
        return {"action": "archive", "dry_run": False, "error": str(e)}

    return {
        "action": "archive",
        "dry_run": False,
        "archive_path": str(archive_path),
        "source": str(root),
    }


def _dir_size(path: str) -> int:
    total = 0
    for dirpath, _, filenames in os.walk(path):
        for f in filenames:
            try:
                total += os.path.getsize(os.path.join(dirpath, f))
            except OSError:
                pass
    return total


ACTIONS = {
    "delete_junk": delete_junk,
    "prune_branches": prune_branches,
    "archive": archive_project,
}


def execute(action_type: str, project_path: str, dry_run: bool = True) -> dict:
    """Execute an action by type."""
    fn = ACTIONS.get(action_type)
    if not fn:
        return {"error": f"Unknown action: {action_type}"}
    return fn(project_path, dry_run=dry_run)

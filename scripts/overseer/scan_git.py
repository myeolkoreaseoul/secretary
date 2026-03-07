"""Git status scanner — collects commit, branch, and dirty-state info."""

import subprocess
from datetime import datetime, timezone
from pathlib import Path

from .config import logger


def _run(cmd: list[str], cwd: str) -> str:
    """Run a git command and return stdout, empty string on error."""
    try:
        r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=15)
        return r.stdout.strip()
    except Exception as e:
        logger.warning("git cmd failed in %s: %s", cwd, e)
        return ""


def scan(project: dict) -> dict | None:
    """Scan a single project's git status. Returns snapshot dict or None."""
    path = project["path"]
    if not Path(path).joinpath(".git").exists():
        logger.info("No .git in %s, skipping", path)
        return None

    # Current branch
    branch = _run(["git", "rev-parse", "--abbrev-ref", "HEAD"], path) or "unknown"

    # Latest commit
    log_line = _run(
        ["git", "log", "-1", "--format=%H|%s|%aI"], path
    )
    commit_hash = commit_msg = ""
    commit_date = None
    if log_line and "|" in log_line:
        parts = log_line.split("|", 2)
        commit_hash = parts[0][:12]
        commit_msg = parts[1][:200] if len(parts) > 1 else ""
        if len(parts) > 2:
            try:
                commit_date = datetime.fromisoformat(parts[2])
            except ValueError:
                pass

    # Unpushed commits
    unpushed_out = _run(
        ["git", "log", "--oneline", f"{branch}@{{upstream}}..{branch}"], path
    )
    unpushed = len(unpushed_out.splitlines()) if unpushed_out else 0

    # Uncommitted (staged + unstaged)
    status_out = _run(["git", "status", "--porcelain"], path)
    lines = status_out.splitlines() if status_out else []
    uncommitted = sum(1 for l in lines if l and not l.startswith("??"))
    untracked = sum(1 for l in lines if l.startswith("??"))

    # Branches and stale detection
    branches_out = _run(
        ["git", "for-each-ref", "--format=%(refname:short)|%(committerdate:iso)", "refs/heads/"],
        path,
    )
    branch_list = []
    stale_count = 0
    now = datetime.now(timezone.utc)
    for line in (branches_out.splitlines() if branches_out else []):
        if "|" not in line:
            continue
        bname, bdate_str = line.split("|", 1)
        try:
            bdate = datetime.fromisoformat(bdate_str.strip())
            days_old = (now - bdate).days
        except ValueError:
            days_old = 0
        branch_list.append({"name": bname, "days_old": days_old})
        if days_old > 30 and bname not in ("main", "master"):
            stale_count += 1

    return {
        "branch": branch,
        "commit_hash": commit_hash,
        "commit_msg": commit_msg,
        "commit_date": commit_date.isoformat() if commit_date else None,
        "unpushed": unpushed,
        "uncommitted": uncommitted,
        "untracked": untracked,
        "stale_branches": stale_count,
        "branch_list": branch_list,
    }

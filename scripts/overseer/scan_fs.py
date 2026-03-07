"""Filesystem health scanner — size, junk files, largest files."""

import os
from pathlib import Path

from .config import logger

JUNK_PATTERNS = {
    "node_modules",
    "__pycache__",
    ".next",
    ".turbo",
    "dist",
    ".cache",
    "*.log",
    ".DS_Store",
    "Thumbs.db",
    "*.pyc",
    ".mypy_cache",
    ".pytest_cache",
    "coverage",
    ".nyc_output",
}

JUNK_DIRS = {"node_modules", "__pycache__", ".next", ".turbo", ".cache", ".mypy_cache", ".pytest_cache", "coverage", ".nyc_output"}


def _dir_size_mb(path: str) -> float:
    """Calculate directory size in MB."""
    total = 0
    try:
        for dirpath, _, filenames in os.walk(path):
            for f in filenames:
                fp = os.path.join(dirpath, f)
                try:
                    total += os.path.getsize(fp)
                except OSError:
                    pass
    except OSError:
        pass
    return round(total / (1024 * 1024), 2)


def scan(project: dict) -> dict | None:
    """Scan filesystem health. Returns snapshot dict or None."""
    root = Path(project["path"])
    if not root.exists():
        logger.info("Path %s doesn't exist, skipping fs scan", root)
        return None

    total_size = 0
    node_modules_size = 0
    junk_mb = 0.0
    junk_files: list[dict] = []
    file_count = 0
    dir_count = 0
    file_sizes: list[tuple[str, int]] = []

    for dirpath, dirnames, filenames in os.walk(str(root)):
        rel = os.path.relpath(dirpath, str(root))
        dirname = os.path.basename(dirpath)

        # Skip .git internals
        if ".git" in rel.split(os.sep):
            continue

        dir_count += 1

        # Check if current dir is junk
        if dirname in JUNK_DIRS:
            size = _dir_size_mb(dirpath)
            if dirname == "node_modules":
                node_modules_size += size
            junk_mb += size
            if size > 1:
                junk_files.append({"path": rel, "size_mb": size, "type": "dir"})
            dirnames.clear()  # Don't recurse into junk dirs
            continue

        for fname in filenames:
            fpath = os.path.join(dirpath, fname)
            try:
                fsize = os.path.getsize(fpath)
            except OSError:
                continue
            total_size += fsize
            file_count += 1
            file_sizes.append((os.path.relpath(fpath, str(root)), fsize))

    # Top 10 largest files
    file_sizes.sort(key=lambda x: x[1], reverse=True)
    largest = [
        {"path": p, "size_mb": round(s / (1024 * 1024), 2)}
        for p, s in file_sizes[:10]
    ]

    return {
        "total_size_mb": round(total_size / (1024 * 1024), 2) + junk_mb,
        "node_modules_mb": round(node_modules_size, 2),
        "junk_mb": round(junk_mb, 2),
        "junk_files": junk_files[:50],  # Cap at 50
        "file_count": file_count,
        "dir_count": dir_count,
        "largest_files": largest,
    }

"""Service scanner — pm2 processes, ports, tunnels."""

import json
import socket
import subprocess

from .config import logger


def _run(cmd: str) -> str:
    try:
        r = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=10)
        return r.stdout.strip()
    except Exception as e:
        logger.warning("cmd failed: %s — %s", cmd, e)
        return ""


def _check_port(port: int) -> bool:
    """Check if a port is listening."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(2)
            return s.connect_ex(("127.0.0.1", port)) == 0
    except Exception:
        return False


def _get_pm2_processes() -> dict[str, dict]:
    """Get pm2 process list keyed by name."""
    raw = _run("pm2 jlist 2>/dev/null")
    if not raw:
        return {}
    try:
        procs = json.loads(raw)
        return {
            p["name"]: {
                "status": p.get("pm2_env", {}).get("status", "unknown"),
                "pid": p.get("pid"),
                "memory": p.get("monit", {}).get("memory", 0),
                "cpu": p.get("monit", {}).get("cpu", 0),
            }
            for p in procs
        }
    except (json.JSONDecodeError, KeyError) as e:
        logger.warning("pm2 parse error: %s", e)
        return {}


# Known service mappings: project_name -> {pm2_name, port, tunnel_url}
SERVICE_MAP = {
    "secretary": {"pm2_name": "secretary-bot", "port": 3000, "tunnel_url": None},
    "jd-platform": {"pm2_name": None, "port": 3001, "tunnel_url": None},
    "svvys": {"pm2_name": None, "port": 3002, "tunnel_url": None},
    "jd-audit-portal": {"pm2_name": None, "port": 3003, "tunnel_url": None},
}


def scan(project: dict) -> dict | None:
    """Scan service status for a project. Returns snapshot dict or None."""
    name = project["name"]
    svc = SERVICE_MAP.get(name)
    if not svc:
        return None

    pm2_procs = _get_pm2_processes()

    pm2_name = svc.get("pm2_name")
    pm2_status = None
    if pm2_name and pm2_name in pm2_procs:
        pm2_status = pm2_procs[pm2_name]["status"]

    port = svc.get("port")
    port_open = _check_port(port) if port else False

    tunnel_url = svc.get("tunnel_url")
    tunnel_alive = False
    if tunnel_url:
        try:
            r = subprocess.run(
                ["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}", tunnel_url],
                capture_output=True, text=True, timeout=5,
            )
            tunnel_alive = r.stdout.strip() in ("200", "301", "302")
        except Exception:
            pass

    return {
        "pm2_status": pm2_status,
        "pm2_name": pm2_name,
        "port": port,
        "port_open": port_open,
        "tunnel_url": tunnel_url,
        "tunnel_alive": tunnel_alive,
        "extras": pm2_procs.get(pm2_name, {}),
    }

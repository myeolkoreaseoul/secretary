#!/bin/bash
# Secretary server backup script
# Backs up critical config and code to a timestamped archive

set -euo pipefail

BACKUP_DIR="/home/john/backups"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/backup_${DATE}.tar.gz"

mkdir -p "$BACKUP_DIR"

tar czf "$BACKUP_FILE" \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='__pycache__' \
  --exclude='.venv' \
  /home/john/projects/secretary/ \
  /home/john/.config/systemd/user/ \
  /home/john/.ssh/authorized_keys \
  /home/john/.bashrc \
  /home/john/.config/openclaw-gateway.env \
  2>/dev/null

# Keep only last 7 backups
ls -t "${BACKUP_DIR}"/backup_*.tar.gz 2>/dev/null | tail -n +8 | xargs -r rm

echo "Backup created: ${BACKUP_FILE} ($(du -h "$BACKUP_FILE" | cut -f1))"

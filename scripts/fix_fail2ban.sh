#!/bin/bash
# Fix fail2ban to work with UFW
# Run with: sudo bash /home/john/projects/secretary/scripts/fix_fail2ban.sh

set -euo pipefail

cat > /etc/fail2ban/jail.local << 'EOF'
[DEFAULT]
banaction = ufw
ignoreip = 127.0.0.1/8 ::1 100.126.175.94

[sshd]
enabled = true
port = ssh
filter = sshd
maxretry = 3
bantime = 86400
findtime = 600
EOF

systemctl restart fail2ban
echo "fail2ban updated:"
fail2ban-client status sshd

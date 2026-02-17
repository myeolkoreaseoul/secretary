#!/bin/bash
# Secretary Server Security Setup Script
# Run with: sudo bash /home/john/projects/secretary/scripts/setup_security.sh

set -euo pipefail

echo "=== A-1: SSH Hardening ==="
# Backup original
cp /etc/ssh/sshd_config /etc/ssh/sshd_config.bak.$(date +%Y%m%d)

sed -i 's/^#PermitRootLogin prohibit-password$/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/^#MaxAuthTries 6$/MaxAuthTries 3/' /etc/ssh/sshd_config
sed -i 's/^PasswordAuthentication yes$/PasswordAuthentication no/' /etc/ssh/sshd_config

echo "SSH config updated. Verifying:"
grep -E '^(PasswordAuthentication|PermitRootLogin|MaxAuthTries)' /etc/ssh/sshd_config

# Reload (not restart) to keep existing sessions
systemctl reload ssh
echo "SSH reloaded (existing sessions preserved)"

echo ""
echo "=== A-2: UFW Firewall ==="
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow in on tailscale0
echo "y" | ufw enable
ufw status verbose
echo "Firewall enabled"

echo ""
echo "=== A-5: fail2ban + unattended-upgrades ==="
apt-get update -qq
apt-get install -y fail2ban unattended-upgrades

# Enable fail2ban for SSH
cat > /etc/fail2ban/jail.local << 'JAILEOF'
[sshd]
enabled = true
port = ssh
filter = sshd
maxretry = 5
bantime = 3600
findtime = 600
JAILEOF

systemctl enable fail2ban
systemctl restart fail2ban

# Enable unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades 2>/dev/null || true
systemctl enable unattended-upgrades

echo ""
echo "=== Security setup complete ==="
echo ""
echo "IMPORTANT: Test SSH login from another terminal before closing this session!"
echo "  ssh john@<your-ip>"
echo "Password login should be REJECTED. Key login should WORK."

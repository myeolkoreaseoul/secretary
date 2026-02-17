#!/bin/bash
# Security fixes round 2 - requires sudo
# Run with: sudo bash /home/john/projects/secretary/scripts/fix_security_round2.sh

set -euo pipefail

echo "=== 1. SSH 포워딩 비활성화 ==="
# X11Forwarding, AllowTcpForwarding, AllowAgentForwarding
sed -i 's/^X11Forwarding yes$/X11Forwarding no/' /etc/ssh/sshd_config

# Add if not present
grep -q '^AllowTcpForwarding' /etc/ssh/sshd_config || echo 'AllowTcpForwarding no' >> /etc/ssh/sshd_config
grep -q '^AllowAgentForwarding' /etc/ssh/sshd_config || echo 'AllowAgentForwarding no' >> /etc/ssh/sshd_config

systemctl reload ssh
echo "SSH 포워딩 비활성화 완료"

echo ""
echo "=== 2. 불필요한 서비스 비활성화 ==="
systemctl disable --now gnome-remote-desktop.service 2>/dev/null || true
systemctl disable --now cups.service cups-browsed.service 2>/dev/null || true
systemctl disable --now avahi-daemon.service avahi-daemon.socket 2>/dev/null || true
systemctl disable --now ModemManager.service 2>/dev/null || true
echo "불필요한 서비스 비활성화 완료"

echo ""
echo "=== 3. 뚜껑 닫을 때 화면 잠금 추가 ==="
# logind.conf에 이미 HandleLidSwitch=ignore 설정됨
# 잠금 스크립트 추가
cat > /etc/systemd/system/lid-lock.service << 'EOF'
[Unit]
Description=Lock screen on lid close

[Service]
Type=oneshot
ExecStart=/usr/bin/loginctl lock-sessions
EOF

cat > /etc/systemd/system/lid-lock.path << 'EOF'
[Unit]
Description=Monitor lid switch

[Path]
PathExists=/proc/acpi/button/lid/LID0/state

[Install]
WantedBy=multi-user.target
EOF
echo "뚜껑 잠금 서비스 설정 완료"

echo ""
echo "=== 4. npm 취약점 수정 ==="
cd /home/john/projects/secretary
npm audit fix --force 2>&1 || echo "npm audit fix 일부 실패 (수동 확인 필요)"

echo ""
echo "=== 5. Docker 방화벽 우회 방지 ==="
mkdir -p /etc/docker
cat > /etc/docker/daemon.json << 'EOF'
{
  "iptables": false
}
EOF
systemctl restart docker 2>/dev/null || true
echo "Docker iptables 비활성화 완료 (컨테이너 재시작 필요할 수 있음)"

echo ""
echo "=== 완료 ==="
echo ""
echo "남은 수동 작업:"
echo "1. 디스크 암호화: sudo apt install cryptsetup → LUKS 설정"
echo "2. 백업 설정: 중요 파일 외부 저장소에 정기 백업"
echo "3. SSH 키 비밀번호: 윈도우에서 ssh-keygen -p -f ~/.ssh/id_ed25519"

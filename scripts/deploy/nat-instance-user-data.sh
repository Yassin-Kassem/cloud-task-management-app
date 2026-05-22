#!/bin/bash
###############################################################################
# Mini-Jira — NAT Instance user-data script  (Milestone 7)
#
# Paste this into the "User data" field when launching the NAT instance
# (t2.micro, Amazon Linux 2023, in a PUBLIC subnet).
#
# A plain EC2 instance does NOT route traffic by default. To act as a NAT for
# the private subnets it must:
#   1. enable IPv4 forwarding in the kernel
#   2. masquerade (SNAT) outbound traffic from the VPC CIDR
#
# You ALSO must, in the EC2 console, on this instance:
#   Actions -> Networking -> Change source/destination check -> STOP / disable
# (a NAT forwards packets that are not addressed to itself, so the check that
# normally drops such packets must be turned off).
#
# Logs: /var/log/cloud-init-output.log
###############################################################################
set -x
echo "=== NAT instance setup START $(date -u) ==="

# --- 1. Enable IPv4 forwarding (persists across reboots) ---------------------
cat > /etc/sysctl.d/99-nat.conf <<'EOF'
net.ipv4.ip_forward = 1
EOF
sysctl -p /etc/sysctl.d/99-nat.conf

# --- 2. Masquerade outbound traffic from the VPC -----------------------------
# Detect the primary network interface (e.g. eth0 / ens5).
IFACE=$(ip route show default | awk '/default/ {print $5; exit}')
echo "Primary interface: ${IFACE}"

# SNAT everything coming from the VPC CIDR out through the public interface.
iptables -t nat -A POSTROUTING -o "${IFACE}" -s 10.0.0.0/16 -j MASQUERADE
iptables -P FORWARD ACCEPT

# --- 3. Persist iptables rules across reboots --------------------------------
yum install -y iptables-services
service iptables save
systemctl enable iptables

echo "=== NAT instance setup END $(date -u) ==="

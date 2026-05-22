#!/bin/bash
###############################################################################
# Mini-Jira — EC2 user-data script  (Milestone 7)
#
# Paste this whole file into the "User data" field of the Launch Template.
# It runs ONCE on first boot of every Auto Scaling Group instance and:
#   1. adds swap (t2.micro has only 1 GB RAM)
#   2. installs git + Node.js 20
#   3. clones the repo from GitHub
#   4. writes the backend environment file (NO AWS keys — the IAM role provides
#      credentials via the instance metadata service)
#   5. builds the backend (npm install + tsc -> dist/)
#   6. runs it under systemd on port 3001, restarting on crash/reboot
#
# Logs: /var/log/user-data.log  and  /var/log/cloud-init-output.log
# Check the running service with:  sudo systemctl status mini-jira
#                                  sudo journalctl -u mini-jira -f
#
# Requires: the private subnet's route table must already point 0.0.0.0/0 at a
# working NAT instance — otherwise git/npm cannot reach the internet.
###############################################################################
set -x
exec > >(tee -a /var/log/user-data.log) 2>&1
echo "=== Mini-Jira user-data START $(date -u) ==="

# --- Config ------------------------------------------------------------------
REPO_URL="https://github.com/Yassin-Kassem/cloud-task-management-app.git"
APP_DIR="/opt/mini-jira/app"
BACKEND_DIR="${APP_DIR}/backend"
ENV_FILE="${APP_DIR}/.env"
RUN_USER="ec2-user"

# --- 1. Swap file ------------------------------------------------------------
# npm install (AWS SDK) + tsc can exhaust 1 GB of RAM on t2.micro. 2 GB of swap
# keeps the build from being OOM-killed.
if [ ! -f /swapfile ]; then
  dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile swap swap defaults 0 0' >> /etc/fstab
fi

# --- 2. System packages ------------------------------------------------------
yum update -y
yum install -y git

# --- 3. Node.js 20 (NodeSource) ---------------------------------------------
curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
yum install -y nodejs
echo "node version: $(node --version)"
echo "npm version:  $(npm --version)"

# --- 4. Clone the application repo ------------------------------------------
mkdir -p /opt/mini-jira
rm -rf "${APP_DIR}"
git clone --depth 1 "${REPO_URL}" "${APP_DIR}"

# --- 5. Backend environment file --------------------------------------------
# IMPORTANT: no AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY here. In production the
# AWS SDK picks up temporary credentials from the EC2 IAM role automatically.
# No DYNAMODB_ENDPOINT either — NODE_ENV=production makes the app target real
# AWS DynamoDB. Table names default to Users/Teams/Projects/Tasks/Comments/
# ActivityLog, which is exactly what create-tables-aws.ts creates.
cat > "${ENV_FILE}" <<'ENVEOF'
NODE_ENV=production
AWS_REGION=eu-central-1
PORT=3001
COGNITO_USER_POOL_ID=eu-central-1_hzNncGJkv
COGNITO_CLIENT_ID=65rhpmjd7bj1re37cgein94ugt
S3_ORIGINALS_BUCKET=ini-jira-originals-yassin2026
S3_RESIZED_BUCKET=mini-jira-resized-yassin2026
SNS_TASK_ASSIGNED_ARN=arn:aws:sns:eu-central-1:170732362530:mini-jira-task-assigned
ENVEOF

# --- 6. Build the backend ----------------------------------------------------
cd "${BACKEND_DIR}"
# --include=dev forces devDependencies (typescript) to install even if some
# layer of the AMI sets NODE_ENV=production.
npm install --include=dev
npm run build   # tsc -> backend/dist/

# --- 7. Ownership ------------------------------------------------------------
chown -R "${RUN_USER}:${RUN_USER}" /opt/mini-jira

# --- 8. systemd service ------------------------------------------------------
# WorkingDirectory is the backend dir, so app.ts's dotenv lookup of ../.env
# resolves to ENV_FILE. EnvironmentFile loads the same file into the process
# environment as a belt-and-suspenders guarantee.
cat > /etc/systemd/system/mini-jira.service <<EOF
[Unit]
Description=Mini-Jira backend API
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${RUN_USER}
WorkingDirectory=${BACKEND_DIR}
EnvironmentFile=${ENV_FILE}
ExecStart=/usr/bin/node ${BACKEND_DIR}/dist/app.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable mini-jira
systemctl start mini-jira

# --- 9. Smoke test -----------------------------------------------------------
sleep 5
echo "Health check:"
curl -s --max-time 10 http://localhost:3001/api/health || echo "  (health check failed — see: journalctl -u mini-jira)"
echo ""
echo "=== Mini-Jira user-data END $(date -u) ==="

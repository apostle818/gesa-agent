#!/usr/bin/env bash

# Author: apostle818
# License: MIT
# Source: https://github.com/apostle818/gesa-agent

source /dev/stdin <<<"$FUNCTIONS_FILE_PATH"
color
verb_ip6
catch_errors
setting_up_container
network_check
update_os

msg_info "Installing Dependencies"
STD apt-get install -y \
  git \
  curl \
  ca-certificates \
  gnupg2
msg_ok "Installed Dependencies"

msg_info "Installing Node.js 20"
curl -fsSL https://deb.nodesource.com/setup_20.x | STD bash -
STD apt-get install -y nodejs
msg_ok "Installed Node.js $(node --version)"

msg_info "Cloning ${APP}"
STD git clone https://github.com/apostle818/gesa-agent /opt/gesa-agent
msg_ok "Cloned ${APP}"

msg_info "Writing environment file"
cat >/opt/gesa-agent/.env.local <<'EOF'
ANTHROPIC_API_KEY=CHANGE_ME
MISTRAL_API_KEY=CHANGE_ME
EOF
chmod 600 /opt/gesa-agent/.env.local
msg_ok "Created .env.local (edit API keys before starting the service)"

msg_info "Installing npm dependencies"
cd /opt/gesa-agent
STD npm install --omit=dev
msg_ok "Installed dependencies"

msg_info "Building ${APP}"
STD npm run build
msg_ok "Built ${APP}"

msg_info "Creating service"
cat >/etc/systemd/system/gesa-agent.service <<'EOF'
[Unit]
Description=GESA Multi-Agent Chatbox
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/gesa-agent
ExecStart=/usr/bin/node /opt/gesa-agent/node_modules/.bin/next start -p 3000
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
EnvironmentFile=/opt/gesa-agent/.env.local

[Install]
WantedBy=multi-user.target
EOF
systemctl enable -q --now gesa-agent
msg_ok "Created service"

motd_ssh
customize
cleanup_lxc

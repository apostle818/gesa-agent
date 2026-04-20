#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# gesa-agent — Proxmox LXC installer
# Run this script on the Proxmox VE host as root.
# ---------------------------------------------------------------------------

# ── configurable defaults ───────────────────────────────────────────────────
CT_ID="${CT_ID:-200}"
CT_HOSTNAME="${CT_HOSTNAME:-gesa-agent}"
CT_MEMORY="${CT_MEMORY:-1024}"   # MB
CT_SWAP="${CT_SWAP:-512}"        # MB
CT_CORES="${CT_CORES:-2}"
CT_DISK="${CT_DISK:-8}"          # GB (local-lvm thin)
CT_STORAGE="${CT_STORAGE:-local-lvm}"
CT_BRIDGE="${CT_BRIDGE:-vmbr0}"
APP_PORT="${APP_PORT:-3000}"
APP_DIR="/opt/gesa-agent"
TEMPLATE_STORAGE="${TEMPLATE_STORAGE:-local}"
DEBIAN_TEMPLATE="debian-12-standard_12.7-1_amd64.tar.zst"

# ── helpers ─────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()    { echo -e "${GREEN}[+]${NC} $*"; }
warn()    { echo -e "${YELLOW}[!]${NC} $*"; }
err_exit(){ echo -e "${RED}[✗]${NC} $*" >&2; exit 1; }

check_root()   { [[ $EUID -eq 0 ]] || err_exit "Must be run as root on the Proxmox host."; }
check_pct()    { command -v pct &>/dev/null || err_exit "'pct' not found — is this a Proxmox VE host?"; }
check_ct_free(){ pct status "$CT_ID" &>/dev/null && err_exit "CT $CT_ID already exists. Set CT_ID=<other> and re-run."; true; }

# ── API key prompt ───────────────────────────────────────────────────────────
prompt_keys() {
  echo
  echo "Enter API keys (input is hidden)."
  if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
    read -r -s -p "  ANTHROPIC_API_KEY: " ANTHROPIC_API_KEY; echo
  fi
  if [[ -z "${MISTRAL_API_KEY:-}" ]]; then
    read -r -s -p "  MISTRAL_API_KEY:   " MISTRAL_API_KEY; echo
  fi
  [[ -n "$ANTHROPIC_API_KEY" ]] || err_exit "ANTHROPIC_API_KEY is required."
  [[ -n "$MISTRAL_API_KEY"   ]] || err_exit "MISTRAL_API_KEY is required."
}

# ── template ─────────────────────────────────────────────────────────────────
ensure_template() {
  local tmpl_path
  tmpl_path="$(pvesm path "${TEMPLATE_STORAGE}:vztmpl/${DEBIAN_TEMPLATE}" 2>/dev/null || true)"

  if [[ -z "$tmpl_path" || ! -f "$tmpl_path" ]]; then
    info "Downloading Debian 12 template…"
    pveam update
    pveam download "$TEMPLATE_STORAGE" "$DEBIAN_TEMPLATE" \
      || err_exit "Template download failed. Check 'pveam available' for the correct filename."
  else
    info "Template already present."
  fi
}

# ── package app ──────────────────────────────────────────────────────────────
package_app() {
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  TARBALL="$(mktemp /tmp/gesa-agent-XXXXXX.tar.gz)"

  info "Packaging app from ${SCRIPT_DIR}…"
  tar -czf "$TARBALL" \
    --exclude='.git' \
    --exclude='.next' \
    --exclude='node_modules' \
    --exclude='*.tar.gz' \
    -C "$SCRIPT_DIR" .

  echo "$TARBALL"
}

# ── create container ──────────────────────────────────────────────────────────
create_ct() {
  info "Creating LXC container ${CT_ID}…"
  pct create "$CT_ID" "${TEMPLATE_STORAGE}:vztmpl/${DEBIAN_TEMPLATE}" \
    --hostname "$CT_HOSTNAME" \
    --memory "$CT_MEMORY" \
    --swap "$CT_SWAP" \
    --cores "$CT_CORES" \
    --rootfs "${CT_STORAGE}:${CT_DISK}" \
    --net0 "name=eth0,bridge=${CT_BRIDGE},ip=dhcp,ip6=auto" \
    --unprivileged 1 \
    --features nesting=1 \
    --start 1 \
    --onboot 1

  info "Waiting for container network…"
  local retries=20
  while (( retries-- > 0 )); do
    if pct exec "$CT_ID" -- ping -c1 -W2 8.8.8.8 &>/dev/null; then
      info "Network is up."
      return 0
    fi
    sleep 3
  done
  err_exit "Container did not reach the network within 60 s."
}

# ── deploy app ────────────────────────────────────────────────────────────────
deploy_app() {
  local tarball="$1"

  info "Transferring app archive…"
  pct push "$CT_ID" "$tarball" /tmp/gesa-agent.tar.gz

  info "Installing Node.js 20 and build tools…"
  pct exec "$CT_ID" -- bash -c '
    set -e
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq
    apt-get install -y -qq curl ca-certificates gnupg2
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null 2>&1
    apt-get install -y -qq nodejs
    node --version
  '

  info "Extracting app to ${APP_DIR}…"
  pct exec "$CT_ID" -- bash -c "
    set -e
    mkdir -p ${APP_DIR}
    tar -xzf /tmp/gesa-agent.tar.gz -C ${APP_DIR}
    rm /tmp/gesa-agent.tar.gz
  "

  info "Writing .env.local…"
  pct exec "$CT_ID" -- bash -c "
    cat > ${APP_DIR}/.env.local <<'ENVEOF'
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
MISTRAL_API_KEY=${MISTRAL_API_KEY}
ENVEOF
    chmod 600 ${APP_DIR}/.env.local
  "

  info "Installing dependencies and building…"
  pct exec "$CT_ID" -- bash -c "
    set -e
    cd ${APP_DIR}
    npm install --omit=dev 2>&1 | tail -5
    npm run build 2>&1 | tail -10
  "
}

# ── systemd service ───────────────────────────────────────────────────────────
install_service() {
  info "Installing systemd service…"
  pct exec "$CT_ID" -- bash -c "
    cat > /etc/systemd/system/gesa-agent.service <<'SVCEOF'
[Unit]
Description=gesa-agent Multi-Agent Chatbox
After=network.target

[Service]
Type=simple
WorkingDirectory=${APP_DIR}
ExecStart=/usr/bin/node ${APP_DIR}/node_modules/.bin/next start -p ${APP_PORT}
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
Environment=NODE_ENV=production
EnvironmentFile=${APP_DIR}/.env.local

[Install]
WantedBy=multi-user.target
SVCEOF

    systemctl daemon-reload
    systemctl enable --now gesa-agent
  "
}

# ── summary ───────────────────────────────────────────────────────────────────
print_summary() {
  local ct_ip
  ct_ip="$(pct exec "$CT_ID" -- hostname -I 2>/dev/null | awk '{print $1}' || echo '<pending>')"

  echo
  echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${GREEN}  gesa-agent deployed successfully!${NC}"
  echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo "  Container ID : ${CT_ID}"
  echo "  Hostname     : ${CT_HOSTNAME}"
  echo "  IP address   : ${ct_ip}"
  echo "  App URL      : http://${ct_ip}:${APP_PORT}"
  echo
  echo "  Manage service:"
  echo "    pct exec ${CT_ID} -- systemctl status gesa-agent"
  echo "    pct exec ${CT_ID} -- journalctl -u gesa-agent -f"
  echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# ── main ──────────────────────────────────────────────────────────────────────
main() {
  check_root
  check_pct
  check_ct_free

  echo
  echo "gesa-agent LXC installer"
  echo "  CT ID      : ${CT_ID}"
  echo "  Hostname   : ${CT_HOSTNAME}"
  echo "  Memory     : ${CT_MEMORY} MB"
  echo "  Cores      : ${CT_CORES}"
  echo "  Disk       : ${CT_DISK} GB on ${CT_STORAGE}"
  echo "  Bridge     : ${CT_BRIDGE}"
  echo "  App port   : ${APP_PORT}"
  echo

  prompt_keys

  local tarball
  tarball="$(package_app)"
  # shellcheck disable=SC2064
  trap "rm -f '$tarball'" EXIT

  ensure_template
  create_ct
  deploy_app "$tarball"
  install_service
  print_summary
}

main "$@"

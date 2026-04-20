#!/usr/bin/env bash
source <(curl -fsSL https://raw.githubusercontent.com/apostle818/gesa-agent/main/misc/build.func)
# Author: apostle818
# License: MIT
# Source: https://github.com/apostle818/gesa-agent

APP="GESA-Agent"
var_tags="${var_tags:-ai;chat}"
var_cpu="${var_cpu:-2}"
var_ram="${var_ram:-1024}"
var_disk="${var_disk:-8}"
var_os="${var_os:-debian}"
var_version="${var_version:-12}"
var_unprivileged="${var_unprivileged:-1}"

header_info "$APP"
variables
color
catch_errors

function update_script() {
  header_info
  check_container_storage
  check_container_resources

  if [[ ! -d /opt/gesa-agent ]]; then
    msg_error "No ${APP} Installation Found!"
    exit
  fi

  msg_info "Stopping Service"
  systemctl stop gesa-agent
  msg_ok "Stopped Service"

  msg_info "Updating ${APP}"
  git -C /opt/gesa-agent pull --ff-only
  cd /opt/gesa-agent && npm install --omit=dev && npm run build
  msg_ok "Updated ${APP}"

  msg_info "Starting Service"
  systemctl start gesa-agent
  msg_ok "Started Service"

  msg_ok "Updated Successfully"
  exit
}

start
build_container
description

msg_ok "Completed Successfully!\n"
echo -e "${CREATING}${GN}${APP} setup has been successfully initialized!${CL}"
echo -e "${INFO}${YW} Access it using the following URL:${CL}"
echo -e "${TAB}${GATEWAY}${BGN}http://${IP}:3000${CL}"
echo -e "${INFO}${YW} Set your API keys inside the container:${CL}"
echo -e "${TAB}${DGN}pct exec ${CTID} -- nano /opt/gesa-agent/.env.local${CL}"

#!/usr/bin/env bash
# FTTH Kalkulator - Auto Install Script for Ubuntu 22.04+
# Usage (default to latest prepared tag v1.0.2):
#   curl -O https://raw.githubusercontent.com/erlangh/ftth-kalkulator/main/scripts/install_ubuntu_22.sh
#   chmod +x install_ubuntu_22.sh
#   sudo ./install_ubuntu_22.sh --tag v1.0.2 --port 5173 --dir /opt/ftth-kalkulator --user ubuntu
# Options:
#   --tag   Release tag to install (e.g. v1.0.2)
#   --port  Service port (default: 5173)
#   --dir   Install directory (default: /opt/ftth-kalkulator)
#   --user  System user to run the service (default: ubuntu)
#   --source release|git (default: release) - download ZIP from Releases or clone repo

set -euo pipefail

APP_NAME="ftth-kalkulator"
REPO="erlangh/ftth-kalkulator"
TAG="v1.0.2"
PORT="5173"
INSTALL_DIR="/opt/ftth-kalkulator"
RUN_USER="ubuntu"
SOURCE="release" # or "git"

log() {
  echo -e "[install] $1"
}

err() {
  echo -e "[error] $1" >&2
}

usage() {
  sed -n '1,100p' "$0"
}

while [[ ${1:-} ]]; do
  case "$1" in
    --tag) TAG="$2"; shift 2;;
    --port) PORT="$2"; shift 2;;
    --dir) INSTALL_DIR="$2"; shift 2;;
    --user) RUN_USER="$2"; shift 2;;
    --source) SOURCE="$2"; shift 2;;
    -h|--help) usage; exit 0;;
    *) err "Unknown option: $1"; usage; exit 1;;
  esac
done

if [[ -z "$TAG" ]]; then
  err "TAG tidak boleh kosong. Gunakan --tag vX.Y.Z"
  exit 1
fi

log "Install dependencies (curl, unzip, nodejs, npm, systemd)..."
sudo apt-get update -y
sudo apt-get install -y curl unzip ca-certificates nodejs npm

log "Create install dir: $INSTALL_DIR"
sudo mkdir -p "$INSTALL_DIR"
sudo chown "$RUN_USER":"$RUN_USER" "$INSTALL_DIR"

cd "$INSTALL_DIR"

if [[ "$SOURCE" == "git" ]]; then
  log "Clone repo via git (branch main)"
  if ! command -v git >/dev/null 2>&1; then
    sudo apt-get install -y git
  fi
  sudo -u "$RUN_USER" bash -c "git clone https://github.com/$REPO . && git checkout main"
else
  ZIP_NAME="FTTH-Kalkulator-$TAG.zip"
  CHECKSUM_NAME="FTTH-Kalkulator-$TAG.zip.sha256"
  RELEASE_BASE_URL="https://github.com/$REPO/releases/download/$TAG"
  ZIP_URL="$RELEASE_BASE_URL/$ZIP_NAME"
  CHECKSUM_URL="$RELEASE_BASE_URL/$CHECKSUM_NAME"

  log "Download release asset: $ZIP_URL"
  sudo -u "$RUN_USER" bash -c "curl -L -o $ZIP_NAME $ZIP_URL"

  if curl -sSfL "$CHECKSUM_URL" -o "$CHECKSUM_NAME"; then
    log "Verifikasi checksum: $CHECKSUM_NAME"
    sha256sum -c "$CHECKSUM_NAME"
  else
    log "Checksum tidak tersedia, lanjut tanpa verifikasi"
  fi

  log "Extract ZIP ke $INSTALL_DIR"
  sudo -u "$RUN_USER" bash -c "unzip -o $ZIP_NAME && rm -f $ZIP_NAME"
fi

log "Install production dependencies"
sudo -u "$RUN_USER" bash -c "cd $INSTALL_DIR && npm install --production"

SERVICE_FILE="/etc/systemd/system/$APP_NAME.service"
log "Buat systemd service: $SERVICE_FILE"
SERVICE_CONTENT="[Unit]\nDescription=FTTH Kalkulator Service\nAfter=network.target\n\n[Service]\nType=simple\nUser=$RUN_USER\nGroup=$RUN_USER\nWorkingDirectory=$INSTALL_DIR\nEnvironment=PORT=$PORT\nExecStart=/usr/bin/node $INSTALL_DIR/server.js\nRestart=always\nRestartSec=5\n\n[Install]\nWantedBy=multi-user.target\n"

printf "%s" "$SERVICE_CONTENT" | sudo tee "$SERVICE_FILE" >/dev/null

log "Reload dan start service"
sudo systemctl daemon-reload
sudo systemctl enable "$APP_NAME"
sudo systemctl restart "$APP_NAME"

sleep 1
sudo systemctl status "$APP_NAME" --no-pager || true

IP=$(curl -s http://checkip.amazonaws.com || echo "SERVER_IP")
log "Selesai. Aplikasi berjalan di http://$IP:$PORT"
log "Perintah umum:"
echo "  sudo systemctl status $APP_NAME"
echo "  sudo systemctl restart $APP_NAME"
echo "  sudo journalctl -u $APP_NAME -f"

exit 0
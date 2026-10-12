#!/usr/bin/env bash
# CEIR Linux one-shot starter
# Installs Docker (if missing), builds images (Python + Next.js deps inside),
# and runs frontend + backend + PostgreSQL.
#
# Usage (from repo root):
#   chmod +x start-all.sh
#   ./start-all.sh
#
# Stop:
#   ./start-all.sh stop
# Wipe DB volume:
#   ./start-all.sh reset

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

WEB_PORT="${WEB_PORT:-3000}"
API_PORT="${API_PORT:-8000}"
DB_PORT="${POSTGRES_PORT:-5432}"

log()  { printf '\n==> %s\n' "$*"; }
ok()   { printf '    %s\n' "$*"; }
die()  { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

need_root_for_install() {
  if [[ "${EUID}" -ne 0 ]]; then
    if command -v sudo >/dev/null 2>&1; then
      SUDO="sudo"
    else
      die "Need root (or sudo) to install packages."
    fi
  else
    SUDO=""
  fi
}

detect_os() {
  if [[ -f /etc/os-release ]]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    OS_ID="${ID:-unknown}"
    OS_LIKE="${ID_LIKE:-}"
  else
    OS_ID="unknown"
    OS_LIKE=""
  fi
}

install_docker() {
  need_root_for_install
  detect_os
  log "Installing Docker Engine + Compose plugin"

  case "${OS_ID}" in
    ubuntu|debian)
      $SUDO apt-get update -y
      $SUDO apt-get install -y ca-certificates curl gnupg
      $SUDO install -m 0755 -d /etc/apt/keyrings
      if [[ ! -f /etc/apt/keyrings/docker.gpg ]]; then
        curl -fsSL "https://download.docker.com/linux/${OS_ID}/gpg" \
          | $SUDO gpg --dearmor -o /etc/apt/keyrings/docker.gpg
        $SUDO chmod a+r /etc/apt/keyrings/docker.gpg
      fi
      echo \
        "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/${OS_ID} ${VERSION_CODENAME} stable" \
        | $SUDO tee /etc/apt/sources.list.d/docker.list >/dev/null
      $SUDO apt-get update -y
      $SUDO apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
      ;;
    centos|rhel|rocky|almalinux|fedora)
      if command -v dnf >/dev/null 2>&1; then
        PKG=dnf
      else
        PKG=yum
      fi
      $SUDO $PKG -y install yum-utils || true
      $SUDO yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo || true
      $SUDO $PKG -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
      ;;
    *)
      if [[ "${OS_LIKE}" == *debian* || "${OS_LIKE}" == *ubuntu* ]]; then
        OS_ID=ubuntu
        install_docker
        return
      fi
      die "Unsupported OS (${OS_ID}). Install Docker manually, then re-run."
      ;;
  esac

  $SUDO systemctl enable --now docker
  if [[ "${EUID}" -ne 0 ]] && ! groups | grep -qw docker; then
    $SUDO usermod -aG docker "$USER" || true
    ok "Added $USER to docker group. If 'docker' still fails, log out/in once."
  fi
}

ensure_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    install_docker
  fi

  if ! docker info >/dev/null 2>&1; then
    need_root_for_install
    $SUDO systemctl start docker || true
    if ! docker info >/dev/null 2>&1; then
      # retry with sudo if permission denied
      if $SUDO docker info >/dev/null 2>&1; then
        DOCKER=("$SUDO" docker)
      else
        die "Docker is installed but not usable. Try: sudo systemctl start docker"
      fi
    else
      DOCKER=(docker)
    fi
  else
    DOCKER=(docker)
  fi

  if ! "${DOCKER[@]}" compose version >/dev/null 2>&1; then
    die "Docker Compose plugin missing. Re-run after installing docker-compose-plugin."
  fi
}

ensure_env() {
  if [[ ! -f .env && -f .env.example ]]; then
    cp .env.example .env
    ok "Created .env from .env.example (edit secrets for production)."
  fi
}

wait_http() {
  local url="$1" label="$2" timeout="${3:-120}"
  local i=0
  while (( i < timeout )); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      ok "$label is ready."
      return 0
    fi
    sleep 2
    i=$((i + 2))
  done
  ok "$label not ready yet (check: ${DOCKER[*]} compose logs -f)"
}

cmd_start() {
  [[ "$(uname -s)" == "Linux" ]] || die "This script is for Linux deploy servers."

  ensure_docker
  ensure_env

  log "Building images (Python pip + Next.js npm deps) and starting stack"
  "${DOCKER[@]}" compose up -d --build

  log "Waiting for services"
  wait_http "http://127.0.0.1:${API_PORT}/health" "Backend" 180
  wait_http "http://127.0.0.1:${WEB_PORT}/" "Frontend" 180

  printf '\n'
  ok "Stack is up."
  ok "  Frontend : http://localhost:${WEB_PORT}"
  ok "  Backend  : http://localhost:${API_PORT}"
  ok "  API docs : http://localhost:${API_PORT}/docs"
  ok "  Postgres : localhost:${DB_PORT}"
  printf '\n'
  ok "Logs:  ${DOCKER[*]} compose logs -f"
  ok "Stop:  ./start-all.sh stop"
  ok "Reset: ./start-all.sh reset"
}

cmd_stop() {
  ensure_docker
  log "Stopping stack"
  "${DOCKER[@]}" compose down
  ok "Stopped."
}

cmd_reset() {
  ensure_docker
  log "Stopping stack and wiping DB volume"
  "${DOCKER[@]}" compose down -v
  log "Rebuilding and starting"
  ensure_env
  "${DOCKER[@]}" compose up -d --build
  ok "Reset complete."
}

case "${1:-start}" in
  start|"") cmd_start ;;
  stop)     cmd_stop ;;
  reset)    cmd_reset ;;
  *)
    echo "Usage: $0 [start|stop|reset]"
    exit 1
    ;;
esac

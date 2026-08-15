#!/usr/bin/env bash
# L7 WAY / AVLI Founder Loop — Mac-local start
# Law I: Gateway is the public surface; forge and workers bind loopback.
# Does not start the avli_cloud docker/VPS stack (Hostinger). See --vps-check.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

L7_DIR="${L7_DIR:-$HOME/.l7}"
AVLI_CLOUD="${AVLI_CLOUD:-$HOME/avli_cloud}"
STATE_DIR="${L7_DIR}/state/founder-loop"
LOG_DIR="${STATE_DIR}/logs"
SECRETS_FILE="${STATE_DIR}/secrets.env"
LOCAL_ENV="${ROOT}/.env.local"
FOUNDER_ENV="${L7_DIR}/state/founder-loop.env"
VAULT_ENV="${L7_DIR}/vault/env/founder-loop.env"

GATEWAY_BIND="${L7_BIND:-127.0.0.1}"
GATEWAY_PORT="${L7_PORT:-18789}"
FORGE_HOST="${L7_FORGE_HOST:-127.0.0.1}"
FORGE_PORT="${L7_FORGE_PORT:-7378}"
WORKER_BIND="${AVLI_WORKER_BIND:-127.0.0.1}"
WORKER_PORT="${AVLI_WORKER_PORT:-8787}"
WORKER_SDK="${AVLI_CLOUD}/packages/avli-worker-sdk"
ECHO_WORKER="${WORKER_SDK}/examples/echo_worker.py"
SKILL_RUNTIME="${L7_DIR}/programs/skill-runtime"
FORGE_PY="${SKILL_RUNTIME}/forge/forge_server.py"
L7_BIN="${L7_DIR}/l7"

CHECK_ONLY=0
RESTART=0
VPS_CHECK=0
START_TIMEOUT="${START_TIMEOUT:-20}"

RED=$'\033[0;31m'
GREEN=$'\033[0;32m'
YELLOW=$'\033[1;33m'
BLUE=$'\033[0;34m'
NC=$'\033[0m'

usage() {
  cat <<'EOF'
L7 WAY / AVLI Founder Loop (Mac-local)

Usage:
  ./start.sh              Install deps if needed and start the loopback loop
  ./start.sh --check      Preflight only (deps + ports); do not start
  ./start.sh --restart    Stop processes this script started, then start
  ./start.sh --vps-check  After local start, SSH host "vps" (docker ps / n8n)
  ./start.sh --help

Services (loopback only):
  Gateway      127.0.0.1:18789   node serve.js   Studio: /studio
  Forge        127.0.0.1:7378    l7 forge        (skill-runtime)
  Echo worker  127.0.0.1:8787    echo_worker.py

This is the Founder Loop entry. ~/avli_cloud/start.sh is the Hostinger
docker advisor stack (n8n, ollama, …) and is NOT started from here.

Env (never commit secrets). First existing file fills unset keys:
  ./.env.local
  ~/.l7/state/founder-loop.env
  ~/.l7/state/founder-loop/secrets.env
  ~/.l7/vault/env/founder-loop.env   (if the vault is open)

  L7_DIR                    default ~/.l7
  L7_BIND / L7_PORT         default 127.0.0.1 / 18789
  L7_FORGE_HOST / PORT      default 127.0.0.1 / 7378
  AVLI_WORKER_BIND / PORT   default 127.0.0.1 / 8787
  AVLI_WORKER_SERVICE_TOKEN (alias: AVLI_WORKER_TOKEN)
  L7_CALLBACK_HMAC_SECRET
  AVLI_MEDIA_EXECUTION      default mock unless already set (ssd1b, …)
  AVLI_WORKER_URL           default http://127.0.0.1:$AVLI_WORKER_PORT
  L7_CALLBACK_URL           default http://127.0.0.1:$L7_PORT/v1/callbacks/jobs
EOF
}

die() {
  printf '%serror:%s %s\n' "$RED" "$NC" "$*" >&2
  exit 1
}

info() { printf '%s==>%s %s\n' "$BLUE" "$NC" "$*"; }
ok()   { printf '%s  ok%s  %s\n' "$GREEN" "$NC" "$*"; }
warn() { printf '%swarn:%s %s\n' "$YELLOW" "$NC" "$*"; }

is_loopback() {
  case "$1" in
    127.0.0.1|localhost|::1) return 0 ;;
    *) return 1 ;;
  esac
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "$1 is not installed or not on PATH"
}

python_ok() {
  python3 - <<'PY'
import sys
if sys.version_info < (3, 9):
    sys.stderr.write("python3 must be 3.9+\n")
    sys.exit(1)
PY
}

# Load KEY=VALUE from a file without overriding already-set variables.
# Ignores comments and shell interpolation (no eval).
load_env_file() {
  local file="$1" line key val
  [ -f "$file" ] || return 0
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      ''|\#*) continue ;;
    esac
    line="${line%%$'\r'}"
    case "$line" in
      *=*) ;;
      *) continue ;;
    esac
    key="${line%%=*}"
    val="${line#*=}"
    key="${key%"${key##*[![:space:]]}"}"
    key="${key#"${key%%[![:space:]]*}"}"
    case "$key" in
      [A-Za-z_]* ) ;;
      *) continue ;;
    esac
    case "$key" in
      *[!A-Za-z0-9_]* ) continue ;;
    esac
    val="${val#"${val%%[![:space:]]*}"}"
    val="${val%"${val##*[![:space:]]}"}"
    case "$val" in
      \"*\")
        val="${val#\"}"
        val="${val%\"}"
        ;;
      \'*\')
        val="${val#\'}"
        val="${val%\'}"
        ;;
    esac
    if [ -z "${!key+x}" ]; then
      export "$key=$val"
    fi
  done < "$file"
}

ensure_state() {
  mkdir -p "$LOG_DIR"
  chmod 700 "$STATE_DIR" 2>/dev/null || true
}

listener_pids() {
  local port="$1"
  lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null | sort -u || true
}

pid_command() {
  ps -p "$1" -o command= 2>/dev/null || true
}

pid_matches() {
  local pid="$1" needle="$2" cmd
  cmd="$(pid_command "$pid")"
  case "$cmd" in
    *"$needle"*) return 0 ;;
    *) return 1 ;;
  esac
}

describe_listeners() {
  local port="$1" pid cmd
  for pid in $(listener_pids "$port"); do
    cmd="$(pid_command "$pid")"
    printf '    pid %s  %s\n' "$pid" "$cmd"
  done
}

# 0 = nothing listening, 1 = expected process, 2 = wrong process
port_status() {
  local port="$1" needle="$2" pid found=0
  for pid in $(listener_pids "$port"); do
    found=1
    if pid_matches "$pid" "$needle"; then
      echo 1
      return 0
    fi
  done
  if [ "$found" -eq 0 ]; then
    echo 0
  else
    echo 2
  fi
}

assert_port_usable() {
  local name="$1" port="$2" needle="$3" status
  status="$(port_status "$port" "$needle")"
  case "$status" in
    0|1) return 0 ;;
    2)
      printf '%serror:%s port %s (%s) is occupied by the wrong process:\n' "$RED" "$NC" "$port" "$name" >&2
      describe_listeners "$port" >&2
      case "$port" in
        18789)
          cat >&2 <<EOF
  Founder Loop Gateway must be L7_WAY/serve.js on 127.0.0.1:${GATEWAY_PORT}.
  OpenClaw often holds :18789 via launchd (ai.openclaw.gateway).
  Stop it, then re-run:  launchctl bootout gui/$(id -u)/ai.openclaw.gateway
  A separate launchd L7 Gateway may already be on 127.0.0.1:18790 (com.l7.way.gateway).
EOF
          ;;
        7378)
          cat >&2 <<EOF
  Forge must be skill-runtime forge_server.py (l7 forge), not l7-forge --daemon.
EOF
          ;;
      esac
      return 1
      ;;
  esac
}

wait_http() {
  local url="$1" timeout_s="$2"
  shift 2
  local i=0
  while [ "$i" -lt "$timeout_s" ]; do
    if curl -fsS --max-time 2 "$@" "$url" >/dev/null 2>&1; then
      return 0
    fi
    i=$((i + 1))
    sleep 1
  done
  return 1
}

record_listener_pid() {
  local name="$1" port="$2" pid
  pid="$(listener_pids "$port" | head -1)"
  [ -n "$pid" ] || return 0
  write_pid "$name" "$pid"
}

write_pid() {
  printf '%s\n' "$2" > "$STATE_DIR/$1.pid"
}

read_pid() {
  local file="$STATE_DIR/$1.pid"
  [ -f "$file" ] || return 0
  cat "$file"
}

stop_owned() {
  local name="$1" needle="$2" pid
  pid="$(read_pid "$name" || true)"
  if [ -n "${pid:-}" ] && kill -0 "$pid" 2>/dev/null && pid_matches "$pid" "$needle"; then
    info "stopping $name (pid $pid)"
    kill "$pid" 2>/dev/null || true
    local i=0
    while [ "$i" -lt 8 ] && kill -0 "$pid" 2>/dev/null; do
      sleep 1
      i=$((i + 1))
    done
    if kill -0 "$pid" 2>/dev/null; then
      kill -9 "$pid" 2>/dev/null || true
    fi
  fi
  rm -f "$STATE_DIR/$name.pid"
}

install_node_deps() {
  info "Node dependencies (L7_WAY)"
  require_cmd node
  require_cmd npm
  if [ ! -d "$ROOT/node_modules" ]; then
    npm install
  else
    ok "node_modules present"
  fi
}

install_skill_runtime() {
  info "Python skill-runtime (forge)"
  require_cmd python3
  python_ok
  [ -f "$FORGE_PY" ] || die "forge missing: $FORGE_PY (expected ~/.l7/programs/skill-runtime)"
  [ -x "$L7_BIN" ] || die "l7 CLI missing or not executable: $L7_BIN"
  python3 -m py_compile "$FORGE_PY" "${SKILL_RUNTIME}/forge/skill_bridge.py" \
    "${SKILL_RUNTIME}/l7skills.py"
  if [ -f "${SKILL_RUNTIME}/requirements.txt" ]; then
    warn "requirements.txt found; installing light deps only (skipping torch/cuda wheels)"
    if [ ! -d "${SKILL_RUNTIME}/.venv" ]; then
      python3 -m venv "${SKILL_RUNTIME}/.venv"
    fi
    # shellcheck disable=SC2046
    grep -viE '^(torch|tensorflow|cuda|nvidia)' "${SKILL_RUNTIME}/requirements.txt" \
      | "${SKILL_RUNTIME}/.venv/bin/pip" install -q -r /dev/stdin || \
      die "skill-runtime pip install failed"
  else
    ok "stdlib runtime (no pip; will not install torch)"
  fi
}

install_worker_sdk() {
  info "AVLI echo worker SDK"
  [ -f "$ECHO_WORKER" ] || die "echo worker missing: $ECHO_WORKER"
  [ -d "${WORKER_SDK}/src/avli_worker_sdk" ] || die "avli-worker-sdk src missing under $WORKER_SDK"
  PYTHONPATH="${WORKER_SDK}/src" python3 -m py_compile "$ECHO_WORKER"
  ok "echo worker importable via PYTHONPATH (no pip/torch)"
}

ensure_secrets() {
  info "Service tokens (env/vault, not git)"
  load_env_file "$LOCAL_ENV"
  load_env_file "$FOUNDER_ENV"
  load_env_file "$SECRETS_FILE"
  load_env_file "$VAULT_ENV"

  if [ -z "${AVLI_WORKER_SERVICE_TOKEN:-}" ] && [ -n "${AVLI_WORKER_TOKEN:-}" ]; then
    export AVLI_WORKER_SERVICE_TOKEN="$AVLI_WORKER_TOKEN"
  fi

  local generated=0
  if [ -z "${AVLI_WORKER_SERVICE_TOKEN:-}" ]; then
    AVLI_WORKER_SERVICE_TOKEN="$(openssl rand -hex 32)"
    export AVLI_WORKER_SERVICE_TOKEN
    generated=1
  fi
  if [ -z "${L7_CALLBACK_HMAC_SECRET:-}" ]; then
    L7_CALLBACK_HMAC_SECRET="$(openssl rand -hex 32)"
    export L7_CALLBACK_HMAC_SECRET
    generated=1
  fi

  if [ "$generated" -eq 1 ]; then
    umask 077
    cat > "$SECRETS_FILE" <<EOF
# Generated by L7_WAY/start.sh — machine-local, never commit
AVLI_WORKER_SERVICE_TOKEN=${AVLI_WORKER_SERVICE_TOKEN}
L7_CALLBACK_HMAC_SECRET=${L7_CALLBACK_HMAC_SECRET}
EOF
    chmod 600 "$SECRETS_FILE"
    ok "wrote machine-local secrets to ${SECRETS_FILE} (chmod 600)"
  else
    ok "worker token and callback HMAC loaded (values not printed)"
  fi

  export AVLI_WORKER_TOKEN="${AVLI_WORKER_SERVICE_TOKEN}"
  export L7_BIND="$GATEWAY_BIND"
  export L7_PORT="$GATEWAY_PORT"
  export L7_DIR
  export L7_FORGE_HOST="$FORGE_HOST"
  export L7_FORGE_PORT="$FORGE_PORT"
  export L7_FORGE_URL="${L7_FORGE_URL:-http://${FORGE_HOST}:${FORGE_PORT}}"
  export AVLI_WORKER_BIND="$WORKER_BIND"
  export AVLI_WORKER_PORT="$WORKER_PORT"
  export AVLI_WORKER_URL="${AVLI_WORKER_URL:-http://${WORKER_BIND}:${WORKER_PORT}}"
  export L7_CALLBACK_URL="${L7_CALLBACK_URL:-http://${GATEWAY_BIND}:${GATEWAY_PORT}/v1/callbacks/jobs}"
  if [ -z "${AVLI_MEDIA_EXECUTION:-}" ]; then
    export AVLI_MEDIA_EXECUTION=mock
    ok "AVLI_MEDIA_EXECUTION=mock (set it to ssd1b/cluster before start to use real media)"
  else
    ok "AVLI_MEDIA_EXECUTION=${AVLI_MEDIA_EXECUTION} (kept)"
  fi
}

start_gateway() {
  local status
  status="$(port_status "$GATEWAY_PORT" "${ROOT}/serve.js")"
  if [ "$status" = "1" ]; then
    ok "Gateway already listening on ${GATEWAY_BIND}:${GATEWAY_PORT}"
    return 0
  fi
  info "starting Gateway (npm start) on ${GATEWAY_BIND}:${GATEWAY_PORT}"
  nohup npm start >> "${LOG_DIR}/gateway.log" 2>&1 &
  if ! wait_http "http://${GATEWAY_BIND}:${GATEWAY_PORT}/health" "$START_TIMEOUT"; then
    die "Gateway did not become healthy. See ${LOG_DIR}/gateway.log"
  fi
  record_listener_pid gateway "$GATEWAY_PORT"
  ok "Gateway http://${GATEWAY_BIND}:${GATEWAY_PORT}"
}

start_forge() {
  local status
  status="$(port_status "$FORGE_PORT" "forge_server.py")"
  if [ "$status" = "1" ]; then
    ok "Forge already listening on ${FORGE_HOST}:${FORGE_PORT}"
    return 0
  fi
  info "starting skill-runtime forge (l7 forge) on ${FORGE_HOST}:${FORGE_PORT}"
  nohup "$L7_BIN" forge >> "${LOG_DIR}/forge.log" 2>&1 &
  if ! wait_http "http://${FORGE_HOST}:${FORGE_PORT}/health" "$START_TIMEOUT"; then
    die "Forge did not become healthy. See ${LOG_DIR}/forge.log"
  fi
  record_listener_pid forge "$FORGE_PORT"
  ok "Forge http://${FORGE_HOST}:${FORGE_PORT}"
}

start_worker() {
  local status
  status="$(port_status "$WORKER_PORT" "echo_worker.py")"
  if [ "$status" = "1" ]; then
    ok "Echo worker already listening on ${WORKER_BIND}:${WORKER_PORT}"
    return 0
  fi
  info "starting AVLI echo worker on ${WORKER_BIND}:${WORKER_PORT}"
  nohup env PYTHONPATH="${WORKER_SDK}/src" \
    AVLI_WORKER_SERVICE_TOKEN="${AVLI_WORKER_SERVICE_TOKEN}" \
    AVLI_WORKER_BIND="${WORKER_BIND}" \
    AVLI_WORKER_PORT="${WORKER_PORT}" \
    python3 "$ECHO_WORKER" >> "${LOG_DIR}/echo-worker.log" 2>&1 &
  if ! wait_http "http://${WORKER_BIND}:${WORKER_PORT}/internal/v1/health" "$START_TIMEOUT" \
      -H "Authorization: Bearer ${AVLI_WORKER_SERVICE_TOKEN}" \
      -H "X-L7-Tenant-Id: tenant:gateway" \
      -H "X-L7-Request-Id: request:founder-loop-health" \
      -H "X-L7-Contract-Version: l7.worker.job-request/1.0"; then
    die "Echo worker did not become healthy. See ${LOG_DIR}/echo-worker.log"
  fi
  record_listener_pid worker "$WORKER_PORT"
  ok "Echo worker http://${WORKER_BIND}:${WORKER_PORT}"
}

vps_check() {
  info "VPS awareness (non-destructive SSH to host 'vps')"
  require_cmd ssh
  if ! ssh -o BatchMode=yes -o ConnectTimeout=5 -o StrictHostKeyChecking=accept-new vps \
      'echo "--- docker ps ---"; docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null | head -40; echo; echo "--- n8n healthz ---"; curl -fsS --max-time 5 http://127.0.0.1:5678/healthz || curl -fsS --max-time 5 http://127.0.0.1:5679/healthz || echo "n8n healthz not reachable on :5678/:5679"'; then
    warn "SSH to host 'vps' failed (offline or no key). Local loop is independent of the VPS."
    return 1
  fi
}

print_banner() {
  cat <<EOF

${GREEN}Founder Loop ready${NC}
  Studio:     http://${GATEWAY_BIND}:${GATEWAY_PORT}/studio
  Gateway:    http://${GATEWAY_BIND}:${GATEWAY_PORT}/health
  Forge:      http://${FORGE_HOST}:${FORGE_PORT}/health
  Worker:     http://${WORKER_BIND}:${WORKER_PORT}/internal/v1/health
              (Bearer AVLI_WORKER_SERVICE_TOKEN + X-L7-Tenant-Id / Request-Id / Contract-Version)
  Smoke:      bash scripts/founder-loop-smoke.sh
  Logs:       ${LOG_DIR}
  Stop:       ./stop.sh

  Media mode: ${AVLI_MEDIA_EXECUTION}
  VPS stack:  ~/avli_cloud/start.sh (Hostinger docker; not started here)
EOF
}

# --- args ---
while [ $# -gt 0 ]; do
  case "$1" in
    --help|-h) usage; exit 0 ;;
    --check) CHECK_ONLY=1 ;;
    --restart) RESTART=1 ;;
    --vps-check) VPS_CHECK=1 ;;
    *) die "unknown argument: $1 (try --help)" ;;
  esac
  shift
done

is_loopback "$GATEWAY_BIND" || die "Law I: L7_BIND must be loopback (got ${GATEWAY_BIND})"
is_loopback "$FORGE_HOST" || die "Law I: L7_FORGE_HOST must be loopback (got ${FORGE_HOST})"
is_loopback "$WORKER_BIND" || die "Law I: AVLI_WORKER_BIND must be loopback (got ${WORKER_BIND})"
require_cmd lsof
require_cmd curl
require_cmd openssl

ensure_state
install_node_deps
install_skill_runtime
install_worker_sdk
ensure_secrets

info "Port ownership"
port_ok=0
assert_port_usable "Gateway" "$GATEWAY_PORT" "${ROOT}/serve.js" || port_ok=1
assert_port_usable "Forge" "$FORGE_PORT" "forge_server.py" || port_ok=1
assert_port_usable "Echo worker" "$WORKER_PORT" "echo_worker.py" || port_ok=1
if [ "$port_ok" -ne 0 ]; then
  die "refusing to start: a required port is held by the wrong process"
fi
ok "ports ${GATEWAY_PORT}/${FORGE_PORT}/${WORKER_PORT} are free or already ours"

if [ "$CHECK_ONLY" -eq 1 ]; then
  info "Preflight passed. Run ./start.sh to activate services."
  exit 0
fi

if [ "$RESTART" -eq 1 ]; then
  if [ -x "$ROOT/stop.sh" ]; then
    "$ROOT/stop.sh" || true
  else
    stop_owned gateway "${ROOT}/serve.js"
    stop_owned forge "forge_server.py"
    stop_owned worker "echo_worker.py"
  fi
fi

start_gateway
start_forge
start_worker
print_banner

if [ "$VPS_CHECK" -eq 1 ]; then
  vps_check || true
fi

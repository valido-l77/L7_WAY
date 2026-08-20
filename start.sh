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
GATEWAY_PORT="${L7_PORT:-18793}"
FORGE_HOST="${L7_FORGE_HOST:-127.0.0.1}"
FORGE_PORT="${L7_FORGE_PORT:-7378}"
WORKER_BIND="${AVLI_WORKER_BIND:-127.0.0.1}"
# Proven smoke/n8n path uses :18792. 8787 is the echo_worker.py fallback only.
WORKER_PORT="${AVLI_WORKER_PORT:-18792}"
WORKER_SDK="${AVLI_CLOUD}/packages/avli-worker-sdk"
ECHO_WORKER="${WORKER_SDK}/examples/echo_worker.py"
OLLAMA_WORKER="${WORKER_SDK}/examples/ollama_worker.py"
SKILL_RUNTIME="${L7_DIR}/programs/skill-runtime"
FORGE_PY="${SKILL_RUNTIME}/forge/forge_server.py"
L7_BIN="${L7_DIR}/l7"
AVLI_SECRETS="${AVLI_CLOUD}/deploy/secrets"
# VPS n8n posts to http://172.18.0.1:18793 (docker-bridge forwarder → SSH -R).
VPS_TUNNEL_PORT="${L7_VPS_TUNNEL_PORT:-18793}"
VPS_FORWARDER_PY="${L7_VPS_FORWARDER_PY:-/root/l7-gateway-forwarder.py}"
MODEL_WORKER_BIND="${AVLI_MODEL_WORKER_BIND:-127.0.0.1}"
MODEL_WORKER_PORT="${AVLI_MODEL_WORKER_PORT:-18798}"
OLLAMA_HOST="${OLLAMA_HOST:-http://127.0.0.1:11434}"

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

Services (loopback only). OpenClaw keeps :18789 when it already owns it.

  Gateway      127.0.0.1:18793   node serve.js   Studio: /studio  Offers: /offers
                 (product port; OpenClaw keeps :18789)
  Forge        127.0.0.1:7378    l7 forge        (skill-runtime)
  Echo worker  127.0.0.1:18792   echo_worker.py  (8787 only if 18792 is taken)
  Model worker 127.0.0.1:18798   ollama_worker.py if local Ollama is healthy (skipped otherwise)
  Advertise    Tailscale serve --http=18793 → 127.0.0.1:18793 (never 7378/18792/18798)
                 SSH -R + /root/l7-gateway-forwarder.py on 172.18.0.1:18793 fallback

This is the Founder Loop entry. ~/avli_cloud/start.sh is the Hostinger
docker advisor stack (n8n, ollama, …) and is NOT started from here.

Env (never commit secrets). First existing file fills unset keys:
  ./.env.local
  ~/.l7/state/founder-loop.env
  ~/.l7/state/founder-loop/secrets.env
  ~/.l7/vault/env/founder-loop.env   (if the vault is open)
  ~/avli_cloud/deploy/secrets/l7-gateway.token
  ~/avli_cloud/deploy/secrets/avli-echo-worker.token

  L7_DIR                    default ~/.l7
  L7_BIND / L7_PORT         default 127.0.0.1 / 18793 (never steals OpenClaw :18789)
  L7_FORGE_HOST / PORT      default 127.0.0.1 / 7378
  AVLI_WORKER_BIND / PORT   default 127.0.0.1 / 18792
  AVLI_WORKER_SERVICE_TOKEN (alias: AVLI_WORKER_TOKEN)
  L7_API_TOKEN              n8n → Gateway (from avli_cloud secrets if unset)
  L7_API_TENANT_ID          default tenant:service when L7_API_TOKEN is set
  L7_CALLBACK_HMAC_SECRET
  AVLI_MEDIA_EXECUTION      default mock unless already set (ssd1b, …)
  AVLI_WORKER_URL           default http://127.0.0.1:$AVLI_WORKER_PORT
  AVLI_MODEL_WORKER_URL     default http://127.0.0.1:$AVLI_MODEL_WORKER_PORT when Ollama is up
  L7_CALLBACK_URL           default http://127.0.0.1:$L7_PORT/v1/callbacks/jobs
  n8n path                  Tailscale HTTP :18793 (Gateway only) with SSH -R fallback
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
  rotate_founder_logs
}

# Keep founder-loop logs to the last 10 files / 50 MB.
rotate_founder_logs() {
  local f size stamp dest total count
  mkdir -p "$LOG_DIR"
  for f in "$LOG_DIR"/*.log; do
    [ -f "$f" ] || continue
    size="$(stat -f%z "$f" 2>/dev/null || echo 0)"
    if [ "$size" -gt 5242880 ]; then
      stamp="$(date +%Y%m%d-%H%M%S)"
      dest="${f}.${stamp}"
      mv "$f" "$dest"
      : > "$f"
      gzip -f "$dest" 2>/dev/null || true
    fi
  done
  total=0
  # Newest first; drop the rest after 10 files or 50 MB.
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    size="$(stat -f%z "$f" 2>/dev/null || echo 0)"
    total=$((total + size))
    count=$((${count:-0} + 1))
    if [ "$count" -gt 10 ] || [ "$total" -gt 52428800 ]; then
      rm -f "$f"
    fi
  done < <(ls -1t "$LOG_DIR"/*.log "$LOG_DIR"/*.log.gz 2>/dev/null || true)
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
  esac
  # npm start / cwd launch: "node serve.js" without the absolute path
  if [ "$needle" = "${ROOT}/serve.js" ] || [ "$needle" = "serve.js" ]; then
    case "$cmd" in
      *openclaw*) return 1 ;;
      *"${ROOT}/serve.js"*) return 0 ;;
      *"node serve.js"*) return 0 ;;
      *"/serve.js"*) return 0 ;;
    esac
  fi
  return 1
}

describe_listeners() {
  local port="$1" pid cmd
  for pid in $(listener_pids "$port"); do
    cmd="$(pid_command "$pid")"
    printf '    pid %s  %s\n' "$pid" "$cmd"
  done
}

is_openclaw_cmd() {
  case "$1" in
    *openclaw*) return 0 ;;
    *ai.openclaw*) return 0 ;;
    *) return 1 ;;
  esac
}

port_held_by_openclaw() {
  local port="$1" pid cmd
  for pid in $(listener_pids "$port"); do
    cmd="$(pid_command "$pid")"
    if is_openclaw_cmd "$cmd"; then
      return 0
    fi
  done
  return 1
}

# Next free-or-ours loopback TCP port. Skips OpenClaw.
pick_loopback_port() {
  local needle="$1" port status
  shift
  for port in "$@"; do
    status="$(port_status "$port" "$needle")"
    case "$status" in
      0|1)
        printf '%s\n' "$port"
        return 0
        ;;
    esac
  done
  return 1
}

resolve_gateway_port() {
  local preferred status chosen product
  preferred="${L7_PORT:-$GATEWAY_PORT}"
  GATEWAY_BIND="${L7_BIND:-$GATEWAY_BIND}"
  product="$VPS_TUNNEL_PORT"

  # n8n + SSH reverse are pinned to VPS :18793. Prefer a live L7 already there.
  if [ "$(port_status "$product" "${ROOT}/serve.js")" = "1" ]; then
    GATEWAY_PORT="$product"
    export L7_PORT="$product"
    ok "reusing live L7 Gateway on ${GATEWAY_BIND}:${GATEWAY_PORT} (n8n/smoke path)"
    return 0
  fi

  status="$(port_status "$preferred" "${ROOT}/serve.js")"
  if [ "$status" = "0" ] || [ "$status" = "1" ]; then
    GATEWAY_PORT="$preferred"
    return 0
  fi
  if port_held_by_openclaw "$preferred"; then
    info "OpenClaw owns :${preferred}; L7 will not steal it (coexistence)"
  else
    warn "port ${preferred} is occupied by a non-L7 process:"
    describe_listeners "$preferred"
  fi
  chosen="$(pick_loopback_port "${ROOT}/serve.js" 18793 18794 18795 18796 18791)" \
    || die "no free loopback port for L7 Gateway (OpenClaw coexistence)"
  GATEWAY_PORT="$chosen"
  export L7_PORT="$chosen"
  info "L7 Gateway will bind ${GATEWAY_BIND}:${GATEWAY_PORT}"
}

resolve_worker_port() {
  local preferred status chosen
  preferred="${AVLI_WORKER_PORT:-$WORKER_PORT}"
  WORKER_BIND="${AVLI_WORKER_BIND:-$WORKER_BIND}"
  status="$(port_status "$preferred" "echo_worker.py")"
  if [ "$status" = "0" ] || [ "$status" = "1" ]; then
    WORKER_PORT="$preferred"
    return 0
  fi
  warn "echo worker port ${preferred} occupied; trying 18792 then 8787"
  describe_listeners "$preferred"
  chosen="$(pick_loopback_port "echo_worker.py" 18792 8787 18794 18795)" \
    || die "no free loopback port for echo worker"
  WORKER_PORT="$chosen"
  export AVLI_WORKER_PORT="$chosen"
}

resolve_model_worker_port() {
  local preferred status chosen
  preferred="${AVLI_MODEL_WORKER_PORT:-$MODEL_WORKER_PORT}"
  MODEL_WORKER_BIND="${AVLI_MODEL_WORKER_BIND:-$MODEL_WORKER_BIND}"
  status="$(port_status "$preferred" "ollama_worker.py")"
  if [ "$status" = "0" ] || [ "$status" = "1" ]; then
    MODEL_WORKER_PORT="$preferred"
    return 0
  fi
  warn "model worker port ${preferred} occupied; trying 18798 then 18797"
  describe_listeners "$preferred"
  chosen="$(pick_loopback_port "ollama_worker.py" 18798 18797 18799)" \
    || die "no free loopback port for model worker"
  MODEL_WORKER_PORT="$chosen"
  export AVLI_MODEL_WORKER_PORT="$chosen"
}

load_token_file() {
  local var="$1" file="$2" val
  if [ -n "${!var:-}" ]; then
    return 0
  fi
  [ -f "$file" ] || return 0
  val="$(tr -d '[:space:]' < "$file")"
  [ -n "$val" ] || return 0
  export "$var=$val"
}

persist_runtime_env() {
  umask 077
  local tailnet_url=""
  local ts dns
  ts="$(find_tailscale 2>/dev/null || true)"
  if [ -n "$ts" ]; then
    dns="$("$ts" status --json 2>/dev/null | python3 -c 'import json,sys; d=json.load(sys.stdin); n=(d.get("Self") or {}).get("DNSName") or ""; print(n.rstrip("."))' 2>/dev/null || true)"
    if [ -n "$dns" ]; then
      tailnet_url="http://${dns}:${GATEWAY_PORT}"
    fi
  fi
  cat > "$FOUNDER_ENV" <<EOF
# Written by L7_WAY/start.sh — ports only, never tokens
L7_BIND=${GATEWAY_BIND}
L7_PORT=${GATEWAY_PORT}
L7_FORGE_HOST=${FORGE_HOST}
L7_FORGE_PORT=${FORGE_PORT}
L7_FORGE_URL=http://${FORGE_HOST}:${FORGE_PORT}
AVLI_WORKER_BIND=${WORKER_BIND}
AVLI_WORKER_PORT=${WORKER_PORT}
AVLI_WORKER_URL=http://${WORKER_BIND}:${WORKER_PORT}
AVLI_MODEL_WORKER_BIND=${MODEL_WORKER_BIND}
AVLI_MODEL_WORKER_PORT=${MODEL_WORKER_PORT}
AVLI_MODEL_WORKER_URL=${AVLI_MODEL_WORKER_URL}
L7_CALLBACK_URL=http://${GATEWAY_BIND}:${GATEWAY_PORT}/v1/callbacks/jobs
L7_GATEWAY_URL=http://${GATEWAY_BIND}:${GATEWAY_PORT}
L7_TAILNET_GATEWAY_URL=${tailnet_url}
EOF
  chmod 600 "$FOUNDER_ENV"
}

ssh_vps() {
  ssh -o BatchMode=yes -o ConnectTimeout=8 -o StrictHostKeyChecking=accept-new vps "$@"
}

tunnel_pids() {
  ps -ax -o pid=,command= | awk -v remote="$VPS_TUNNEL_PORT" -v local="$GATEWAY_PORT" '
    $0 ~ /ssh / && $0 ~ /-R / && index($0, "127.0.0.1:" remote ":127.0.0.1:" local) && $0 ~ / vps/ { print $1 }
  '
}

ensure_vps_tunnel() {
  local pid existing
  info "VPS n8n → Mac L7 tunnel (GatewayPorts off; reverse + docker-bridge)"
  existing="$(tunnel_pids | head -1 || true)"
  if [ -n "$existing" ]; then
    ok "SSH reverse tunnel already up (pid ${existing}: VPS :${VPS_TUNNEL_PORT} → ${GATEWAY_BIND}:${GATEWAY_PORT})"
  else
    info "starting ssh -R 127.0.0.1:${VPS_TUNNEL_PORT}:127.0.0.1:${GATEWAY_PORT} vps"
    if ssh -f -N -o BatchMode=yes -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 \
        -o ConnectTimeout=8 -o StrictHostKeyChecking=accept-new \
        -R "127.0.0.1:${VPS_TUNNEL_PORT}:127.0.0.1:${GATEWAY_PORT}" vps; then
      pid="$(tunnel_pids | head -1 || true)"
      [ -n "$pid" ] && write_pid tunnel "$pid"
      ok "SSH reverse tunnel VPS 127.0.0.1:${VPS_TUNNEL_PORT} → Mac ${GATEWAY_BIND}:${GATEWAY_PORT}"
    else
      warn "could not start SSH reverse tunnel (ssh vps failed). Local Studio still works."
      return 1
    fi
  fi

  if ssh_vps "python3 -c 'import socket; s=socket.socket(); s.settimeout(1); s.connect((\"172.18.0.1\", ${VPS_TUNNEL_PORT}))'" >/dev/null 2>&1; then
    ok "VPS docker-bridge forwarder 172.18.0.1:${VPS_TUNNEL_PORT} is listening"
  else
    info "starting VPS docker-bridge forwarder ${VPS_FORWARDER_PY}"
    if ssh_vps "test -f '${VPS_FORWARDER_PY}' && nohup python3 '${VPS_FORWARDER_PY}' >>/var/log/l7-gateway-forwarder.log 2>&1 & sleep 0.3; python3 -c 'import socket; s=socket.socket(); s.settimeout(1); s.connect((\"172.18.0.1\", ${VPS_TUNNEL_PORT}))'"; then
      ok "VPS forwarder listening on 172.18.0.1:${VPS_TUNNEL_PORT}"
    else
      warn "VPS forwarder not reachable on 172.18.0.1:${VPS_TUNNEL_PORT}"
      return 1
    fi
  fi

  if ssh_vps "curl -fsS --max-time 5 http://127.0.0.1:${VPS_TUNNEL_PORT}/health" >/dev/null 2>&1; then
    ok "VPS 127.0.0.1:${VPS_TUNNEL_PORT}/health → Mac L7"
  else
    warn "VPS loopback :${VPS_TUNNEL_PORT} did not return Gateway health yet"
    return 1
  fi
}

find_tailscale() {
  if command -v tailscale >/dev/null 2>&1; then
    printf '%s\n' "$(command -v tailscale)"
    return 0
  fi
  if [ -x /Applications/Tailscale.app/Contents/MacOS/Tailscale ]; then
    printf '%s\n' /Applications/Tailscale.app/Contents/MacOS/Tailscale
    return 0
  fi
  return 1
}

# Gateway loopback only. Never serve forge :7378 or echo :18792.
# Never steal OpenClaw's existing HTTPS :443 → :18789 mapping.
# Skip (do not launch the Tailscale app) if a serve would hang on System keychain.
ensure_tailscale_serve() {
  local ts status_json marker
  marker="${STATE_DIR}/tailscale-http-gateway.created"
  ts="$(find_tailscale)" || {
    warn "Tailscale CLI not found; SSH reverse tunnel remains the n8n path"
    return 1
  }
  if ! "$ts" status >/dev/null 2>&1; then
    warn "Tailscale is not running; not launching the app (may prompt System.keychain)"
    return 1
  fi

  status_json="$("$ts" serve status --json 2>/dev/null || true)"
  if printf '%s' "$status_json" | python3 - "$GATEWAY_BIND" "$GATEWAY_PORT" <<'PY'
import json, sys
bind, port = sys.argv[1], sys.argv[2]
raw = sys.stdin.read().strip()
if not raw:
    sys.exit(1)
try:
    data = json.loads(raw)
except Exception:
    sys.exit(1)
want = f"http://{bind}:{port}"
tcp = (data.get("TCP") or {}).get(str(port)) or {}
# HTTP serve on the gateway port, or a handler already proxying to it.
if tcp.get("HTTP"):
    sys.exit(0)
web = data.get("Web") or {}
for handlers in web.values():
    for item in (handlers.get("Handlers") or {}).values():
        if (item.get("Proxy") or "") == want:
            sys.exit(0)
sys.exit(1)
PY
  then
    ok "Tailscale already serving Gateway ${GATEWAY_BIND}:${GATEWAY_PORT} (workers not served)"
    return 0
  fi

  info "Tailscale serve HTTP :${GATEWAY_PORT} → ${GATEWAY_BIND}:${GATEWAY_PORT} (OpenClaw :443 left alone)"
  # 8s alarm: a System.keychain admin prompt would hang; skip instead of waiting.
  if perl -e 'alarm 8; exec @ARGV' "$ts" serve --bg --yes --http="$GATEWAY_PORT" \
      "http://${GATEWAY_BIND}:${GATEWAY_PORT}" >/dev/null 2>&1; then
    : > "$marker"
    ok "Tailscale HTTP :${GATEWAY_PORT} → Mac Gateway (not 7378/18792; not Funnel)"
    return 0
  fi
  warn "Tailscale serve skipped (timeout, prompt, or CLI error). SSH tunnel remains fallback."
  return 1
}

ensure_gateway_advertise() {
  local ts_ok=0 ssh_ok=0
  info "Advertise Gateway to n8n (Tailscale HTTP primary, SSH reverse fallback)"
  if ensure_tailscale_serve; then
    ts_ok=1
  fi
  if ensure_vps_tunnel; then
    ssh_ok=1
  fi
  if [ "$ts_ok" -eq 0 ] && [ "$ssh_ok" -eq 0 ]; then
    warn "neither Tailscale serve nor SSH tunnel is up; local Studio still works"
    return 1
  fi
  return 0
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
        18789|18793)
          cat >&2 <<EOF
  L7 Gateway is serve.js. OpenClaw may keep :18789; L7 relocates to :18793.
  This error means the chosen port is held by something that is not serve.js.
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

  # Proven n8n / live-worker tokens win over generated founder-loop secrets.
  if [ -f "${AVLI_SECRETS}/l7-gateway.token" ]; then
    L7_API_TOKEN="$(tr -d '[:space:]' < "${AVLI_SECRETS}/l7-gateway.token")"
    export L7_API_TOKEN
  fi
  if [ -n "${L7_API_TOKEN:-}" ] && [ -z "${L7_API_TENANT_ID:-}" ]; then
    # Bearer is accepted as kind=service; /v1/jobs requires a tenant (else 403).
    export L7_API_TENANT_ID=tenant:service
  fi
  if [ -f "${AVLI_SECRETS}/avli-echo-worker.token" ]; then
    AVLI_WORKER_SERVICE_TOKEN="$(tr -d '[:space:]' < "${AVLI_SECRETS}/avli-echo-worker.token")"
    export AVLI_WORKER_SERVICE_TOKEN
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
  if [ -n "${L7_API_TENANT_ID:-}" ] && [ -f "$SECRETS_FILE" ] \
      && ! grep -q '^L7_API_TENANT_ID=' "$SECRETS_FILE"; then
    printf 'L7_API_TENANT_ID=%s\n' "$L7_API_TENANT_ID" >> "$SECRETS_FILE"
    ok "L7_API_TENANT_ID=${L7_API_TENANT_ID} (n8n Bearer maps to this tenant)"
  fi

  if [ -z "${AVLI_MEDIA_EXECUTION:-}" ]; then
    export AVLI_MEDIA_EXECUTION=mock
    ok "AVLI_MEDIA_EXECUTION=mock (set it to ssd1b/cluster before start to use real media)"
  else
    ok "AVLI_MEDIA_EXECUTION=${AVLI_MEDIA_EXECUTION} (kept)"
  fi
}

apply_runtime_exports() {
  export AVLI_WORKER_TOKEN="${AVLI_WORKER_SERVICE_TOKEN}"
  export L7_BIND="$GATEWAY_BIND"
  export L7_PORT="$GATEWAY_PORT"
  export L7_DIR
  export L7_FORGE_HOST="$FORGE_HOST"
  export L7_FORGE_PORT="$FORGE_PORT"
  export L7_FORGE_URL="http://${FORGE_HOST}:${FORGE_PORT}"
  export AVLI_WORKER_BIND="$WORKER_BIND"
  export AVLI_WORKER_PORT="$WORKER_PORT"
  export AVLI_WORKER_URL="http://${WORKER_BIND}:${WORKER_PORT}"
  export AVLI_MODEL_WORKER_BIND="$MODEL_WORKER_BIND"
  export AVLI_MODEL_WORKER_PORT="$MODEL_WORKER_PORT"
  export AVLI_MODEL_WORKER_URL="http://${MODEL_WORKER_BIND}:${MODEL_WORKER_PORT}"
  export OLLAMA_HOST="$OLLAMA_HOST"
  export L7_CALLBACK_URL="http://${GATEWAY_BIND}:${GATEWAY_PORT}/v1/callbacks/jobs"
  export L7_GATEWAY_URL="http://${GATEWAY_BIND}:${GATEWAY_PORT}"
  if [ -n "${L7_API_TOKEN:-}" ] && [ -z "${L7_API_TENANT_ID:-}" ]; then
    export L7_API_TENANT_ID=tenant:service
  fi
  if [ -n "${L7_API_TENANT_ID:-}" ]; then
    export L7_API_TENANT_ID
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
  nohup npm start >> "${LOG_DIR}/gateway.log" 2>&1 < /dev/null &
  disown $! 2>/dev/null || true
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
  nohup "$L7_BIN" forge >> "${LOG_DIR}/forge.log" 2>&1 < /dev/null &
  disown $! 2>/dev/null || true
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
    python3 "$ECHO_WORKER" >> "${LOG_DIR}/echo-worker.log" 2>&1 < /dev/null &
  disown $! 2>/dev/null || true
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

ollama_healthy() {
  curl -fsS --max-time 2 "${OLLAMA_HOST}/api/tags" >/dev/null 2>&1
}

start_model_worker() {
  local status
  if [ ! -f "$OLLAMA_WORKER" ]; then
    warn "ollama_worker.py missing at ${OLLAMA_WORKER}; text.generate stays unavailable"
    unset AVLI_MODEL_WORKER_URL
    export AVLI_MODEL_WORKER_URL=""
    return 0
  fi
  if ! ollama_healthy; then
    warn "Ollama not healthy at ${OLLAMA_HOST}; skipping private model worker (text.generate unavailable)"
    unset AVLI_MODEL_WORKER_URL
    export AVLI_MODEL_WORKER_URL=""
    return 0
  fi
  is_loopback "$MODEL_WORKER_BIND" || die "Law I: AVLI_MODEL_WORKER_BIND must be loopback (got ${MODEL_WORKER_BIND})"
  status="$(port_status "$MODEL_WORKER_PORT" "ollama_worker.py")"
  if [ "$status" = "1" ]; then
    ok "Model worker already listening on ${MODEL_WORKER_BIND}:${MODEL_WORKER_PORT}"
    export AVLI_MODEL_WORKER_URL="http://${MODEL_WORKER_BIND}:${MODEL_WORKER_PORT}"
    return 0
  fi
  info "starting AVLI Ollama worker on ${MODEL_WORKER_BIND}:${MODEL_WORKER_PORT}"
  nohup env PYTHONPATH="${WORKER_SDK}/src" \
    AVLI_WORKER_SERVICE_TOKEN="${AVLI_WORKER_SERVICE_TOKEN}" \
    AVLI_WORKER_BIND="${MODEL_WORKER_BIND}" \
    AVLI_MODEL_WORKER_PORT="${MODEL_WORKER_PORT}" \
    AVLI_WORKER_PORT="${MODEL_WORKER_PORT}" \
    OLLAMA_HOST="${OLLAMA_HOST}" \
    python3 "$OLLAMA_WORKER" >> "${LOG_DIR}/ollama-worker.log" 2>&1 < /dev/null &
  disown $! 2>/dev/null || true
  if ! wait_http "http://${MODEL_WORKER_BIND}:${MODEL_WORKER_PORT}/internal/v1/health" "$START_TIMEOUT" \
      -H "Authorization: Bearer ${AVLI_WORKER_SERVICE_TOKEN}" \
      -H "X-L7-Tenant-Id: tenant:gateway" \
      -H "X-L7-Request-Id: request:founder-loop-model-health" \
      -H "X-L7-Contract-Version: l7.worker.job-request/1.0"; then
    warn "Model worker did not become healthy. See ${LOG_DIR}/ollama-worker.log"
    unset AVLI_MODEL_WORKER_URL
    export AVLI_MODEL_WORKER_URL=""
    return 0
  fi
  record_listener_pid model-worker "$MODEL_WORKER_PORT"
  export AVLI_MODEL_WORKER_URL="http://${MODEL_WORKER_BIND}:${MODEL_WORKER_PORT}"
  ok "Model worker http://${MODEL_WORKER_BIND}:${MODEL_WORKER_PORT} (Ollama ${OLLAMA_HOST})"
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
  Offers:     http://${GATEWAY_BIND}:${GATEWAY_PORT}/offers
  Gateway:    http://${GATEWAY_BIND}:${GATEWAY_PORT}/health
  Forge:      http://${FORGE_HOST}:${FORGE_PORT}/health
  Worker:     http://${WORKER_BIND}:${WORKER_PORT}/internal/v1/health
              (Bearer AVLI_WORKER_SERVICE_TOKEN + X-L7-Tenant-Id / Request-Id / Contract-Version)
  Model:      ${AVLI_MODEL_WORKER_URL:-skipped (Ollama down or text.generate unavailable)}
  Smoke:      L7_GATEWAY_URL=http://${GATEWAY_BIND}:${GATEWAY_PORT} bash scripts/founder-loop-smoke.sh
  Logs:       ${LOG_DIR}
  Stop:       ./stop.sh

  OpenClaw:   left on :18789 when present (not stolen)
  n8n path:   VPS n8n → 172.18.0.1:${VPS_TUNNEL_PORT} (SSH -R live); Tailscale HTTP :${GATEWAY_PORT} configured on Mac
  Media mode: ${AVLI_MEDIA_EXECUTION}
  VPS stack:  ~/avli_cloud/start.sh (Hostinger docker; not started here)
EOF
  if [ "$AVLI_MEDIA_EXECUTION" = "mock" ]; then
    cat <<EOF

${YELLOW}Mock media mode${NC}
  Studio previews are placeholders, not final media.
  For real local images, first confirm Studio → Advanced → SSD-1B readiness,
  then restart with: AVLI_MEDIA_EXECUTION=ssd1b ./start.sh --restart
  Reopen: http://${GATEWAY_BIND}:${GATEWAY_PORT}/studio
EOF
  fi
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
is_loopback "$MODEL_WORKER_BIND" || die "Law I: AVLI_MODEL_WORKER_BIND must be loopback (got ${MODEL_WORKER_BIND})"
require_cmd lsof
require_cmd curl
require_cmd openssl

ensure_state
install_node_deps
install_skill_runtime
install_worker_sdk
ensure_secrets
resolve_gateway_port
resolve_worker_port
resolve_model_worker_port
FORGE_HOST="${L7_FORGE_HOST:-$FORGE_HOST}"
FORGE_PORT="${L7_FORGE_PORT:-$FORGE_PORT}"
apply_runtime_exports
persist_runtime_env
is_loopback "$GATEWAY_BIND" || die "Law I: L7_BIND must be loopback (got ${GATEWAY_BIND})"
is_loopback "$FORGE_HOST" || die "Law I: L7_FORGE_HOST must be loopback (got ${FORGE_HOST})"
is_loopback "$WORKER_BIND" || die "Law I: AVLI_WORKER_BIND must be loopback (got ${WORKER_BIND})"
is_loopback "$MODEL_WORKER_BIND" || die "Law I: AVLI_MODEL_WORKER_BIND must be loopback (got ${MODEL_WORKER_BIND})"

info "Port ownership"
port_ok=0
assert_port_usable "Gateway" "$GATEWAY_PORT" "${ROOT}/serve.js" || port_ok=1
assert_port_usable "Forge" "$FORGE_PORT" "forge_server.py" || port_ok=1
assert_port_usable "Echo worker" "$WORKER_PORT" "echo_worker.py" || port_ok=1
if [ "$port_ok" -ne 0 ]; then
  die "refusing to start: a required port is held by the wrong process"
fi
ok "ports ${GATEWAY_PORT}/${FORGE_PORT}/${WORKER_PORT} are free or already ours"
if port_held_by_openclaw 18789; then
  ok "OpenClaw left on :18789"
fi

if [ "$CHECK_ONLY" -eq 1 ]; then
  info "Preflight passed. Run ./start.sh to activate services."
  printf '  Studio would be http://%s:%s/studio\n' "$GATEWAY_BIND" "$GATEWAY_PORT"
  exit 0
fi

if [ "$RESTART" -eq 1 ]; then
  if [ -x "$ROOT/stop.sh" ]; then
    "$ROOT/stop.sh" || true
  else
    stop_owned gateway "${ROOT}/serve.js"
    stop_owned forge "forge_server.py"
    stop_owned worker "echo_worker.py"
    stop_owned model-worker "ollama_worker.py"
    stop_owned tunnel "ssh"
  fi
fi

start_model_worker
start_gateway
start_forge
start_worker
persist_runtime_env
ensure_gateway_advertise || true
print_banner

if [ "$VPS_CHECK" -eq 1 ]; then
  vps_check || true
fi

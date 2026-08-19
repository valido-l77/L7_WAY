#!/usr/bin/env bash
# Stop Founder Loop processes started by ./start.sh (Gateway, forge, echo worker, tunnel).
# Does not stop launchd OpenClaw, com.l7.way.gateway, reused listeners, or the avli_cloud docker stack.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
L7_DIR="${L7_DIR:-$HOME/.l7}"
STATE_DIR="${L7_DIR}/state/founder-loop"

stop_owned() {
  local name="$1" needle="$2" file pid cmd
  file="${STATE_DIR}/${name}.pid"
  [ -f "$file" ] || return 0
  pid="$(cat "$file")"
  rm -f "$file"
  [ -n "$pid" ] || return 0
  kill -0 "$pid" 2>/dev/null || return 0
  cmd="$(ps -p "$pid" -o command= 2>/dev/null || true)"
  case "$cmd" in
    *"$needle"*) ;;
    *"node serve.js"*)
      [ "$name" = "gateway" ] || {
        printf 'skip %s pid %s (command no longer matches %s)\n' "$name" "$pid" "$needle"
        return 0
      }
      ;;
    *)
      printf 'skip %s pid %s (command no longer matches %s)\n' "$name" "$pid" "$needle"
      return 0
      ;;
  esac
  printf 'stopping %s pid %s\n' "$name" "$pid"
  kill "$pid" 2>/dev/null || true
  local i=0
  while [ "$i" -lt 8 ] && kill -0 "$pid" 2>/dev/null; do
    sleep 1
    i=$((i + 1))
  done
  if kill -0 "$pid" 2>/dev/null; then
    kill -9 "$pid" 2>/dev/null || true
  fi
}

if [ ! -d "$STATE_DIR" ]; then
  echo "No founder-loop state at $STATE_DIR"
  exit 0
fi

stop_owned gateway "${ROOT}/serve.js"
stop_owned forge "forge_server.py"
stop_owned worker "echo_worker.py"
stop_owned model-worker "ollama_worker.py"
stop_owned tunnel "-R 127.0.0.1:18793"

# Do not `tailscale serve reset` — OpenClaw may own HTTPS :443 → :18789.
# Only drop the HTTP Gateway mapping this script created.
marker="${STATE_DIR}/tailscale-http-gateway.created"
if [ -f "$marker" ]; then
  ts=""
  if command -v tailscale >/dev/null 2>&1; then
    ts="$(command -v tailscale)"
  elif [ -x /Applications/Tailscale.app/Contents/MacOS/Tailscale ]; then
    ts=/Applications/Tailscale.app/Contents/MacOS/Tailscale
  fi
  if [ -n "$ts" ]; then
    port="$(grep -E '^L7_PORT=' "${L7_DIR}/state/founder-loop.env" 2>/dev/null | tail -1 | cut -d= -f2)"
    port="${port:-18793}"
    "$ts" serve --http="$port" off >/dev/null 2>&1 || true
  fi
  rm -f "$marker"
  echo "Tailscale HTTP Gateway serve created by start.sh was cleared (OpenClaw :443 left alone)."
fi

echo "Founder Loop services started by start.sh are stopped."
echo "OpenClaw, launchd com.l7.way.gateway, reused listeners, and existing Tailscale Serve were left running."

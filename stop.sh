#!/usr/bin/env bash
# Stop Founder Loop processes started by ./start.sh (Gateway, forge, echo worker).
# Does not stop launchd OpenClaw, com.l7.way.gateway, or the avli_cloud docker stack.
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
echo "Founder Loop services started by start.sh are stopped."

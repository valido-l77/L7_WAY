#!/usr/bin/env bash
# Founder Loop smoke: local Gateway + forge + optional echo worker + VPS n8n.
# Usage: bash scripts/founder-loop-smoke.sh
# Optional env: L7_GATEWAY_URL, L7_API_TOKEN, L7_FORGE_URL, VPS_N8N_URL,
#               VPS_N8N_WEBHOOK_URL (POST JSON to the imported founder-loop webhook)
set -u
FORGE="${L7_FORGE_URL:-http://127.0.0.1:7378}"
PASS=0
FAIL=0

record() {
  local name="$1" ok="$2" detail="${3:-}"
  if [ "$ok" = "1" ]; then
    printf 'PASS  %s  %s\n' "$name" "$detail"
    PASS=$((PASS + 1))
  else
    printf 'FAIL  %s  %s\n' "$name" "$detail"
    FAIL=$((FAIL + 1))
  fi
}

json_has() {
  python3 - "$1" "$2" <<'PY'
import json, sys
raw, key = sys.argv[1], sys.argv[2]
try:
    data = json.loads(raw)
except Exception:
    sys.exit(1)
cur = data
for part in key.split("."):
    if isinstance(cur, dict) and part in cur:
        cur = cur[part]
    else:
        sys.exit(1)
sys.exit(0)
PY
}

capability_ids() {
  python3 - "$1" <<'PY'
import json, sys
data = json.loads(open(sys.argv[1], encoding="utf-8").read())
caps = (((data.get("result") or {}).get("capabilities")) or data.get("capabilities") or [])
print(" ".join(item.get("id", "") for item in caps))
PY
}

curl_auth() {
  if [ -n "${L7_API_TOKEN:-}" ]; then
    curl -fsS -H "Authorization: Bearer ${L7_API_TOKEN}" "$@"
  else
    curl -fsS "$@"
  fi
}

detect_gateway() {
  if [ -n "${L7_GATEWAY_URL:-}" ]; then
    printf '%s\n' "$L7_GATEWAY_URL"
    return
  fi
  local candidate health
  for candidate in http://127.0.0.1:18791 http://127.0.0.1:18789; do
    health=$(curl_auth "$candidate/health" 2>/dev/null || true)
    if json_has "$health" "alive" && json_has "$health" "founder"; then
      printf '%s\n' "$candidate"
      return
    fi
  done
  printf '%s\n' "http://127.0.0.1:18789"
}

GATEWAY="$(detect_gateway)"

echo "== Founder Loop smoke =="

health=$(curl_auth "$GATEWAY/health" 2>/dev/null || true)
if json_has "$health" "alive" && json_has "$health" "founder"; then
  record "gateway-health" 1 "$GATEWAY"
else
  record "gateway-health" 0 "L7 Gateway not listening on $GATEWAY (18789 may be OpenClaw)"
fi

caps_file=$(mktemp)
curl_auth "$GATEWAY/v1/capabilities" >"$caps_file" 2>/dev/null || true
ids=$(capability_ids "$caps_file" 2>/dev/null || true)
rm -f "$caps_file"
missing=""
for need in tool.rag-pipeline tool.financial-ratios tool.dcf-valuation image.generate video.generate text.echo; do
  case " $ids " in
    *" $need "*) ;;
    *) missing="$missing $need" ;;
  esac
done
if [ -n "$ids" ] && [ -z "$missing" ]; then
  record "v1-capabilities" 1 "forge + media + echo"
else
  record "v1-capabilities" 0 "missing:${missing:-no-body}"
fi

media=$(curl_auth "$GATEWAY/api/media/readiness/ssd-1b" 2>/dev/null || true)
if json_has "$media" "probe_only"; then
  record "studio-media-readiness" 1 "ssd-1b probe"
else
  record "studio-media-readiness" 0 "readiness unavailable"
fi

forge=$(curl -fsS "$FORGE/health" 2>/dev/null || true)
if json_has "$forge" "ok"; then
  record "forge-health" 1 "$FORGE"
else
  record "forge-health" 0 "forge not listening (start with: l7 forge)"
fi

if [ -n "${VPS_N8N_URL:-}" ]; then
  n8n=$(curl -fsS "${VPS_N8N_URL%/}/healthz" 2>/dev/null || true)
  if [ -n "$n8n" ]; then
    record "vps-n8n-health" 1 "$VPS_N8N_URL"
  else
    record "vps-n8n-health" 0 "n8n healthz failed"
  fi
elif ssh -o BatchMode=yes -o ConnectTimeout=8 vps 'curl -fsS -m 3 http://127.0.0.1:5678/healthz' >/dev/null 2>&1; then
  record "vps-n8n-health" 1 "ssh vps :5678/healthz"
else
  record "vps-n8n-health" 0 "ssh vps n8n healthz failed (set VPS_N8N_URL to override)"
fi

if [ -n "${VPS_N8N_WEBHOOK_URL:-}" ]; then
  posted=$(curl -fsS -m 20 -H 'Content-Type: application/json' \
    -d '{"founder_loop":true,"ping":"n8n-to-l7"}' \
    "$VPS_N8N_WEBHOOK_URL" 2>/dev/null || true)
else
  posted=$(ssh -o BatchMode=yes -o ConnectTimeout=8 vps \
    'curl -fsS -m 20 -H "Content-Type: application/json" -d "{\"founder_loop\":true,\"ping\":\"n8n-to-l7\"}" http://127.0.0.1:5678/webhook/l7-founder-loop' \
    2>/dev/null || true)
fi
if printf '%s' "$posted" | grep -q 'job_id'; then
  record "vps-n8n-l7-job" 1 "n8n webhook -> L7 /v1/jobs"
else
  record "vps-n8n-l7-job" 0 "webhook did not return an L7 job"
fi

echo
echo "Passed: $PASS  Failed: $FAIL"
[ "$FAIL" -eq 0 ]

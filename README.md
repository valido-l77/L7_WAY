# L7_WAY

**L7_WAY is the common language for MCP systems.**
It exists to bring order to tool chaos by enforcing a single, stable contract for discovery, selection, and execution of tools.

## Why L7_WAY
Tool ecosystems grow fast and fracture faster. L7_WAY stops divergence by requiring every tool, service, workflow, UI, or project to declare itself using the same seven dimensions. The gateway uses these declarations to route, validate, and evolve the system without breaking clients.

## Core Promise
- **Order without rigidity**: consistent structure, flexible tools.
- **Swappable by design**: replace tools without rewriting UI.
- **Gateway-first**: a universal entry point for all tools.

## Run the Gateway

Founder Loop (Mac-local Gateway + forge + AVLI workers). OpenClaw keeps
`:18789` when it already owns it; L7 binds `127.0.0.1:18793`.

```bash
./start.sh
```

Studio is `http://127.0.0.1:18793/studio`. Offers are `/offers`. Pair with
`./stop.sh`. `./start.sh` advertises the Gateway: Tailscale Serve of loopback
`:18793` (HTTP, tailnet only; never forge `:7378`, echo `:18792`, or the
Ollama worker `:18798`) plus the SSH reverse tunnel + docker-bridge
(`172.18.0.1:18793`). n8n in Docker still uses the SSH/docker-bridge path
until VPS TCP to the Mac tailnet is allowed. It sends `L7_API_TOKEN` with
`L7_API_TENANT_ID=tenant:service`. Optional `--vps-check` SSHes host `vps`
for docker/n8n health; it does not start `~/avli_cloud/start.sh` (that file
is the Hostinger docker advisor stack).

Smoke (6/6 when the loop is live):

```bash
L7_GATEWAY_URL=http://127.0.0.1:18793 bash scripts/founder-loop-smoke.sh
```

## How `avli_cloud` fits

L7 is the public control plane. `~/avli_cloud` is private workers and the
Hostinger CPU control plane — same AVLI Cloud product, not a second brand.

- **Workers:** Gateway jobs call the worker SDK on loopback. Echo
  (`text.echo`, `:18792`) is the proven path. If local Ollama is healthy,
  `text.generate` uses `packages/avli-worker-sdk/examples/ollama_worker.py`
  on `:18798`. Image and video stay on the Mac media adapters, not this
  worker. Workers are never Tailscale-served or Traefik-routed.
- **VPS n8n:** Reuse live Hostinger n8n. Do not deploy the 40-service
  compose or `deploy/compose.control-plane.yml` on the 8 GB VPS.
- **Landing / Studio:** `/offers` and `/studio` use the same Campaign $42 /
  Team $420 / Organization custom copy as `avli_cloud` landing.
- **Secrets:** Gateway and worker tokens live in
  `~/avli_cloud/deploy/secrets/` (and the operator vault). Never commit them.
- **Live VPS picture:** `~/avli_cloud/docs/CURRENT_ARCHITECTURE.md`.

Workspace identity is honest Team: `GET /v1/workspace` returns plan, role,
and library counts — not a member roster. Campaign remains one local
operator.

Gateway only:

```bash
npm start
```

`serve.js` is the canonical server. The historical `serve-gateway.js` name is
retained as a compatibility launcher and delegates to the same implementation.

## Morphic video

AVLI Cloud Studio is available at `http://127.0.0.1:18793/studio`. The default
video path is local and deterministic: SSD-1B creates and selects the grounded
BELOW frame, then the native Flux-style renderer creates a chained H.264 MP4.

Set `AVLI_VIDEO_ENGINE=cluster` to keep synthesis on the Apple MPS node and
send `video.finish` through the configured Tailscale SSH worker
(`AVLI_CLUSTER_SSH_HOST`, default `avli`). The cluster worker must expose
`ffmpeg` and `ffprobe`; its hostname, CPU count, toolchain, role, and connection
state appear in Studio and `/api/media/resources`. Paid Comfy partner execution
is separate and remains opt-in through `AVLI_VIDEO_ENGINE=comfy-cloud`.

## Required Reading (for every new project)
- `ARCHITECTURE.md`
- `BOOK_OF_LAW.md`
- `RAG_INTELLIGENCE.md`
- `L7_CONTRACTS.md`
- `TOOL_REGISTRY.md`
- `ENFORCEMENT.md`
- `L7_SCHEMA.json`
- `3D_NATURAL_LANGUAGE_WORLD_CREATOR_ENGINE.md` (new Spatial/MCP innovation)

## Codex Directive
For every new project or session, read this repo first. Do not bypass the gateway or skip L7 declarations.

## Files
- `ARCHITECTURE.md` — system articulation and rules.
- `BOOK_OF_LAW.md` — laws of the empire.
- `RAG_INTELLIGENCE.md` — gateway intelligence layer.
- `L7_CONTRACTS.md` — enforcement contracts.
- `TOOL_REGISTRY.md` — tool discovery rules.
- `ENFORCEMENT.md` — compliance requirements.
- `L7_SCHEMA.json` — finite L7 schema.
- `ENTITY_REGISTRY.md` — required entity metadata and lifecycle.
- `REGISTRY_SCHEMA.json` — registry schema.
- `ENTITY_TEMPLATE.md` — entity declaration template.
- `PROJECT_LIFECYCLE.md` — life and decommission protocol.
- `HERO_JOURNEY.md` — narrative doctrine.
- `APPRENTICE_PROTOCOL.md` — onboarding doctrine.
- `L7_CLI_SPEC.md` — CLI spec for legions.
- `daemon/` — enforcement script and install instructions.

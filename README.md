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

```bash
npm start
```

`serve.js` is the canonical server. The historical `serve-gateway.js` name is
retained as a compatibility launcher and delegates to the same implementation.

## Morphic video

AVLI Cloud Studio is available at `http://127.0.0.1:18789/studio`. The default
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

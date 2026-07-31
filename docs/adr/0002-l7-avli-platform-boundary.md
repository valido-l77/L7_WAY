# ADR 0002: L7–AVLI Platform Boundary

- Status: Accepted
- Date: 2026-07-27
- Decision owner: Alberto Valido Delgado
- Applies to: L7 WAY and AVLI Cloud

## Context

L7 and AVLI currently overlap in routing, model access, workflow execution, and
user-facing surfaces. AVLI also contains several competing deployment manifests
whose documented capabilities exceed the production VPS. The VPS has 2 vCPU,
8 GB RAM, no GPU, and must not become an inference host.

The platform needs one stable entrance, private replaceable workers, explicit
trust boundaries, and first-class text, image, video, voice, music, document,
and automation capabilities.

## Decision

### Ownership

L7 is the public control plane and policy authority. It owns:

- authentication and authorization decisions;
- the public `/v1` API and assistant tool contract;
- capability discovery and routing;
- flow state, approval gates, audit events, quotas, and provenance;
- content-addressed artifact identities and lifecycle policy.

AVLI is the private service and experience plane. It owns:

- the branded assistant-ui application and operator consoles;
- stateless model and media workers;
- PostgreSQL, Valkey, Qdrant, Docling, and n8n service operation;
- local Mac and future GPU-cluster inference adapters;
- artifact bytes addressed by the L7-issued content hash.

AVLI workers do not become alternate public gateways. The existing
`services/model-gateway` is to be narrowed into a private model worker after
its wildcard CORS, provider registry, authentication, and dependency posture
are replaced.

### Request path

```text
User → assistant-ui → L7 Gateway → policy/approval → AVLI worker
                                      ↓                  ↓
                                  audit/event ← result/artifact
```

Only the L7 Gateway accepts public capability calls. L7 sends an authenticated
service request over the private network. AVLI returns a canonical result
envelope or an asynchronous job reference. AVLI must never trust a user or
tenant identifier supplied by the browser; identity comes from the signed L7
service context.

### Internal worker contract

Every worker implements:

- `GET /internal/v1/health`
- `GET /internal/v1/capabilities`
- `POST /internal/v1/jobs`
- `GET /internal/v1/jobs/{job_id}`
- `POST /internal/v1/jobs/{job_id}/cancel`

Requests carry `Authorization: Bearer <service-token>`, `X-L7-Request-Id`,
`X-L7-Tenant-Id`, and `X-L7-Contract-Version`. Retries reuse the request ID as
the idempotency key. Long jobs return `202`; completion is polled or delivered
to an allowlisted L7 callback with an HMAC signature.

Worker results use `l7.result/1.0`. Artifacts include SHA-256, byte length,
media type, producer, model identifier, model/license metadata, prompt hash,
and creation time. URLs are short-lived delivery hints, never artifact
identity.

### Selected components

- UI: assistant-ui for the product; LibreChat only as a temporary operator UI.
- Local LLM runtime: Ollama; Qwen3.5 9B default and gpt-oss-20b optional.
- GPU serving: SGLang first benchmark candidate; vLLM fallback.
- Retrieval: Docling → PostgreSQL metadata → Qdrant vectors.
- Image/video: ComfyUI worker; SSD-1B baseline, LTX-2 primary video, Wan2.2
  alternate. FLUX models require a recorded license decision.
- Music: ACE-Step 1.5 primary, HeartMuLa secondary, DiffRhythm experimental.
  MusicGen retires only after quality and contract parity.
- Speech: faster-whisper STT, Chatterbox TTS, Kokoro fallback.
- Workflow: native L7 flows for governed product work; n8n for external
  integrations. Temporal is deferred until durable-workflow requirements are
  demonstrated.
- Identity: Authelia + LLDAP + WebAuthn on the private/Tailscale edge.
- Telemetry: OpenTelemetry protocol and collector; no heavyweight backend on
  the current VPS.
- Storage: retain L7 content-addressed storage; defer SeaweedFS until a second
  storage node or measured scale requires it.

Open WebUI is not selected for the branded product surface because its current
branding terms conflict with that role.

### Deployment topology

The Hostinger VPS runs only the CPU-safe AVLI control plane: PostgreSQL, Valkey,
Qdrant, n8n, identity/edge components, and lightweight adapters. Databases have
no public host ports. User interfaces bind to loopback and are published only
through the selected authenticated edge.

Mac and GPU nodes run inference workers. Workers advertise capabilities and
health; L7 selects them using policy, availability, privacy class, cost, and
resource fit. Loss of a worker must not lose flow state.

## Consequences

- There is one authorization and audit boundary.
- Model and media runtimes can change without changing the public API.
- The VPS remains supportable within its real hardware.
- Existing overlapping gateways and compose files enter a controlled
  deprecation path.
- An AVLI service is not production-ready until its worker contract,
  authentication, health, timeout, cancellation, license metadata, and
  conformance tests exist.

## Verification

- L7 rejects unauthenticated remote calls and unsafe remote binds.
- AVLI core services expose no public database/vector/cache ports.
- Contract tests run against every enabled worker.
- A text, document, image, video, voice, and music job each produces the same
  canonical result and artifact metadata shape.
- A worker outage is visible in health and does not corrupt L7 flow state.

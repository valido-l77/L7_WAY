# L7–AVLI Comprehensive Implementation Plan

Status: Active
Decision date: 2026-07-27
Architecture: `docs/adr/0002-l7-avli-platform-boundary.md`

This is the ordered execution backlog. A phase closes only when its acceptance
gate passes; installing software alone is not completion.

## 0. Preserve and secure the baseline

- [x] Put both repositories on `codex/l7-avli-unification`.
- [x] Default the legacy Empire server to loopback.
- [x] Require token authorization for remote Empire API calls.
- [x] Replace wildcard CORS with an allowlist.
- [x] Bound JSON request bodies and reject path traversal.
- [x] Remove shell interpolation from xattr and biometric helpers.
- [x] Repair invalid CLI shebangs.
- [x] Add targeted security regression tests.
- [ ] Rotate every credential listed in AVLI's secret-rotation checklist.
- [ ] Remove secret-bearing tracked artifacts from future history and builds.
- [ ] Snapshot and test restore of current Postgres, n8n, and artifact data.
- [ ] Resolve the NCLS data-loss/restore decision before importing participant
  data.

Gate: doctrine integrity passes, full L7 tests pass, secret scan is clean, and a
restore drill succeeds without touching production data.

## 1. Establish one deployable AVLI control plane

- [x] Add `deploy/compose.control-plane.yml`.
- [x] Pin PostgreSQL 18.4, Valkey 8.1.9, Qdrant 1.18.2, and n8n 2.30.5.
- [x] Keep database, cache, and vector ports off the host.
- [x] Bind n8n to loopback only and define health/resource limits.
- [ ] Validate the manifest with populated ephemeral test secrets.
- [ ] Back up existing volumes before any VPS deployment.
- [ ] Deploy under a new Dokploy project; do not reuse ambiguous old stacks.
- [ ] Verify memory remains below 70% and swap remains inactive under load.
- [ ] Publish n8n only through the authenticated private edge.
- [ ] Mark the three legacy compose definitions as non-authoritative; do not
  delete them until migration evidence is archived.
- [ ] Repair or retire the GitHub Actions deploy workflow after rotating its
  key and constraining its target.

Gate: four services remain healthy for 24 hours, are reachable only on intended
networks, and recover from a controlled restart.

## 2. Make L7 the only capability gateway

- [x] Define worker capability, job request/status, and artifact schemas.
- [x] Expose `/v1/capabilities`, `/v1/jobs`, job status, cancellation, and
  artifact delivery routes.
- [x] Add request ID/idempotency, server-derived tenant context, enforced
  deadlines, and terminal cancellation semantics
  to the L7 executor.
- [ ] Implement service-token and callback-HMAC verification.
- [ ] Replace the placeholder Council loop with real bounded parallel
  deliberation, structured votes, dissent, timeout, and audit records.
- [ ] Add a capability registry with health, privacy class, cost, modality,
  license, and resource requirements.
- [ ] Route every existing direct model/media call through the registry.
- [ ] Add per-tenant quotas, concurrency limits, and rate limits.
- [ ] Emit OpenTelemetry traces and correlated structured audit events.
- [ ] Deprecate Empire compatibility routes after clients move to `/v1`.

Gate: no browser can call an AVLI worker directly; duplicate request IDs cannot
duplicate work; approval-required work cannot bypass the L7 state machine.

## 3. Create the AVLI worker SDK and conformance suite

- [ ] Create a small Python worker SDK for auth, health, capabilities, job
  lifecycle, cancellation, timeouts, result envelopes, and telemetry.
- [ ] Create an equivalent TypeScript client for L7 and assistant-ui.
- [ ] Publish one JSON Schema/OpenAPI bundle generated from canonical types.
- [ ] Build a conformance harness usable against any worker URL.
- [ ] Test authentication failure, invalid input, timeout, cancellation,
  duplicate request, worker restart, artifact hash mismatch, and unavailable
  dependencies.
- [ ] Require SBOM, pinned image digest, license record, and vulnerability scan
  for every production worker.

Gate: a reference echo worker passes all contract and fault tests.

## 4. Replace the model gateway with a private model worker

- [ ] Remove wildcard CORS and all public host binding.
- [ ] Remove the stale hard-coded provider/model list.
- [ ] Discover Ollama/SGLang/vLLM capabilities dynamically.
- [ ] Store provider secrets outside the process environment where supported.
- [ ] Normalize streaming, tool calls, token usage, errors, and cancellation.
- [ ] Install Ollama on the Mac inference node.
- [ ] Benchmark Qwen3.5 9B as default and gpt-oss-20b as optional reasoning.
- [ ] Benchmark SGLang first on a GPU node; retain vLLM if it wins on reliability
  or required model support.
- [ ] Add cloud providers only as policy-controlled fallbacks.

Gate: text chat streams through L7, local inference works with network egress
disabled, and provider failover is observable and policy-controlled.

## 5. Ship the branded assistant experience

- [ ] Scaffold assistant-ui as the single product chat surface.
- [ ] Implement OIDC/WebAuthn sign-in through Authelia + LLDAP.
- [ ] Stream canonical L7 events: text, reasoning status, tool calls,
  approvals, artifacts, citations, errors, and cancellation.
- [ ] Build capability picker, model-policy display, job queue, artifact
  gallery, music player, waveform, image/video preview, and document viewer.
- [ ] Add accessible keyboard navigation, responsive layouts, reduced motion,
  and screen-reader labels.
- [ ] Deploy LibreChat only for operators during migration.
- [ ] Never use Open WebUI as the branded product surface.

Gate: a user completes one governed multimodal workflow from a phone and a
desktop without seeing internal worker endpoints.

## 6. Build retrieval and document intelligence

- [ ] Deploy Docling as a private worker.
- [ ] Store source/document metadata and ACLs in PostgreSQL.
- [ ] Store embeddings in Qdrant with tenant and document filters.
- [ ] Preserve page, section, table, and bounding-box provenance.
- [ ] Add malware/type/size checks before parsing.
- [ ] Add deletion propagation and re-index jobs.
- [ ] Evaluate retrieval with a versioned question/answer corpus.

Gate: answers cite the correct source spans, tenant isolation tests pass, and a
deleted document disappears from retrieval and storage.

## 7. Build image and video workers

- [ ] Run ComfyUI only on a private Mac/GPU node.
- [ ] Package versioned workflows instead of accepting arbitrary graphs.
- [ ] Establish SSD-1B as the baseline image workflow.
- [ ] Benchmark LTX-2 as primary video and Wan2.2 as alternate.
- [ ] Record model license, checksum, VRAM/RAM requirement, and allowed use.
- [ ] Keep FLUX disabled until its exact model license is accepted.
- [ ] Add progress, preview, cancellation, deterministic seed, and provenance.
- [ ] Enforce upload and output size/time limits.

Gate: image and video jobs survive UI reconnect, can be cancelled, and produce
verified content-addressed artifacts.

## 8. Make music and voice first-class

- [ ] Package ACE-Step 1.5 as the primary song/music worker.
- [ ] Add HeartMuLa as the secondary full-song path.
- [ ] Keep DiffRhythm experimental until quality and operational tests pass.
- [ ] Retire MusicGen only after blind quality, latency, and contract parity.
- [ ] Package faster-whisper with language/timestamp/diarization metadata.
- [ ] Package Chatterbox TTS and Kokoro fallback.
- [ ] Add stem/track metadata, lyrics policy, waveform, duration, sample rate,
  loudness normalization, and safe audio preview.
- [ ] Add prompt and reference-audio consent/provenance fields.

Gate: the UI can generate, stream, cancel, replay, download, and trace a music
job and a voice round trip through the same L7 job model.

## 9. Separate governed flows from external automation

- [ ] Keep approvals, destructive actions, tenant changes, and artifact
  lifecycle in L7 flows.
- [ ] Limit n8n to connectors, schedules, notifications, and import/export.
- [ ] Give n8n a least-privilege L7 service identity.
- [ ] Sign and replay-protect n8n webhooks.
- [ ] Export workflows as reviewed source; forbid credentials in exports.
- [ ] Reconsider Temporal only after measured requirements exceed L7 flow
  durability.

Gate: disabling n8n cannot bypass governance or corrupt an in-flight L7 job.

## 10. Operations, migration, and release

- [ ] Deploy an OpenTelemetry Collector and define retention/redaction.
- [ ] Add service SLOs for availability, queue time, execution time, and job
  success by modality.
- [ ] Add encrypted backups, restore tests, artifact integrity scans, and
  disaster runbooks.
- [ ] Add dependency update automation with staged conformance tests.
- [ ] Run load, chaos, privacy, authorization, accessibility, and license
  audits.
- [ ] Migrate one capability at a time: text → documents → images → video →
  voice → music → external automation.
- [ ] Keep rollback adapters until each capability meets its acceptance gate.
- [ ] Archive obsolete manifests and gateways only after 30 days of clean
  production evidence.

Final gate: all capabilities enter through L7, all workers are private and
replaceable, data can be restored, licenses are recorded, and the old public
gateway/monolithic deployment paths are disabled.

# L7 Morphic Media — Image and Video Generation

## Outcome

Morphic Media is a provider-neutral generation method for AVLI Cloud. It does not treat a prompt as a one-shot command. It treats generation as a bounded three-pass inquiry, preserves a declared identity invariant through every pass, and crystallizes only an approved, reproducible result.

The novelty is the control loop, not a claim that the underlying model is new. Existing diffusion, autoregressive image, and video models can serve as renderers behind AVLI adapters.

The local `field` adapter is a separate renderer with no model at all. Morphic Field Synthesis compiles prompt tokens into symbolic scene operators, complex interference fields, and signed-distance geometry, then writes the pixels directly. It contains no pretrained weights and makes no inference request. Its current visual vocabulary is deliberately small; extending the compiler adds operators rather than training data.

## The three passes

| Layer | Operation | Model task | Failure it addresses |
|---|---|---|---|
| △ ABOVE | Propose | Create direct interpretations of the brief | Weak exploration |
| ◇ MIRROR | Challenge | Create counterfactual views while locking identity | Prompt clichés and accidental assumptions |
| ▽ BELOW | Ground | Reconcile the best pair and enforce geometry/time | Identity drift and temporal incoherence |
| ◆ SALT | Crystallize | Hash, receipt, and archive all layer artifacts | Irreproducible or unaudited output |

Exactly three generative layers are permitted. SALT is not a fourth generation pass; it is the immutable selection event.

## Identity versus variation

Every request contains an `identity` kernel: the subject, product, character, place, or visual thesis that must survive. The Astrocyte controls how much everything outside that kernel may vary.

The planner represents this as ten real components (specified/manifested qualities) and ten imaginary components (permitted variation) modulated by the Caput/Cauda nodal pair. These values are deterministic control metadata. They are not presented as a physical or scientific measurement.

## Video is generated from a grounded world

Video does not begin with unconstrained text-to-video. BELOW first produces a canonical reconciled still. Motion is conditioned on that still and four causal anchors. AVLI then finishes the clip with the registered Flux chain:

1. `flux_tempo` controls temporal interpolation.
2. `flux_render` performs color, stabilization, and resolution work.
3. `flux_splice` produces the edit decision list and final assembly.

This ordering makes still identity, motion, and finishing independently inspectable.

## Adapter contracts

The planner emits capabilities, not vendor names:

- `image.generate` → `avli.image`
- `video.generate` → `avli.video`
- `video.finish` → `l7.flux`

`avli.image` and `avli.video` return an asset URI, SHA-256 content hash, and a model receipt containing provider, model/version, seed, normalized parameters, and request identifier. The local profile uses SSD-1B for the three image layers, then passes the Horizon-selected BELOW PNG through the native deterministic `avli-flux-motion` renderer and the registered `flux_tempo` → `flux_render` → `flux_splice` finish chain. Both motion and finished outputs are playable H.264 MP4 artifacts in the same content-addressed store.

The video adapter has three explicit execution engines:

- `auto` (default): private local generation; never activates paid egress.
- `native`: force the seeded AVFoundation/VideoToolbox renderer.
- `comfy-cloud`: upload only the selected BELOW image to the loopback ComfyUI
  service, submit an authenticated LTX-2 Pro image-to-video workflow, retrieve
  its 1080p MP4, then pass that artifact through the same local Flux finish,
  receipt, storage, Studio, and lifecycle path.

`GET /api/media/resources` probes the local AVLI Studio/ComfyUI resource
without exposing account credentials. AVLI Cloud execution is deliberately
fail-closed and must be enabled with `AVLI_VIDEO_ENGINE=comfy-cloud` after
provider cost and authentication have been approved.

## Horizon selection

The horizon may consider at most 42 candidates. Selection is explicit and weighted:

- identity fidelity: 0.32
- prompt fidelity: 0.21
- counterfactual value: 0.26 for images, 0.13 for video
- temporal coherence: 0.21 for video
- technical quality: 0.13

Automated scores rank candidates. After the third layer, all layer artifacts and model receipts crystallize into SALT automatically and the dream cycle locks. Human approval selects what may be released; a separate explicit `approveDreamCycle()` is required before another cycle begins.

## Running the implemented planner

```bash
node bin/l7-morph-media.js request.json > plan.json
```

Example request:

```json
{
  "brief": "a luminous city above the ocean",
  "identity": "one copper coastal city suspended on three arches",
  "mode": "video",
  "style": "cinematic",
  "ratio": "16:9",
  "duration": 12,
  "seed": 777,
  "astrocyte": 0.42,
  "candidates": 3
}
```

The output is a deterministic, content-addressed job graph. Planning is pure: it does not mutate `.morph` or `.salt`. The AVLI Gateway should execute the jobs, attach receipts, write the three dream layers through the existing domain operations, and allow the third write to crystallize the complete cycle automatically.

## Next integration slice

Implemented in the first hybrid slice:

- Gateway `POST /api/media/plan` and `POST /api/media/run` endpoints.
- Dependency-aware runner with deterministic mock adapters.
- Local and authenticated HTTPS VPS content-addressed storage clients.
- Deployable VPS receiver with SHA-256 verification and immutable objects.
- Versioned request, plan, job, asset, receipt, scorecard, selection,
  crystallization, and release contracts under `schema/v1/`.
- Capability-aware adapter registry with declared/configured/healthy/degraded/
  offline states and `GET /api/media/capabilities` discovery.
- Model receipts that distinguish requested from provider-confirmed seeds and
  record adapter identity, normalized parameters, provider request IDs, timing,
  cost, and safety metadata slots.
- Durable queued runs journaled under the private L7 state directory, with
  idempotent submission, restart recovery, progress snapshots, cancellation,
  and explicit resume after failure or cancellation.
- Materialized candidate fan-out: every requested image candidate is an
  independently addressable job with its own deterministic seed, asset,
  receipt, and content hash. A request can produce at most 24 image candidates
  across the three layers, below the 42-candidate Horizon boundary.
- Versioned Horizon scorecards and per-layer selections. The local baseline
  evaluator is deterministic and content-addressed; provider or human
  evaluators may replace its component scores without changing the contract.
- Grounded video execution receives the selected BELOW candidate plus the full
  dependency set and a scoped content-addressed asset loader, so the local
  adapter conditions motion on the selected still bytes without exposing
  private object paths in public run records.
- Local `video.generate` creates seeded anchor-aware motion from the selected
  BELOW still. Local `video.finish` consumes that MP4 and emits the registered
  three-stage Flux edit decision list while preserving receipts and lifecycle.
- AVLI Cloud Studio renders both BELOW video artifacts with native playback
  controls after a completed run.
- AVLI Cloud Studio discovers the loopback ComfyUI/MPS resource, displays
  LTX-2 availability and the active video engine, and keeps paid execution
  separate from capability discovery.
- Asynchronous run endpoints at `POST /api/media/runs`,
  `GET /api/media/runs/:id`, `GET /api/media/runs/:id/events`, and the
  `cancel`/`resume` actions. The original synchronous endpoint remains for
  compatibility.

The active default is local-only. Merely configuring `AVLI_MEDIA_STORAGE_URL` cannot cause network egress; remote storage activates only with the explicit `AVLI_MEDIA_STORAGE=vps` switch. Use `config/media-local.env.example` as the local profile.

Next:

1. Add optional provider video adapters behind the existing capability
   contracts without changing the local default.
2. Require biometric approval for release and for starting a new dream cycle.

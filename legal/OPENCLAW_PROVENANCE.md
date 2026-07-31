# OpenClaw-to-L7 Provenance Record
# Documenting the Historical Chain, License Boundaries, and IP Independence
# Alberto Valido Delgado — AVALIA CONSULTING LLC (dba Avli Cloud)
# Prepared: 2026-03-06

---

## I. PURPOSE

This document establishes the factual relationship between OpenClaw
(the open-source AI agent platform) and the L7 WAY system. It traces
the historical provenance chain, analyzes license compatibility, and
confirms that L7's 53 tools are original works — not derivatives of
OpenClaw — despite having been conceived in an environment that included
an OpenClaw instance.

---

## II. THE VALHALLA INSTANCE — Historical Origin Point

### What It Was

The Philosopher ran an OpenClaw instance (codenamed "Valhalla") on a
Mac Mini nicknamed "newdawn" under the user account "admin."

| Property | Value |
|----------|-------|
| OpenClaw Version | v2026.1.30 (later touched by v2026.2.2-3) |
| Device | Mac Mini "newdawn" (admin user) |
| Device ID | `07807b48d654125d5c2e48d9bee859037946dc0e75a0cd9de61db26c52ac506b` |
| Ed25519 Public Key | `MCowBQYDK2VwAyEAuDspwUZFDz3nfL851/oHv0Ci2FMSkdDtKshwVorXOTA=` |
| Minted | 2026-02-04T07:13:04.832Z |
| Skills Installed | 32 (from ClawHub) |
| Gateway Port | 18789 (local loopback) |
| Auth | Token-based (local) |
| Provider | Anthropic (API key) |
| Plugins | iMessage |
| Workspace | `/Users/admin/.openclaw/workspace` |
| Status | Disconnected (machine offline) |

### What Was in the Workspace

The OpenClaw workspace contained standard template files provided by
the OpenClaw onboarding wizard:

| File | Nature | Origin |
|------|--------|--------|
| `SOUL.md` | Personality/behavior template | OpenClaw default (MIT) |
| `AGENTS.md` | Agent behavior guidelines | OpenClaw default (MIT) |
| `TOOLS.md` | Local tool notes template | OpenClaw default (MIT) |
| `BOOTSTRAP.md` | First-run onboarding script | OpenClaw default (MIT) |
| `HEARTBEAT.md` | Periodic check configuration | OpenClaw default (MIT) |

These files are generic scaffolding. They define no tools, no
architecture, no classification system. They are instructions for
an AI agent's personality and session behavior — comparable to a
`.bashrc` or `.vimrc` for a chatbot.

### What the Philosopher Created Inside the Workspace

| File/Directory | Nature | Classification |
|----------------|--------|----------------|
| `lta7-framework/` | Python implementation of L7's 7-stage architecture | CITIZEN OF EMPIRE |
| `ncls-architecture-presentation.html` | NC Life Study presentation | CITIZEN (prior work) |
| Various NCLS screenshots | Dashboard documentation | CITIZEN (prior work) |
| `knowledge_graph/` | Knowledge graph experiments | CITIZEN (Philosopher's research) |

The LTA-7 framework was authored by Alberto Valido Delgado. (It was
previously attributed to an "academic alias," Alberto Vargas-Lujan —
deprecated 2026-07-29, not a real identity.) It is a Python package
implementing the seven-stage
transformation architecture (core.py, entity.py, gateway.py, graph.py,
l7_schema.py, registry.py, stages.py). This code was written by the
Philosopher, inside the OpenClaw workspace directory, but it has NO
dependency on OpenClaw. It is a standalone Python library.

---

## III. THE TRANSITION — From OpenClaw User to L7 Architect

### Timeline

| Date | Event |
|------|-------|
| 2026-01-12 | L7 WAY framework conceived and first commits pushed to GitHub |
| 2026-02-04 | Valhalla instance minted on Mac Mini "newdawn" |
| 2026-02-05 | OpenClaw onboarding wizard last run (v2026.2.2-3) |
| 2026-02-27 | L7 license changed from MIT metadata reference to full proprietary |
| 2026-02-28 | L7 Emporium born — 46 tools across 8 suites forged in a single session |
| 2026-03-01 | Provenance Tree documented — all identities traced to one root |
| 2026-03-06 | Additional tools (Harmonics, Studio, Watermark) bring total to 53 |

### Key Fact

L7 WAY was conceived on January 12, 2026 — **23 days BEFORE** the
Valhalla OpenClaw instance was created on February 4, 2026.

The L7 architecture (Common Lingua, Gateway, Flow Engine, Four Domains)
predates the Philosopher's use of OpenClaw. OpenClaw was a tool used
during development, not the source of the ideas.

---

## IV. OPENCLAW LICENSE TERMS

### Core Platform: MIT License

The OpenClaw gateway, CLI, and entire codebase are released under
the MIT License. This means:

- Free to use, copy, modify, distribute
- Commercial use permitted
- No copyleft obligations
- Only requirement: include the MIT license notice

### ClawHub Skills: Creator Retains IP

Per OpenClaw's ClawHub terms:

- Skill creators retain full ownership of their submitted skills
- Creators grant OpenClaw a limited license to host and process skills
- Skills can have their own license terms
- Third-party skills are NOT audited by OpenClaw for safety

**Security Note:** Cisco Talos research found third-party ClawHub
skills performing data exfiltration. The Philosopher's NIS (Necropolis
Intelligence Service) was designed in part to address this class of
threat — runtime monitoring of injected code, MutationObserver
surveillance, rate limiting on all inputs.

### OpenClaw Workspace Files: MIT

The template files (SOUL.md, AGENTS.md, TOOLS.md, BOOTSTRAP.md,
HEARTBEAT.md) are part of the MIT-licensed OpenClaw distribution.
They are generic templates, not creative works unique to the
Philosopher's use.

---

## V. L7 TOOL INVENTORY — 53 Original Works

### The 53 tools exist in 11 suites at `~/.l7/tools/`:

#### Spatial XR Suite (18 tools) — Cross-device spatial computing
| Tool | MCP Method | Purpose |
|------|-----------|---------|
| xr_session | xr.session.manage | Session lifecycle |
| xr_space | xr.space.* | Space management |
| xr_container | xr.container.* | UI containers |
| xr_entity | xr.entity.* | Entity management |
| xr_component | xr.component.* | Component system |
| xr_mesh | xr.mesh.* | 3D mesh operations |
| xr_material | xr.material.* | Material system |
| xr_hand | xr.hand.* | Hand tracking |
| xr_eye | xr.eye.* | Eye tracking |
| xr_gesture | xr.gesture.* | Gesture recognition |
| xr_passthrough | xr.passthrough.* | AR passthrough |
| xr_scene | xr.scene.* | Scene understanding |
| xr_anchor | xr.anchor.* | Spatial anchors |
| xr_shared_anchor | xr.shared_anchor.* | Multi-user anchors |
| xr_audio | xr.audio.* | Spatial audio |
| xr_avatar | xr.avatar.* | Avatar system |
| xr_compositor | xr.compositor.* | Render composition |
| xr_frame | xr.frame.* | Frame timing |

#### Meridian Suite (4 tools) — Vision intelligence (Sun)
| Tool | MCP Method | Purpose |
|------|-----------|---------|
| meridian_core | meridian.contour | Visual boundary analysis |
| meridian_chroma | meridian.chroma | Color intelligence |
| meridian_depth | meridian.depth | Depth mapping |
| meridian_iris | meridian.iris | Pattern recognition |

#### Kinesis Suite (4 tools) — Motion and body (Moon)
| Tool | MCP Method | Purpose |
|------|-----------|---------|
| kinesis_track | kinesis.track | Motion tracking |
| kinesis_gesture | kinesis.gesture | Gesture analysis |
| kinesis_flow | kinesis.flow | Movement flow |
| kinesis_mirror | kinesis.mirror | Body mirroring |

#### Resonance Suite (4 tools) — Sound and space (Mars)
| Tool | MCP Method | Purpose |
|------|-----------|---------|
| resonance_field | resonance.field | Acoustic field mapping |
| resonance_voice | resonance.voice | Voice analysis |
| resonance_beat | resonance.beat | Rhythm detection |
| resonance_ambient | resonance.ambient | Ambient soundscape |

#### Flux Suite (4 tools) — Video and time (Mercury)
| Tool | MCP Method | Purpose |
|------|-----------|---------|
| flux_render | flux.render | Video rendering |
| flux_tempo | flux.tempo | Temporal analysis |
| flux_splice | flux.splice | Video editing |
| flux_stream | flux.stream | Live streaming |

#### Tesseract Suite (4 tools) — 3D and spatial (Jupiter)
| Tool | MCP Method | Purpose |
|------|-----------|---------|
| tesseract_forge | tesseract.forge | 3D object creation |
| tesseract_scene | tesseract.scene | Scene composition |
| tesseract_anchor | tesseract.anchor | Spatial anchoring |
| tesseract_portal | tesseract.portal | Cross-space portals |

#### Herald Suite (4 tools) — Communication (Venus)
| Tool | MCP Method | Purpose |
|------|-----------|---------|
| herald_cast | herald.broadcast | Multi-channel broadcast |
| herald_cipher | herald.cipher | Encrypted communication |
| herald_beacon | herald.beacon | Signal/alert system |
| herald_relay | herald.relay | Message relay/routing |

#### Codex Suite (4 tools) — Knowledge and archives (Saturn)
| Tool | MCP Method | Purpose |
|------|-----------|---------|
| codex_index | codex.search | Semantic search |
| codex_fossil | codex.fossil | Archaeological recovery |
| codex_amber | codex.amber | Preservation/archival |
| codex_scribe | codex.scribe | Documentation generation |

#### Harmonics Suite (2 tools) — Field tuning
| Tool | MCP Method | Purpose |
|------|-----------|---------|
| harmonics_tune | harmonics.tune | Decoherence damping |
| harmonics_cascade | harmonics.cascade | Cascade propagation |

#### Studio Suite (3 tools) — Creative production
| Tool | MCP Method | Purpose |
|------|-----------|---------|
| studio_synth | studio.synthesize | Audio synthesis |
| studio_visual | studio.visual | Visual generation |
| studio_export | studio.export | Media export |

#### Watermark Suite (2 tools) — Provenance and verification
| Tool | MCP Method | Purpose |
|------|-----------|---------|
| watermark_provenance | watermark.stamp | Content provenance |
| watermark_verify | watermark.verify | Integrity verification |

---

## VI. ORIGINALITY ANALYSIS — L7 Tools vs OpenClaw Skills

### What OpenClaw Skills Are

OpenClaw skills are Node.js packages published to ClawHub. They follow
OpenClaw's skill format: a directory with `SKILL.md` (description),
`package.json` (dependencies), and JavaScript handler code. They are
invoked through the OpenClaw gateway via its native skill execution
system.

### What L7 Tools Are

L7 tools are YAML declarations following the L7 Common Lingua schema.
Each `.tool` file declares:

- `name`, `suite`, `tagline` — identity
- `does` — capability verb (analyze, render, communicate, automate, data)
- `server`, `mcp_tool` — MCP server binding and method
- `needs` / `gives` — typed input/output contract
- `pii`, `approval`, `audit` — governance flags
- `output`, `runs`, `version` — execution semantics
- `icon`, `color` — visual identity
- `patent`, `inventor` — IP attribution (where applicable)

### Structural Differences

| Property | OpenClaw Skill | L7 Tool |
|----------|---------------|---------|
| Format | Node.js package + SKILL.md | YAML declaration |
| Execution | OpenClaw skill runtime | L7 Gateway + MCP server |
| Discovery | ClawHub marketplace | L7 Emporium |
| Schema | OpenClaw skill schema | 7D Common Lingua |
| Governance | None (MIT, run anything) | pii/approval/audit flags |
| Classification | Tags/categories | 7-dimensional coordinates |
| Orchestration | OpenClaw agent routing | L7 Flow Engine (YAML) |
| IP Attribution | Optional | Built into schema (patent/inventor fields) |
| Composition | Independent skills | Suite-based, planetary correspondence |

### The Critical Distinction

OpenClaw is a **platform** — a gateway that routes requests to skills.
L7 is an **architecture** — a classification system, composition model,
and governance framework for software tools.

The L7 Common Lingua (7-dimensional classification), the Four Domains
(.morph/.work/.salt/.vault), the 777 spatial computing translation
table, the planetary suite correspondences, and the gateway-first MCP
routing pattern are all original to L7. None of these concepts exist
in OpenClaw.

OpenClaw's contribution to L7's development was environmental: it
provided a workspace where the Philosopher experimented with AI-assisted
development. But the ideas that became L7 predate OpenClaw usage and
have no structural dependency on it.

---

## VII. LICENSE COMPATIBILITY ANALYSIS

### Can L7 Tools Be Published as ClawHub Skills?

**Technically yes. Strategically no.**

The analysis:

1. **OpenClaw is MIT.** Using OpenClaw's platform imposes no license
   obligations on the skills published to it. ClawHub terms confirm
   that creators retain IP.

2. **L7 tools are proprietary.** They are governed by the L7 WAY
   Software License: free for non-commercial use, 12% of gross
   commercial revenue for commercial use.

3. **The conflict:** If an L7 tool were published as a ClawHub skill,
   it would be discoverable and installable by any OpenClaw user.
   The MIT ecosystem creates an expectation of free-as-in-MIT. Users
   may install and commercially deploy the skill without realizing
   they owe a 12% license fee under the L7 license.

4. **Enforcement difficulty:** Tracking commercial use of skills
   distributed through an MIT-licensed marketplace with 13,000+
   skills and no audit mechanism is impractical.

5. **Security risk:** Cisco found ClawHub skills exfiltrating data.
   Publishing L7 tools there exposes them to a supply chain where
   neighboring skills may be compromised.

### Recommendation

**Do NOT publish L7 tools to ClawHub.**

Instead:
- Maintain L7 tools in the L7 Emporium (controlled distribution)
- If interoperability with OpenClaw is desired, publish a thin
  **adapter skill** on ClawHub that connects to the L7 Gateway via
  MCP — the adapter is MIT, the tools behind the gateway are L7-licensed
- This preserves the license boundary: MIT adapter in OpenClaw,
  proprietary tools in L7 Gateway

---

## VIII. WHAT L7 OWES OPENCLAW

### Direct Dependencies: NONE

L7 tools do not import, require, or extend any OpenClaw code.
The L7 Gateway (`lib/gateway.js`) uses the MCP SDK directly
(@modelcontextprotocol/sdk, MIT license), not OpenClaw's gateway.

### Conceptual Influence: ACKNOWLEDGED, NOT DERIVATIVE

OpenClaw demonstrated the value of:
- A local AI agent with tool access
- Workspace-based persistence (SOUL.md, MEMORY.md)
- Skill-based modularity

L7 independently developed:
- A 7-dimensional classification system for tools
- A gateway-first architecture with audit, approval, and founder verification
- A YAML flow engine for cross-device orchestration
- A four-domain filesystem lifecycle
- Planetary correspondence suites
- Weighted hypergraph compilation (Prima language)
- 12+1 dimensional coordinate system

The relationship is analogous to "I used a word processor to write a
novel." The word processor (OpenClaw) influenced the writing environment
but did not author the novel (L7).

### Financial Obligation: NONE

OpenClaw is MIT licensed. No royalty, no attribution requirement beyond
the MIT notice (which applies to OpenClaw's code, not to works created
using it).

---

## IX. THE PROVENANCE CHAIN — SUMMARY

```
Mac Mini "newdawn" (admin)
  |
  |-- OpenClaw v2026.1.30 installed (2026-02-04)
  |     |-- SOUL.md, AGENTS.md, TOOLS.md (OpenClaw MIT templates)
  |     |-- 32 ClawHub skills installed
  |     |-- Philosopher's workspace experiments
  |     |     |-- lta7-framework/ (Python, Philosopher's IP)
  |     |     |-- ncls-* files (Philosopher's prior work)
  |     |     |-- knowledge_graph/ (Philosopher's research)
  |     |
  |     `-- Valhalla identity token (Ed25519, adopted by factory)
  |
  `-- (machine disconnected)

MacBook Pro "factory" (rnir_hrc_avd)
  |
  |-- L7 WAY conceived (2026-01-12, 23 days BEFORE OpenClaw)
  |     |-- GitHub commits: 313532f through 61b0672
  |     |-- Common Lingua, Gateway, Flow Engine, Four Domains
  |     |
  |-- Valhalla identity adopted from newdawn
  |     |-- Cryptographic continuity preserved
  |     |-- "The oldest provenance token in the empire"
  |     |
  |-- L7 Emporium forged (2026-02-28)
  |     |-- 53 .tool files across 11 suites
  |     |-- YAML declarations, NOT OpenClaw skills
  |     |-- MCP-native, Gateway-routed
  |     |
  |-- L7 License History:
  |     |-- ERA 1: MIT research period (Jan 12 - Feb 27, 2026)
  |     |-- ERA 2: Proprietary, 10% one-time (Feb 27 - Mar 5, 2026)
  |     |-- ERA 3: Proprietary, 12% revenue share (Mar 6, 2026 - present)
  |     |-- Prior terms honored for prior recipients (none known)
  |     |
  `-- Trade secrets designated under DTSA + Florida UTSA
```

---

## X. LEGAL SUMMARY

1. **L7 predates OpenClaw usage.** First commit: January 12, 2026.
   OpenClaw installed: February 4, 2026.

2. **L7 tools have no code dependency on OpenClaw.** They use the
   MCP SDK (MIT) directly, not through OpenClaw.

3. **OpenClaw's MIT license imposes no obligations on L7.** MIT
   requires only that the MIT notice be included in copies of
   OpenClaw's code. L7 does not copy or distribute OpenClaw's code.

4. **L7's own MIT research period (Jan 12 – Feb 27, 2026) is a
   separate matter from OpenClaw's MIT license.** L7's early versions
   carried an MIT metadata reference in package.json. This was the
   Founder's own choice during the research period, not an obligation
   imposed by OpenClaw. The MIT period ended when the Founder adopted
   proprietary terms on February 27, 2026. Recipients of L7 code
   during the MIT period retain MIT rights to those specific versions
   only (see LICENSE Section 13).

5. **The Philosopher's works created inside the OpenClaw workspace
   belong to the Philosopher.** ClawHub terms confirm creators retain
   IP. The LTA-7 framework and all other Philosopher-authored files
   in the workspace are Citizens of Empire.

6. **L7 tools should NOT be published to ClawHub** due to license
   incompatibility, enforcement difficulty, and supply chain risk.

6. **The Valhalla identity token is Empire property.** It was
   generated on the Philosopher's machine, with the Philosopher's
   keys, and has been adopted into the L7 identity chain as the
   oldest cryptographic provenance artifact.

---

*This record is factual, verifiable, and suitable for legal proceedings.*
*Alberto Valido Delgado, AVALIA CONSULTING LLC (dba Avli Cloud)*

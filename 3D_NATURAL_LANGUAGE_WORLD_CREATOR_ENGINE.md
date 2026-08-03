# 3D Natural Language World Creator Engine — L7 Extension

**Status**: Proposed Innovation (2026-08-01)  
**Owner**: L7 Founder + MCP Server Side  
**Related**: UnrealLLM (ACL 2025), UE 5.8 MCP Plugin, DreamScape, Babylon.js MCP, L7_WAY Seven Seals, MCP Protocol

## Vision
Extend L7_WAY / MCP gateway to natively support a **3D Natural Language World Creator Engine** as a first-class capability. Users (or agents) describe worlds/scenes in plain language ("create a cyberpunk neon alley with flying cars, rain, and interactive holograms for XR training sim") and the engine procedurally generates, edits, simulates, and exports production-ready 3D/XR content.

This positions L7 as the contract layer for the next wave of spatial computing + AI simulation platforms (Unreal + XR focus).

## Why This Matters for MCP Server Side
- Current L7_WAY excels at tool contracts, routing, and 7D declarations.
- 3D spatial + NL generation is the missing **Spatial Seal** (extending Capability + Data + Orchestration).
- Bridges text/LLM agents directly to high-fidelity engines (Unreal PCG, Nanite/Lumen, Chaos physics, XR plugins) without custom glue.
- Enables innovative simulations: embodied AI training, XR world-building, procedural cities, real-time collaborative metaverses, scientific visualization.

## Core Architecture (L7-Native)
### New 8th Seal: **Spatial (3D/XR World)**
- **Capability 🔧**: NL → Scene Graph + PCG + Physics + XR
  - Tools: `world.create`, `world.edit`, `world.simulate`, `world.exportXR`, `scene.raycast`, `asset.procedural`
- **Data 📦**: Scene graphs (JSON + USD/ glTF + UE Blueprints), voxel/heightfield terrain, material graphs, animation rigs, simulation state (physics, agents, weather).
- **Policy/Intent 🧭**: Safety bounds (no destructive sims without approval), provenance tracking for generated assets, XR comfort/LOD policies.
- **Presentation 🧩**: 3D viewport adapters (WebXR, Unreal Editor, Babylon.js, Unity), voice + text + gesture input.
- **Orchestration 🔗**: Multi-agent pipelines (UnrealLLM-style): Planner → Asset Retriever → PCG Node Editor → Physics Validator → XR Renderer.
- **Time/Versioning 🕒**: Versioned world snapshots, simulation timelines, reversible edits.
- **Identity/Security 🛡️**: Sealed 3D domains; signed asset provenance; user/agent ownership of generated worlds.

### MCP Server Implementation
**Primary Backend Recommendation (Do Not Build From Scratch)**

Use the **official Unreal MCP** (native in Unreal Engine 5.8+) as the core execution engine:
- Epic Games ships an MCP server directly inside the Unreal Editor (experimental but official).
- LLMs/agents can already perform natural language operations: spawn/configure actors, lighting, materials, PCG graphs, run automation, etc.
- This directly implements the `world.create`, `world.edit`, `world.simulate`, `scene.raycast`, and `scene.validate` tools declared in `spatial-world-tools.json`.

**Secondary / Complementary**
- **UnrealLLM** (ACL 2025) for high-level text → PCG Blueprint pipelines and large-scale interactive scene generation.
- Community UE MCP servers (StraySpark 200+ tools, etc.) for richer coverage.
- Ludus AI + Meshy/Tripo/Hunyuan3D plugins for text-to-3D asset generation inside UE.

L7 acts as the **declaration, routing, and policy layer** on top of these existing UE MCP implementations rather than re-implementing 3D rendering or editor control.

### Innovative Features (Beyond Current Tools)
1. **Conversational Scene Graph** — Full bidirectional: LLM understands and mutates live UE scene graph via natural language + structured feedback loops (raycast validation, semantic checks).
2. **Procedural + Generative Hybrid** — PCG nodes driven by LLM agents (UnrealLLM) + diffusion models conditioned on 3D depth/normal passes.
3. **Embodied Simulation Loop** — Agents live inside the world (VirtualEnv-style), execute NL commands, get vision-language feedback, and iterate.
4. **XR-First Export** — One-command "make this XR-ready" with comfort profiles, passthrough blending, hand-tracking interactions, and LOD streaming.
5. **L7 Gateway Routing** — All 3D tools declared via L7_SCHEMA, discoverable, versioned, swappable backends (Unreal ↔ Babylon ↔ custom).
6. **Multi-World Orchestration** — Gateway can spin parallel simulations for A/B testing, agent training batches, or collaborative sessions.

## Required Reading Updates
Add to L7_WAY required reading:
- This file
- `L7_SCHEMA.json` (now includes Spatial seal + spatial.3d.* capabilities)
- `mcp/declarations/spatial-world-tools.json` (first 8D tool group declaration)
- `mcp/integrations/unreal-mcp.md` (official integration guide with tool mappings)
- UnrealLLM paper (ACL 2025)
- UE 5.8 MCP docs (Epic native server)
- DreamScape + Babylon MCP repos (fallback)

## Next Steps (L7 Way)
1. **Adapter Implementation** — Complete the Unreal MCP adapter (Phase 1 spec done).
2. Gateway registration of the Spatial tool group.
3. Policy engine integration for high-risk operations.
4. End-to-end test with real UE 5.8 editor + MCP.
5. Provenance + audit trail wiring.

**Current State**: Schema + Law + Tool declarations + Integration spec + Adapter skeleton complete. No demos — production path only.

---

*Generated as part of L7 innovative MCP server-side evolution. All external research synthesized for L7-native design.*
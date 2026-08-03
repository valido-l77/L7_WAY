# L7 + Unreal MCP Integration (UE 5.8+)

**Status**: Recommended Production Path  
**Date**: 2026-08-02  
**Owner**: L7 Spatial Seal  
**Backend**: Official Unreal Engine MCP (native in UE 5.8+)

## Overview

L7 does **not** implement 3D rendering, PCG, or editor control.  
Instead, L7 declares the contract and routes calls to the **official Unreal MCP server** that Epic ships inside the Unreal Editor.

This is the correct, non-duplicative approach.

## Tool Mapping (L7 → Unreal MCP)

| L7 Tool              | Unreal MCP Equivalent                  | Description                                      | Example Payload |
|----------------------|----------------------------------------|--------------------------------------------------|-----------------|
| `world.create`       | `unreal.editor.spawn_actors` + PCG     | Create scene from natural language description   | See below |
| `world.edit`         | `unreal.editor.modify_actors`          | Natural language or structured patch             | See below |
| `world.simulate`     | `unreal.editor.run_simulation`         | Physics + agent simulation (Chaos)               | `{ "duration": 30, "scene_id": "..." }` |
| `world.exportXR`     | Custom export tool + XR plugins        | Package for Quest 3 / Vision Pro / ARKit         | `{ "platforms": ["quest3", "visionpro"] }` |
| `scene.raycast`      | `unreal.editor.raycast`                | Query scene with ray                             | `{ "origin": [...], "direction": [...] }` |
| `scene.validate`     | `unreal.editor.validate_scene`         | Physics, XR comfort, semantic checks             | `{ "scene_id": "..." }` |

## Example Payloads

### world.create
```json
{
  "tool": "world.create",
  "input": {
    "description": "cyberpunk neon alley with flying cars, heavy rain, interactive holograms, night lighting",
    "style": "cyberpunk",
    "engine": "unreal-5.8",
    "xr_ready": true,
    "pcg_preset": "urban-alley-v2"
  }
}
```

**Unreal MCP mapping**:
- Uses `unreal.editor.spawn_actors` + PCG graph execution
- Leverages UnrealLLM-style text-to-PCG blueprint translation where available

### world.edit
```json
{
  "tool": "world.edit",
  "input": {
    "scene_id": "cyberpunk-alley-001",
    "changes": "increase rain intensity by 40%, add 3 flying vehicles with neon trails, make holograms interactive"
  }
}
```

### scene.raycast + scene.validate (combined)
```json
{
  "tool": "scene.raycast",
  "input": {
    "scene_id": "cyberpunk-alley-001",
    "origin": [12, 8, 18],
    "direction": [-0.6, -0.3, -0.7]
  }
}
```

## Setup (Unreal Editor Side)

1. **UE 5.8+ required**
2. Enable plugins:
   - **Unreal MCP**
   - **All Toolsets**
3. Editor Preferences → Model Context Protocol → Enable auto-start (default: `127.0.0.1:8000/mcp`)
4. Generate client config for external agents (L7 gateway will connect here)

L7 gateway discovers the Unreal MCP server via the existing `mcp-discover.sh` mechanism or direct registration.

## L7 Responsibilities (What We Own)

- Tool declaration (`spatial-world-tools.json`)
- Policy / approval gates (Law X)
- Provenance & versioning
- Multi-backend routing (Unreal ↔ Babylon fallback)
- XR comfort + safety policies
- Gateway orchestration across multiple UE instances

## Unreal Responsibilities (What Epic Owns)

- Actual scene graph mutation
- PCG execution
- Physics (Chaos)
- Rendering (Nanite/Lumen)
- XR runtime export
- Editor state synchronization

## Next Integration Steps

1. Register Unreal MCP as a backend in L7 gateway config.
2. Implement thin adapter in L7 that translates the 6 spatial tools into Unreal MCP JSON-RPC calls.
3. Add approval workflow for high-risk operations (`world.simulate` with long duration, destructive edits).
4. Test end-to-end with a real UE 5.8 project.

This integration keeps L7 as the contract layer while leveraging the best existing 3D engine implementation. No duplication of Unreal's editor or rendering stack.
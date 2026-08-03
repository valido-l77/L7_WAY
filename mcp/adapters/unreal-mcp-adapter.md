# L7 Spatial Adapter — Unreal MCP

**Version**: 0.1.0  
**Status**: Specification + Skeleton  
**Backend**: Unreal Engine 5.8+ MCP (native)  
**Purpose**: Production adapter that translates L7 Spatial tool calls into Unreal MCP operations with full policy, provenance, and error handling.

## Architecture

```
L7 Gateway
    ↓ (L7 tool call + context)
Spatial Adapter (this module)
    ↓ (translated + approved request)
Unreal MCP Server (UE 5.8 Editor)
    ↓
Unreal Engine (PCG, Chaos, Nanite, Lumen, XR)
```

The adapter is **stateless** where possible. All state lives in UE or L7 gateway.

## Tool Translation Table

| L7 Tool              | Unreal MCP Tool(s)                     | Required Pre-Checks                  | Approval Level | Provenance Required |
|----------------------|----------------------------------------|--------------------------------------|----------------|---------------------|
| `world.create`       | `spawn_actors` + `execute_pcg_graph`   | Description length, style allowed    | Medium         | Yes (prompt + seed) |
| `world.edit`         | `modify_actors` + `set_parameters`     | Scene exists, patch valid            | Medium/High    | Yes (diff)          |
| `world.simulate`     | `run_simulation` / `chaos_sim`         | Duration < threshold or approved     | High           | Yes                 |
| `world.exportXR`     | `export_package` + XR plugin calls     | Scene validated                      | Low            | Yes                 |
| `scene.raycast`      | `raycast`                              | Scene loaded                         | Low            | Optional            |
| `scene.validate`     | `validate_physics` + `xr_comfort`      | Scene exists                         | Low            | Optional            |

## Adapter Interface (Contract)

```python
class UnrealMCPAdapter:
    def __init__(self, mcp_endpoint: str, policy_engine, provenance_store):
        ...

    async def execute(self, l7_tool: str, payload: dict, context: dict) -> dict:
        """
        Main entry point.
        - Validates payload against L7 schema
        - Applies policy checks
        - Translates to Unreal MCP call(s)
        - Executes with timeout + retry
        - Records provenance
        - Returns normalized {data, error, meta}
        """
        ...
```

## Key Responsibilities

### 1. Translation Layer
- Map L7 natural language + structured fields to exact Unreal MCP tool names and parameters.
- Handle both high-level (`description`) and low-level (`pcg_graph_patch`) inputs.

### 2. Policy Enforcement (Law X)
- `world.simulate` with `duration_seconds > 60` → requires explicit human approval.
- Destructive edits on production scenes → approval gate.
- XR export without comfort validation → blocked or warned.

### 3. Provenance (Law XLIX + LIII)
Every output must include:
```json
{
  "provenance": {
    "l7_prompt": "...",
    "l7_tool_call_id": "uuid",
    "unreal_mcp_call_ids": ["..."],
    "timestamp": "...",
    "seed": 123456,
    "actor": "l7.spatial.adapter"
  }
}
```

### 4. Error & Timeout Handling
- Map Unreal MCP errors to L7 error taxonomy.
- Hard timeout on long-running simulations.
- Automatic retry for transient editor state issues.

### 5. Multi-Instance Support
Adapter can target multiple UE editor instances (different projects or parallel worlds).

## Skeleton Implementation Plan

Phase 1 (Current)
- Spec + basic translation mapping
- Policy stub
- Provenance stub

Phase 2
- Real MCP client (HTTP + JSON-RPC)
- Approval integration with L7 gateway
- Logging + audit trail

Phase 3
- Production deployment behind L7 gateway
- Monitoring + circuit breakers
- Fallback to Babylon.js adapter when UE unavailable

## Current Skeleton Location

`mcp/adapters/unreal/`

- `adapter.py` — main class
- `mappings.py` — tool translation table
- `policy.py` — approval rules
- `provenance.py` — lineage recording
- `config.example.json`

This adapter will become the canonical bridge for all L7 Spatial work. No shortcuts. No demos. Production path only.
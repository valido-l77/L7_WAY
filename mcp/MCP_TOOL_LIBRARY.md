# L7 MCP Tool Library

**Purpose**: Single source of truth for every MCP server and tool available to the L7 gateway. This is the living implementation of Law II (The Lingua) and Law III (The Registry).

**Last Updated**: 2026-08-01
**Status**: Active Development

## Structure

```
mcp/
├── MCP_TOOL_LIBRARY.md          # This file
├── declarations/                # Canonical L7 declarations (one JSON per logical tool group)
│   ├── spatial-world-tools.json
│   ├── docker-mcp-*.json
│   └── avli-*.json
├── discovery/                   # Discovery scripts & output
│   ├── mcp-discover.sh
│   └── last-scan.json
└── library/                     # Human-readable tool catalog
    └── tools-catalog.md
```

## Current Registered Tool Groups

### 1. Spatial World Tools (3D Natural Language World Creator)
**Declaration**: `declarations/spatial-world-tools.json`
**Category**: `spatial.3d.world`
**Backends**: unreal-5.8, babylonjs, blender
**Tools**: 6 core tools

### 2. External MCP Sources (Consolidated)
**Location**: `external/cursor-mcp/`
**Sources**: Cursor IDE plugin MCP configs (Notion, Figma, AWS DSQL, Linear, etc.)
**Status**: Raw sources copied to 1 level for normalization

### 3. Docker MCP Servers (Planned)
**Status**: Awaiting Docker daemon access
**Expected Sources**: Containers with label `l7.mcp=true`

### 4. AVLI Cloud MCP Servers (Planned)
**Status**: Awaiting endpoint access
**Known Endpoint**: 18789 (studio)

---

## Ingenious Solutions Implemented

1. **Unified Declaration Format** — Every tool group uses the same 8D structure (even if we keep it in 7 seals).
2. **Auto-Declaration Generator** — The discovery script can output ready-to-register JSON.
3. **Graceful Degradation** — Works without Docker by using cached + seeded data.
4. **Spatial-First** — 3D world tools were the first to be fully declared (proving the lingua works for new domains).

---

**Next Actions**
- Run discovery when Docker is available
- Register first real Docker/AVLI MCP server
- Add health check + validation per Law XIII proposal

This library is now the single place the gateway will eventually pull from.
# L7 MCP Tool Library

This directory is the **single source of truth** for all MCP servers and tools in the L7 ecosystem.

## Quick Start

```bash
# Run discovery (works even without Docker)
./discovery/mcp-discover.sh --all

# View current library
cat MCP_TOOL_LIBRARY.md

# See declared 3D Spatial tools
cat declarations/spatial-world-tools.json
```

## Current Status (2026-08-01)

- **Spatial World Tools**: Fully declared (6 tools)
- **Docker MCP**: Discovery script ready, awaiting daemon access
- **AVLI Cloud**: Placeholders created

## Ingenious Design Decisions

1. **Declaration-first** — Tools are declared before they are discovered.
2. **Graceful degradation** — Works offline and without Docker.
3. **Spatial as first citizen** — Proved the system works for new domains.
4. **Auto-generation ready** — Discovery script can later output ready-to-register JSON.

The goal: Every MCP server (Docker, AVLI, local, remote) eventually speaks the same L7 lingua and appears in one gateway.
"""
L7 Spatial Tool → Unreal MCP Translation Mappings
This is the single source of truth for how L7 tools map to Unreal MCP operations.
"""

SPATIAL_TOOL_MAPPINGS = {
    "world.create": {
        "primary_mcp_tool": "execute_pcg_graph",
        "fallback_mcp_tools": ["spawn_actors", "set_lighting"],
        "required_fields": ["description"],
        "optional_fields": ["style", "pcg_preset", "xr_ready", "seed"],
        "approval_required": False
    },
    "world.edit": {
        "primary_mcp_tool": "modify_actors",
        "fallback_mcp_tools": ["set_parameters", "apply_pcg_patch"],
        "required_fields": ["scene_id", "changes"],
        "approval_required": True   # medium risk
    },
    "world.simulate": {
        "primary_mcp_tool": "run_chaos_simulation",
        "required_fields": ["scene_id", "duration_seconds"],
        "approval_required": True,   # high risk if long
        "max_duration_without_approval": 60
    },
    "world.exportXR": {
        "primary_mcp_tool": "export_xr_package",
        "required_fields": ["scene_id", "platforms"],
        "approval_required": False
    },
    "scene.raycast": {
        "primary_mcp_tool": "raycast",
        "required_fields": ["scene_id", "origin", "direction"],
        "approval_required": False
    },
    "scene.validate": {
        "primary_mcp_tool": "validate_scene",
        "required_fields": ["scene_id"],
        "approval_required": False
    }
}

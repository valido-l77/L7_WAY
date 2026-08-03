#!/bin/bash
# L7 MCP Discovery Script
# Ingenious multi-mode discovery for Docker, AVLI Cloud, and local filesystem
# Usage: ./mcp-discover.sh [--docker] [--avli] [--local] [--all]

set -e

MODE=${1:-"--all"}
OUTPUT_FILE="../discovery/last-scan.json"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

echo "L7 MCP Discovery starting... Mode: $MODE"

# Initialize result structure
cat > "$OUTPUT_FILE" << EOF
{
  "scan_time": "$TIMESTAMP",
  "mode": "$MODE",
  "sources": [],
  "discovered_tools": [],
  "errors": []
}
EOF

# Mode: Docker
if [[ "$MODE" == "--docker" || "$MODE" == "--all" ]]; then
  echo "Scanning Docker..."
  if command -v docker &> /dev/null && docker info &> /dev/null; then
    docker ps --format '{{.Names}} {{.Image}} {{.Labels}}' | while read -r line; do
      if echo "$line" | grep -q "l7.mcp=true\|mcp"; then
        echo "  Found MCP container: $line"
        # TODO: Auto-generate declaration from labels
      fi
    done
  else
    echo "  Docker not accessible in this environment"
  fi
fi

# Mode: AVLI Cloud
if [[ "$MODE" == "--avli" || "$MODE" == "--all" ]]; then
  echo "Scanning AVLI Cloud endpoints..."
  # Placeholder for real endpoint scanning
  echo "  (Would query 18789 and other known AVLI services)"
fi

# Mode: Local Filesystem (always runs)
echo "Scanning local L7_WAY for existing declarations..."
find ../declarations -name "*.json" | while read -r file; do
  echo "  Found declaration: $file"
done

echo "Discovery complete. Results written to $OUTPUT_FILE"
echo "Next: Run 'l7 mcp register' on discovered items"
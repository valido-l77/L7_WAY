#!/usr/bin/env python3
"""
L7 Provenance Engine — Proof of Authorship

Every file gets a birth certificate. It never comes off.
The hash covers everything AFTER the provenance block.
The block is permanent. The chain is permanent.
Nothing is stripped. Nothing is removed. Ever.

"Such is righteous that we own the fruits of our labor,
 not stolen by thieves. Data is life." — The Philosopher
"""

import hashlib
import json
import os
import sys
from datetime import datetime, timezone

CREATOR = "Alberto Valido Delgado"
SYSTEM = "L7 WAY"
LICENSE = "Proprietary — Framework free, products licensed (Law XXII)"
L7_DIR = os.path.expanduser("~/L7_WAY")
REGISTRY_PATH = os.path.join(L7_DIR, ".provenance", "registry.json")

MARKER_START_HTML = "<!-- L7:PROVENANCE"
MARKER_START_JS = "// L7:PROVENANCE"


def body_of(content):
    """Get everything before the provenance seal. The seal is at the end."""
    for marker in [MARKER_START_HTML, MARKER_START_JS]:
        # Find the LAST occurrence (the seal at the bottom)
        idx = content.rfind(marker)
        if idx >= 0:
            # Strip trailing newline before the block
            body = content[:idx]
            if body.endswith('\n'):
                body = body[:-1]
            return body
    return content


def body_hash(filepath):
    """SHA-256 of everything after the provenance block."""
    with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
        content = f.read()
    return hashlib.sha256(body_of(content).encode()).hexdigest()


def chain_hash(previous_hash, current_hash):
    """Chain two hashes — each file proves the previous."""
    return hashlib.sha256(f"{previous_hash}:{current_hash}".encode()).hexdigest()


def load_registry():
    if os.path.exists(REGISTRY_PATH):
        with open(REGISTRY_PATH, 'r') as f:
            return json.load(f)
    return {"creator": CREATOR, "system": SYSTEM, "chain": [],
            "created": datetime.now(timezone.utc).isoformat()}


def save_registry(registry):
    os.makedirs(os.path.dirname(REGISTRY_PATH), exist_ok=True)
    with open(REGISTRY_PATH, 'w') as f:
        json.dump(registry, f, indent=2)


def sign_file(filepath):
    """Sign a file. Embeds provenance once. Updates hash on re-sign."""
    registry = load_registry()
    filename = os.path.relpath(filepath, L7_DIR)

    with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
        content = f.read()

    # Already has provenance? Update the hash in the registry, don't touch the file.
    if MARKER_START_HTML in content or MARKER_START_JS in content:
        b_hash = hashlib.sha256(body_of(content).encode()).hexdigest()
        prev = registry["chain"][-1]["chain_hash"] if registry["chain"] else hashlib.sha256(CREATOR.encode()).hexdigest()
        c_hash = chain_hash(prev, b_hash)
        existing = next((e for e in registry["chain"] if e["file"] == filename), None)
        if existing:
            existing["body_hash"] = b_hash
            existing["chain_hash"] = c_hash
            existing["updated"] = datetime.now(timezone.utc).isoformat()
            existing["version"] = existing.get("version", 0) + 1
        else:
            registry["chain"].append({
                "file": filename, "body_hash": b_hash, "chain_hash": c_hash,
                "created": datetime.now(timezone.utc).isoformat(), "version": 1,
                "creator": CREATOR
            })
        save_registry(registry)
        return {"file": filename, "hash": b_hash, "chain": c_hash, "action": "updated"}

    # First time — hash the content, then APPEND provenance at the end
    b_hash = hashlib.sha256(content.encode()).hexdigest()
    prev = registry["chain"][-1]["chain_hash"] if registry["chain"] else hashlib.sha256(CREATOR.encode()).hexdigest()
    c_hash = chain_hash(prev, b_hash)
    now = datetime.now(timezone.utc).isoformat()

    # Determine comment style
    is_html = filepath.endswith('.html')
    if is_html:
        provenance = f"""
<!-- L7:PROVENANCE
  Creator: {CREATOR} | System: {SYSTEM} | License: {LICENSE}
  File: {filename} | Body-Hash: SHA-256:{b_hash}
  Chain-Hash: SHA-256:{c_hash} | Signed: {now}
  This work is the intellectual property of {CREATOR}.
  Chain: {len(registry['chain']) + 1} works linked. Verify: python3 provenance.py verify {filename}
L7:PROVENANCE -->"""
    else:
        provenance = f"""
// L7:PROVENANCE
// Creator: {CREATOR} | System: {SYSTEM} | License: {LICENSE}
// File: {filename} | Body-Hash: SHA-256:{b_hash}
// Chain-Hash: SHA-256:{c_hash} | Signed: {now}
// This work is the intellectual property of {CREATOR}.
// Chain: {len(registry['chain']) + 1} works. Verify: python3 provenance.py verify {filename}
// L7:PROVENANCE"""

    # Append at the end — the seal on the back, not the face
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content + provenance)

    registry["chain"].append({
        "file": filename, "body_hash": b_hash, "chain_hash": c_hash,
        "created": now, "version": 1, "creator": CREATOR
    })
    save_registry(registry)
    return {"file": filename, "hash": b_hash, "chain": c_hash, "action": "signed"}


def verify_file(filepath):
    """Verify a file — check the body after the provenance block."""
    registry = load_registry()
    filename = os.path.relpath(filepath, L7_DIR)
    entry = next((e for e in registry["chain"] if e["file"] == filename), None)
    if not entry:
        return {"verified": False, "reason": "Not in provenance registry"}

    current = body_hash(filepath)
    if current == entry["body_hash"]:
        return {
            "verified": True, "creator": CREATOR, "file": filename,
            "signed": entry["created"], "version": entry.get("version", 1),
            "chain_position": registry["chain"].index(entry) + 1,
            "chain_length": len(registry["chain"])
        }
    return {
        "verified": False, "reason": "Body has been modified since signing",
        "expected": entry["body_hash"], "actual": current
    }


def sign_all():
    """Sign all HTML and JS files in L7 WAY."""
    signed = []
    for root, dirs, files in os.walk(L7_DIR):
        dirs[:] = [d for d in dirs if not d.startswith('.') and d != 'node_modules']
        for f in sorted(files):
            if f.endswith(('.html', '.js')) and not f.startswith('.'):
                result = sign_file(os.path.join(root, f))
                signed.append(result)
                print(f"  {result['action']}: {result['file']}")
    registry = load_registry()
    print(f"\n  Chain: {len(registry['chain'])} works linked")
    print(f"  Creator: {CREATOR}")
    return signed


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("L7 Provenance Engine")
        print("  sign <file>     Sign a single file")
        print("  sign-all        Sign all L7 files")
        print("  verify <file>   Verify a file")
        print("  status          Show registry")
        sys.exit(0)

    cmd = sys.argv[1]
    if cmd == 'sign' and len(sys.argv) > 2:
        print(json.dumps(sign_file(os.path.abspath(sys.argv[2])), indent=2))
    elif cmd == 'sign-all':
        sign_all()
    elif cmd == 'verify' and len(sys.argv) > 2:
        fp = os.path.join(L7_DIR, sys.argv[2]) if not os.path.isabs(sys.argv[2]) else sys.argv[2]
        print(json.dumps(verify_file(fp), indent=2))
    elif cmd == 'status':
        reg = load_registry()
        print(f"Creator: {reg['creator']}")
        print(f"Works: {len(reg['chain'])}")
        for e in reg['chain']:
            print(f"  {e['file']} [v{e.get('version',1)}] {e['created'][:10]}")

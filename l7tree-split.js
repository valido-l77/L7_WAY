#!/usr/bin/env node
/**
 * L7 TREE-SPLIT — Split the 566MB tree.json into hierarchical layers
 * Layer 0: Root + top-level directories (depth 0-1)
 * Layer N: Children of directories at depth N
 *
 * The Time Machine loads Layer 0 first, then fetches deeper layers on expand.
 * Each graph contains the previous ones — but you don't load them all at once.
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const INDEX_DIR = path.join(process.env.HOME, '.l7', 'scan', 'index');
const TREE_FILE = path.join(INDEX_DIR, 'tree.json');
const TM_DIR = path.join(__dirname, 'timemachine', 'index');

async function splitTree() {
  console.error('L7 TREE-SPLIT — Loading tree index...');

  // Stream-parse the tree.json (too large for JSON.parse)
  // Format: {"key":value,"key":value...}
  // We'll read it as a stream and parse each entry
  console.error('Parsing tree entries (streaming)...');
  const stream2 = fs.createReadStream(TREE_FILE, { encoding: 'utf8' });
  const rl2 = readline.createInterface({ input: stream2 });
  let entryCount = 0;

  // We wrote the tree as: {"dir1":{...}\n,"dir2":{...}\n...}
  // So each line (except first { and last }) is a single entry
  let depth0Dirs = new Set();
  let treeEntries = {};  // Only store top 3 levels to keep memory low

  for await (const line of rl2) {
    let l = line.trim();
    if (l === '{' || l === '}') continue;
    if (l.startsWith(',')) l = l.slice(1);
    if (l.endsWith(',')) l = l.slice(0, -1);

    // Find the key-value split (first ':' after the closing quote of the key)
    const keyEnd = l.indexOf('"', 1);
    if (keyEnd < 0) continue;
    const key = l.slice(1, keyEnd);
    const valStr = l.slice(keyEnd + 2);  // Skip ":

    try {
      const val = JSON.parse(valStr);
      const depth = key === '' ? 0 : key.split('/').length;

      // Always store depth 0-2 in the lightweight index
      if (depth <= 2) {
        treeEntries[key] = val;
      }

      // Track depth-0 directories for the root layer
      if (depth <= 1) depth0Dirs.add(key);

      entryCount++;
      if (entryCount % 100000 === 0) console.error(`  ...parsed ${entryCount} entries`);
    } catch (_) {}
  }

  console.error(`  Parsed ${entryCount} total entries, ${Object.keys(treeEntries).length} in top layers`);

  // Write lightweight tree (top 2-3 levels only)
  const lightTree = {};
  for (const dir in treeEntries) {
    const entry = treeEntries[dir];
    // For children deeper than depth 2, replace children list with count
    const depth = dir === '' ? 0 : dir.split('/').length;
    if (depth >= 2) {
      // Don't include children arrays for deep dirs — they'll be loaded on demand
      lightTree[dir] = {
        ...entry,
        ch: entry.ch ? entry.ch.slice(0, 3) : [],  // Show first 3 children as preview
        chCount: entry.ch ? entry.ch.length : 0,
        hasMore: entry.ch ? entry.ch.length > 3 : false,
      };
    } else {
      lightTree[dir] = entry;
    }
  }

  // Write the lightweight tree
  const lightPath = path.join(INDEX_DIR, 'tree-light.json');
  fs.writeFileSync(lightPath, JSON.stringify(lightTree));
  const lightStat = fs.statSync(lightPath);
  console.error(`  Light tree: ${(lightStat.size / (1024 * 1024)).toFixed(1)} MB (${Object.keys(lightTree).length} entries)`);

  // Write per-directory subtree files for on-demand loading
  // For each directory, write its children entries as a separate file
  console.error('Writing subtree chunks...');
  const stream3 = fs.createReadStream(TREE_FILE, { encoding: 'utf8' });
  const rl3 = readline.createInterface({ input: stream3 });

  // Group by parent directory — buffer entries by parent, flush periodically
  const parentBuffers = {};
  let subtreeCount = 0;
  let bufferedCount = 0;
  const FLUSH_SIZE = 20000;

  function flushParent(parent) {
    if (!parentBuffers[parent] || Object.keys(parentBuffers[parent]).length === 0) return;
    const hash = parent === '' ? '_root' :
      require('crypto').createHash('sha256').update(parent).digest('hex').slice(0, 16);
    const subtreePath = path.join(INDEX_DIR, `t_${hash}.json`);
    if (fs.existsSync(subtreePath)) {
      const existing = JSON.parse(fs.readFileSync(subtreePath, 'utf8'));
      Object.assign(existing, parentBuffers[parent]);
      fs.writeFileSync(subtreePath, JSON.stringify(existing));
    } else {
      fs.writeFileSync(subtreePath, JSON.stringify(parentBuffers[parent]));
      subtreeCount++;
    }
    delete parentBuffers[parent];
  }

  function flushAllParents() {
    for (const p in parentBuffers) flushParent(p);
    if (subtreeCount % 5000 === 0 && subtreeCount > 0) {
      console.error(`  ...wrote ${subtreeCount} subtree chunks`);
    }
  }

  for await (const line of rl3) {
    let l = line.trim();
    if (l === '{' || l === '}') continue;
    if (l.startsWith(',')) l = l.slice(1);
    if (l.endsWith(',')) l = l.slice(0, -1);

    const keyEnd = l.indexOf('"', 1);
    if (keyEnd < 0) continue;
    const key = l.slice(1, keyEnd);
    const valStr = l.slice(keyEnd + 2);

    try {
      const val = JSON.parse(valStr);
      const parent = val.p;
      if (parent === null || parent === undefined) continue;

      if (!parentBuffers[parent]) parentBuffers[parent] = {};
      parentBuffers[parent][key] = val;
      bufferedCount++;

      if (bufferedCount >= FLUSH_SIZE) {
        flushAllParents();
        bufferedCount = 0;
      }
    } catch (_) {}
  }
  flushAllParents();

  // Copy light tree to timemachine
  try {
    fs.mkdirSync(TM_DIR, { recursive: true });
    fs.copyFileSync(lightPath, path.join(TM_DIR, 'tree-light.json'));
    // Copy subtree chunks
    for (const f of fs.readdirSync(INDEX_DIR)) {
      if (f.startsWith('t_')) {
        fs.copyFileSync(path.join(INDEX_DIR, f), path.join(TM_DIR, f));
      }
    }
    console.error('Copied to timemachine directory');
  } catch (e) {
    console.error(`Warning: ${e.message}`);
  }

  console.error(`\n=== TREE SPLIT ===`);
  console.error(`Total entries:   ${entryCount}`);
  console.error(`Light tree:      ${(lightStat.size / (1024 * 1024)).toFixed(1)} MB`);
  console.error(`Subtree chunks:  ${subtreeCount}`);
}

splitTree().catch(e => { console.error(e); process.exit(1); });

// L7:PROVENANCE
// Creator: Alberto Valido Delgado | System: L7 WAY | License: Proprietary — Framework free, products licensed (Law XXII)
// File: l7tree-split.js | Body-Hash: SHA-256:1aae4cb20978f5dcdc95df1f100980028130988759d0f5f53cf0d3d0ef1b5f73
// Chain-Hash: SHA-256:b272ebba0f8b8e5840262f024defbd5925735aacf8cea3d0b59a390a27ec2f2c | Signed: 2026-03-01T15:09:50.005568+00:00
// This work is the intellectual property of Alberto Valido Delgado.
// Chain: 4 works. Verify: python3 provenance.py verify l7tree-split.js
// L7:PROVENANCE

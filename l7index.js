#!/usr/bin/env node
/**
 * L7 INDEX — Build directory index from scan manifest
 * Two-pass streaming: Pass 1 collects directory stats only (no file data in RAM).
 * Pass 2 writes per-directory chunk files by streaming again.
 *
 * "Each graph contains the previous ones."
 * "Start from the top, each line a command."
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const crypto = require('crypto');

const SCAN_DIR = path.join(process.env.HOME, '.l7', 'scan');
const MANIFEST = path.join(SCAN_DIR, 'manifest.json');
const INDEX_DIR = path.join(SCAN_DIR, 'index');
const TM_DIR = path.join(__dirname, 'timemachine');

function dirHash(dir) {
  return dir ? crypto.createHash('sha256').update(dir).digest('hex').slice(0, 16) : '_root';
}

function parseLine(line) {
  let trimmed = line.trim();
  if (trimmed === '[' || trimmed === ']' || trimmed === '' || trimmed === ',') return null;
  if (trimmed.endsWith(',')) trimmed = trimmed.slice(0, -1);
  if (trimmed.startsWith(',')) trimmed = trimmed.slice(1).trim();
  if (!trimmed.startsWith('{')) return null;
  try { return JSON.parse(trimmed); } catch (_) { return null; }
}

async function buildIndex() {
  console.error('L7 INDEX — Pass 1: Collecting directory stats (no file data in RAM)...');
  fs.mkdirSync(INDEX_DIR, { recursive: true });

  // ═══ PASS 1: Stats only — O(dirs) memory, not O(files) ═══
  const dirStats = {};  // dirPath → { count, size, mismatches, containers, databases, plists, dsStores }
  let totalFiles = 0, totalMismatched = 0, totalContainers = 0, totalDatabases = 0;

  const stream1 = fs.createReadStream(MANIFEST, { encoding: 'utf8' });
  const rl1 = readline.createInterface({ input: stream1 });

  for await (const line of rl1) {
    const node = parseLine(line);
    if (!node) continue;

    const dir = node.d || '';
    if (!dirStats[dir]) {
      dirStats[dir] = { count: 0, size: 0, mismatches: 0, containers: 0, databases: 0, plists: 0, dsStores: 0 };
    }

    const s = dirStats[dir];
    s.count++;
    s.size += node.s || 0;
    if (node.mm) s.mismatches++;
    if (node.c !== 'leaf') s.containers++;
    if (node.t === 'application/sqlite') s.databases++;
    if ((node.t || '').startsWith('application/bplist')) s.plists++;
    if (node.n === '.DS_Store') s.dsStores++;

    totalFiles++;
    if (node.mm) totalMismatched++;
    if (node.c !== 'leaf') totalContainers++;
    if (node.t === 'application/sqlite') totalDatabases++;

    if (totalFiles % 500000 === 0) console.error(`  Pass 1: ${totalFiles} files...`);
  }

  console.error(`  Pass 1 complete: ${totalFiles} files, ${Object.keys(dirStats).length} directories`);

  // ═══ BUILD TREE (stats only — lightweight) ═══
  console.error('Building directory tree...');
  const tree = {};
  for (const dir in dirStats) {
    const parts = dir ? dir.split('/') : [];
    let current = '';
    for (let i = 0; i < parts.length; i++) {
      const parent = current;
      current = current ? current + '/' + parts[i] : parts[i];
      if (!tree[current]) tree[current] = { name: parts[i], parent, children: [], stats: null };
      if (!tree[parent]) tree[parent] = { name: '', parent: null, children: [], stats: null };
      if (!tree[parent].children.includes(current)) tree[parent].children.push(current);
    }
  }
  if (!tree['']) tree[''] = { name: '/', parent: null, children: [], stats: null };

  for (const dir in dirStats) {
    if (tree[dir]) tree[dir].stats = dirStats[dir];
  }

  // Compute recursive totals
  function computeRecursive(dirPath) {
    const node = tree[dirPath];
    if (!node) return { count: 0, size: 0 };
    const local = node.stats || { count: 0, size: 0 };
    let tc = local.count, ts = local.size;
    for (const child of (node.children || [])) {
      const cs = computeRecursive(child);
      tc += cs.count; ts += cs.size;
    }
    node.totalCount = tc;
    node.totalSize = ts;
    return { count: tc, size: ts };
  }
  computeRecursive('');

  // Write tree index
  console.error('Writing tree index...');
  const treeIndex = {};
  for (const dir in tree) {
    const t = tree[dir];
    treeIndex[dir] = {
      n: t.name, p: t.parent, ch: t.children,
      fc: t.stats ? t.stats.count : 0,
      tc: t.totalCount || 0, ts: t.totalSize || 0,
      mm: t.stats ? t.stats.mismatches : 0,
      ct: t.stats ? t.stats.containers : 0,
      db: t.stats ? t.stats.databases : 0,
      pl: t.stats ? t.stats.plists : 0,
      ds: t.stats ? t.stats.dsStores : 0,
      chunk: `d_${dirHash(dir)}.json`,
    };
  }

  // Stream-write tree.json entry by entry (918K+ dirs too large for JSON.stringify)
  const treeWs = fs.createWriteStream(path.join(INDEX_DIR, 'tree.json'));
  treeWs.write('{');
  let firstEntry = true;
  for (const dir in treeIndex) {
    const key = JSON.stringify(dir);
    const val = JSON.stringify(treeIndex[dir]);
    if (!firstEntry) treeWs.write(',');
    else firstEntry = false;
    treeWs.write(`${key}:${val}\n`);
  }
  treeWs.write('}');
  treeWs.end();
  await new Promise(r => treeWs.on('finish', r));
  const treeStat = fs.statSync(path.join(INDEX_DIR, 'tree.json'));
  console.error(`  Tree index: ${(treeStat.size / (1024 * 1024)).toFixed(1)} MB`);

  // ═══ PASS 2: Write chunk files (stream, never hold all files in RAM) ═══
  console.error('Pass 2: Writing per-directory chunk files...');

  // We'll batch: accumulate files by directory, flush when directory changes
  // Since manifest is grouped by walk order, files in same dir tend to be adjacent
  const chunkBuffers = {};  // dir → [nodes]  (only current batch)
  let chunkCount = 0;
  let filesWritten = 0;
  const FLUSH_THRESHOLD = 50000;  // Flush all buffers if total exceeds this

  function flushDir(dir) {
    if (!chunkBuffers[dir] || chunkBuffers[dir].length === 0) return;
    const hash = dirHash(dir);
    const chunkPath = path.join(INDEX_DIR, `d_${hash}.json`);
    // Append to existing chunk if it exists
    if (fs.existsSync(chunkPath)) {
      const existing = JSON.parse(fs.readFileSync(chunkPath, 'utf8'));
      existing.push(...chunkBuffers[dir]);
      fs.writeFileSync(chunkPath, JSON.stringify(existing));
    } else {
      fs.writeFileSync(chunkPath, JSON.stringify(chunkBuffers[dir]));
    }
    filesWritten += chunkBuffers[dir].length;
    delete chunkBuffers[dir];
    chunkCount++;
  }

  function flushAll() {
    for (const dir in chunkBuffers) flushDir(dir);
    if (chunkCount % 5000 === 0 && chunkCount > 0) {
      console.error(`  Pass 2: ${chunkCount} chunks, ${filesWritten} files written...`);
    }
  }

  const stream2 = fs.createReadStream(MANIFEST, { encoding: 'utf8' });
  const rl2 = readline.createInterface({ input: stream2 });
  let bufferedTotal = 0;

  for await (const line of rl2) {
    const node = parseLine(line);
    if (!node) continue;

    const dir = node.d || '';
    if (!chunkBuffers[dir]) chunkBuffers[dir] = [];
    chunkBuffers[dir].push(node);
    bufferedTotal++;

    // Flush when buffer gets large
    if (bufferedTotal >= FLUSH_THRESHOLD) {
      flushAll();
      bufferedTotal = 0;
    }
  }
  flushAll();  // Flush remaining

  // Write summary
  const summary = {
    totalFiles,
    totalDirs: Object.keys(tree).length,
    totalMismatched,
    totalContainers,
    totalDatabases,
    scannedAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(INDEX_DIR, 'summary.json'), JSON.stringify(summary, null, 2));

  // Copy tree.json and summary.json to timemachine directory
  try {
    const tmIndexDir = path.join(TM_DIR, 'index');
    fs.mkdirSync(tmIndexDir, { recursive: true });
    fs.copyFileSync(path.join(INDEX_DIR, 'tree.json'), path.join(tmIndexDir, 'tree.json'));
    fs.copyFileSync(path.join(INDEX_DIR, 'summary.json'), path.join(tmIndexDir, 'summary.json'));
    // Copy chunk files
    for (const f of fs.readdirSync(INDEX_DIR)) {
      if (f.startsWith('d_')) {
        fs.copyFileSync(path.join(INDEX_DIR, f), path.join(tmIndexDir, f));
      }
    }
    console.error(`Copied index to timemachine directory`);
  } catch (e) {
    console.error(`Warning: could not copy to timemachine: ${e.message}`);
  }

  console.error(`\n=== INDEX BUILT ===`);
  console.error(`Total files:    ${totalFiles}`);
  console.error(`Total dirs:     ${Object.keys(tree).length}`);
  console.error(`Tree index:     ${(treeStat.size / (1024 * 1024)).toFixed(1)} MB`);
  console.error(`Dir chunks:     ${chunkCount} files`);
  console.error(`Files written:  ${filesWritten}`);
  console.error(`Output:         ${INDEX_DIR}`);
}

buildIndex().catch(e => { console.error(e); process.exit(1); });

// L7:PROVENANCE
// Creator: Alberto Valido Delgado | System: L7 WAY | License: Proprietary — Framework free, products licensed (Law XXII)
// File: l7index.js | Body-Hash: SHA-256:c5fb18572219f11f1af942da1006faa8dff0876780acb66b5d6f6559557e5ac3
// Chain-Hash: SHA-256:51c3abf97977ed975d993c89a77072503c489f2be839f704475d2d4865d560ca | Signed: 2026-03-01T15:09:50.004535+00:00
// This work is the intellectual property of Alberto Valido Delgado.
// Chain: 2 works. Verify: python3 provenance.py verify l7index.js
// L7:PROVENANCE

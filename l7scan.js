#!/usr/bin/env node
/**
 * L7 SCAN — Filesystem Archaeology Scanner
 * Maps every file to metadata + 12D coordinate. Never reads full content.
 * Each node can contain another tree. The backward function reverses the map.
 *
 * Forward:  file → { path, metadata, 12D coordinate }  (scan)
 * Backward: metadata → original content                  (decode on demand)
 *
 * "What has been is never lost. What will be is already forming."
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Safely single-quote a value for interpolation into a shell command string.
// Many commands below rely on shell pipes/redirects/fallbacks, so they can't
// simply switch to execFileSync — this neutralizes shell metacharacters instead.
function shQuote(str) {
  return `'${String(str).replace(/'/g, `'\\''`)}'`;
}

const L7_DIR = path.join(process.env.HOME, '.l7');
const SCAN_DIR = path.join(L7_DIR, 'scan');
const MANIFEST = path.join(SCAN_DIR, 'manifest.json');

// ─── Magic byte signatures (4 bytes = 8 hex chars) ─────────────────
const MAGIC = {
  '89504e47': 'image/png',
  'ffd8ffe0': 'image/jpeg',
  'ffd8ffe1': 'image/jpeg-exif',
  'ffd8ffe2': 'image/jpeg',
  'ffd8ffdb': 'image/jpeg',
  'ffd8ffee': 'image/jpeg',
  '47494638': 'image/gif',
  '25504446': 'application/pdf',
  '504b0304': 'application/zip',
  '504b0506': 'application/zip-empty',
  '504b0708': 'application/zip-spanned',
  '1f8b0800': 'application/gzip',
  '1f8b0808': 'application/gzip',
  '1f8b0000': 'application/gzip',
  '53514c69': 'application/sqlite',
  '62706c69': 'application/bplist',
  '3c3f786d': 'text/xml',
  '3c68746d': 'text/html',
  '3c48544d': 'text/html',
  '3c21444f': 'text/html-doctype',
  '3c21646f': 'text/html-doctype',
  '7b0a2020': 'application/json',
  '7b227631': 'application/json',
  '7b226e61': 'application/json',
  '5b0a2020': 'application/json-array',
  '2d2d2d0a': 'text/yaml',
  '23212f62': 'application/script',
  '23212f75': 'application/script',
  'cffaedfe': 'application/macho',
  'feedface': 'application/macho-32',
  'cafebabe': 'application/macho-fat',
  '7f454c46': 'application/elf',
  '52494646': 'application/riff',
  '00000020': 'video/mp4',
  '00000018': 'video/mp4',
  '0000001c': 'video/mp4',
  '66747970': 'video/mp4-ftyp',
  '49443303': 'audio/mp3-id3',
  'fffb9064': 'audio/mp3',
  'fff3e064': 'audio/mp3',
  '4f676753': 'audio/ogg',
  '664c6143': 'audio/flac',
  '00010000': 'font/ttf',
  '4f54544f': 'font/otf',
  '774f4632': 'font/woff2',
  '774f4646': 'font/woff',
  '52617221': 'application/rar',
  'fd377a58': 'application/xz',
  '425a6836': 'application/bzip2',
  '00000100': 'image/ico',
  '4d5a9000': 'application/exe',
  '7573746172': 'application/tar',
  '255044462d': 'application/pdf',
  '4c374f4c4430': 'application/l7fold',
  '61637370': 'application/icc',
  '6c696e6b': 'application/icc',
};

// 2-byte prefix signatures (less specific, checked after 4-byte)
const MAGIC_2BYTE = {
  'ffd8': 'image/jpeg',
  '1f8b': 'application/gzip',
  '4d5a': 'application/exe',
  '504b': 'application/zip',
};

// ─── Detect true file type from magic bytes ─────────────────────────
function detectType(filePath) {
  let fd;
  try {
    const stat = fs.statSync(filePath);
    if (stat.size === 0) return 'empty';
    fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(32);
    fs.readSync(fd, buf, 0, Math.min(32, stat.size), 0);
    fs.closeSync(fd);
    fd = null;

    const hex = buf.toString('hex');
    const sig4 = hex.slice(0, 8);
    const sig2 = hex.slice(0, 4);

    // Check 4-byte signatures first
    if (MAGIC[sig4]) return MAGIC[sig4];

    // Check for bplist anywhere in first 32 bytes
    if (hex.includes('62706c6973743030')) return 'application/bplist';  // bplist00

    // Check 2-byte signatures
    if (MAGIC_2BYTE[sig2]) return MAGIC_2BYTE[sig2];

    // Check for base64 pattern
    const first64 = buf.toString('ascii', 0, Math.min(64, buf.length)).replace(/[\n\r\t ]/g, '');
    if (/^[A-Za-z0-9+/]{40,}={0,2}$/.test(first64)) return 'encoding/base64';

    // Check for text content
    let isText = true;
    for (let i = 0; i < Math.min(512, buf.length); i++) {
      const b = buf[i];
      if (b === 0) { isText = false; break; }
    }

    if (isText) {
      const head = buf.toString('utf8', 0, Math.min(buf.length, 32));
      if (head.startsWith('bplist00')) return 'application/bplist-in-text';
      if (head.startsWith('{')) return 'application/json';
      if (head.startsWith('[')) return 'application/json-array';
      if (head.startsWith('#!')) return 'application/script';
      if (head.startsWith('<?xml')) return 'text/xml';
      if (head.startsWith('<!DOCTYPE') || head.startsWith('<!doctype')) return 'text/html-doctype';
      if (/^\n*<html/i.test(head)) return 'text/html';
      if (head.startsWith('---')) return 'text/yaml';
      if (head.startsWith('name:') || head.startsWith('version:')) return 'text/yaml';
      return 'text/plain';
    }

    return 'application/octet-stream';
  } catch (e) {
    if (fd) try { fs.closeSync(fd); } catch (_) {}
    return 'inaccessible';
  }
}

// ─── Is the file a container? ───────────────────────────────────────
function isContainer(type) {
  if (/^application\/(zip|gzip|bzip2|xz|rar|tar)/.test(type)) return 'archive';
  if (type === 'application/sqlite') return 'database';
  if (/^application\/bplist/.test(type)) return 'plist';
  if (/^application\/json/.test(type)) return 'json';
  if (/^font\//.test(type)) return 'font';
  if (/^application\/macho/.test(type)) return 'binary';
  if (type === 'application/dmg') return 'disk-image';
  if (type === 'application/icc') return 'color-profile';
  if (type === 'application/l7fold') return 'l7fold';
  return 'leaf';
}

// ─── Check type mismatch ────────────────────────────────────────────
function isMismatch(ext, type) {
  const textExts = new Set(['txt', 'md', 'log', 'csv', 'rtf', 'cfg', 'conf', 'ini']);
  const imgExts = new Set(['jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff', 'webp', 'heic']);

  if (textExts.has(ext)) {
    if (/^(application\/bplist|image\/|application\/zip|application\/sqlite|application\/macho|encoding\/base64)/.test(type)) return true;
  }
  if (imgExts.has(ext)) {
    if (/^(text\/|application\/json|encoding\/base64)/.test(type)) return true;
  }
  if (ext === 'pdf' && type !== 'application/pdf' && type !== 'text/plain' && type !== 'empty') return true;
  if (ext === 'js' && /^application\/(bplist|sqlite|macho|zip)/.test(type)) return true;
  return false;
}

// ─── Compute 12D coordinate ─────────────────────────────────────────
// Dimensions: Sun(cap) Moon(data) Mercury(pres) Venus(persist) Mars(sec)
//             Jupiter(detail) Saturn(out) Uranus(intent) Neptune(consc)
//             Pluto(trans) NNode(dir) SNode(mem)
function computeCoordinate(type, size, ext, container, mismatch, hidden) {
  // D0: Sun (capability)
  let d0 = 5;
  if (/script/.test(type)) d0 = 9;
  else if (/macho/.test(type)) d0 = 10;
  else if (type === 'application/sqlite') d0 = 8;
  else if (/html/.test(type)) d0 = 7;
  else if (/json/.test(type)) d0 = 6;
  else if (/image\//.test(type)) d0 = 4;
  else if (/audio\//.test(type)) d0 = 4;
  else if (/video\//.test(type)) d0 = 4;
  else if (/font\//.test(type)) d0 = 3;
  else if (/encoding\//.test(type)) d0 = 7;

  // D1: Moon (data density)
  let d1 = size > 1e6 ? 9 : size > 1e5 ? 7 : size > 1e4 ? 5 : size > 1e3 ? 3 : 1;

  // D2: Mercury (presentation)
  let d2 = 2;
  if (/^(html|htm)$/.test(ext)) d2 = 9;
  else if (ext === 'pdf') d2 = 8;
  else if (/^(md|markdown)$/.test(ext)) d2 = 7;
  else if (/^(png|jpg|jpeg|gif|heic|svg)$/.test(ext)) d2 = 8;
  else if (/^(txt|log)$/.test(ext)) d2 = 3;
  else if (/^(json|yaml|yml)$/.test(ext)) d2 = 4;

  // D3: Venus (persistence)
  let d3 = container === 'archive' ? 8 : container === 'database' ? 9 : 5;

  // D4: Mars (security)
  let d4 = 3;
  if (hidden) d4 += 3;
  if (mismatch) d4 += 2;
  if (/bplist/.test(type)) d4 += 2;
  if (/base64/.test(type)) d4 += 3;
  if (/crypt/.test(type)) d4 = 10;
  d4 = Math.min(d4, 10);

  // D5: Jupiter (detail)
  let d5 = 5;
  if (type === 'application/sqlite') d5 = 9;
  else if (/json/.test(type)) d5 = 8;
  else if (type === 'text/xml') d5 = 7;
  else if (/bplist/.test(type)) d5 = 8;

  // D6: Saturn (output form)
  let d6 = 5;
  if (/image\//.test(type)) d6 = 8;
  else if (/audio\//.test(type)) d6 = 7;
  else if (/video\//.test(type)) d6 = 9;
  else if (/text\//.test(type)) d6 = 4;
  else if (type === 'application/pdf') d6 = 8;

  // D7: Uranus (intention)
  let d7 = 5;
  if (mismatch) d7 = 8;
  else if (container === 'archive') d7 = 7;

  // D8: Neptune (consciousness)
  let d8 = 3;
  if (/script/.test(type)) d8 = 8;
  else if (/macho/.test(type)) d8 = 7;
  else if (type === 'application/sqlite') d8 = 6;

  // D9: Pluto (transformation)
  let d9 = 3;
  if (container !== 'leaf') d9 = 7;
  if (mismatch) d9 = 8;

  // D10: North Node (direction)
  let d10 = 5;

  // D11: South Node (memory)
  let d11 = hidden ? 8 : 5;

  return [d0, d1, d2, d3, d4, d5, d6, d7, d8, d9, d10, d11];
}

// ─── WALK: Recursive directory traversal ────────────────────────────
function walk(rootPath, maxDepth, callback, excludePaths = []) {
  const visited = new Set();
  let count = 0;

  function recurse(dirPath, depth) {
    if (depth > maxDepth) return;

    // Resolve symlinks to avoid cycles
    let realDir;
    try { realDir = fs.realpathSync(dirPath); } catch (_) { return; }
    if (visited.has(realDir)) return;
    visited.add(realDir);

    // Check exclusions
    for (const ex of excludePaths) {
      if (realDir === ex || realDir.startsWith(ex + '/')) return;
    }

    let entries;
    try { entries = fs.readdirSync(dirPath, { withFileTypes: true }); } catch (_) { return; }

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      // Skip .git internals and node_modules (but include .DS_Store, .gitignore, etc.)
      if (entry.name === '.git' && entry.isDirectory()) continue;
      if (entry.name === 'node_modules' && entry.isDirectory()) continue;
      if (entry.name === '.Trash' && entry.isDirectory()) continue;

      if (entry.isFile() || entry.isSymbolicLink()) {
        try {
          const stat = fs.statSync(fullPath);
          if (stat.isFile()) {
            callback(fullPath, stat);
            count++;
            if (count % 1000 === 0) {
              process.stderr.write(`  ...scanned ${count} files\n`);
            }
          }
        } catch (_) {}
      } else if (entry.isDirectory()) {
        recurse(fullPath, depth + 1);
      }
    }
  }

  recurse(rootPath, 0);
  return count;
}

// ─── SCAN: Main scan function ───────────────────────────────────────
async function scan(rootPath, maxDepth, options = {}) {
  const { append = false, exclude = [] } = options;
  console.error('L7 SCAN — Mapping the territory...');
  console.error(`Root: ${rootPath}`);
  console.error(`Max depth: ${maxDepth}`);
  if (exclude.length) console.error(`Excluding: ${exclude.join(', ')}`);
  if (append) console.error(`Mode: APPEND to existing manifest`);
  console.error('');

  fs.mkdirSync(SCAN_DIR, { recursive: true });

  const rootNorm = rootPath.endsWith('/') ? rootPath : rootPath + '/';

  // Resolve exclusions to real paths for comparison
  const excludeResolved = exclude.map(e => {
    try { return fs.realpathSync(e); } catch (_) { return e; }
  });

  // Stream-write JSON to avoid memory limits (1M+ files)
  let ws, first;
  if (append && fs.existsSync(MANIFEST)) {
    // Remove trailing ']' and append
    const stat = fs.statSync(MANIFEST);
    fs.truncateSync(MANIFEST, stat.size - 2);  // Remove '\n]'
    ws = fs.createWriteStream(MANIFEST, { flags: 'a' });
    first = false;  // Already has entries
  } else {
    ws = fs.createWriteStream(MANIFEST);
    ws.write('[\n');
    first = true;
  }

  // Summary counters
  const types = {};
  let mismatches = 0, containers = 0, databases = 0, plists = 0, encoded = 0, dsStores = 0;

  const count = walk(rootPath, maxDepth, (filePath, stat) => {
    const fname = path.basename(filePath);
    let ext = path.extname(fname).slice(1).toLowerCase();
    if (ext === fname.toLowerCase()) ext = '';

    const hidden = fname.startsWith('.');
    const type = detectType(filePath);
    const container = isContainer(type);
    const mismatch = isMismatch(ext, type);
    const coord = computeCoordinate(type, stat.size, ext, container, mismatch, hidden);

    // Use absolute path as the relative path for root scans
    let rel = filePath.startsWith(rootNorm) ? filePath.slice(rootNorm.length) : filePath;
    let parent = path.dirname(rel);
    if (parent === '.') parent = '';

    // Compact JSON — no pretty printing to save space
    const node = JSON.stringify({
      p: filePath, r: rel, n: fname, d: parent, x: ext,
      s: stat.size, m: stat.mtime.toISOString().slice(0, 19),
      h: hidden ? 1 : 0, t: type, c: container,
      mm: mismatch ? 1 : 0, co: coord
    });

    if (!first) ws.write(',\n');
    else first = false;
    ws.write(node);

    // Update counters
    const cls = type.split('/')[0];
    types[cls] = (types[cls] || 0) + 1;
    if (mismatch) mismatches++;
    if (container !== 'leaf') containers++;
    if (type === 'application/sqlite') databases++;
    if (type.startsWith('application/bplist')) plists++;
    if (type.startsWith('encoding/')) encoded++;
    if (fname === '.DS_Store') dsStores++;
  });

  ws.write('\n]');
  ws.end();

  // Wait for write to finish
  await new Promise(resolve => ws.on('finish', resolve));

  // Copy to timemachine directory
  const tmDir = path.join(path.dirname(process.argv[1] || __filename), 'timemachine');
  try {
    fs.mkdirSync(tmDir, { recursive: true });
    fs.copyFileSync(MANIFEST, path.join(tmDir, 'manifest.json'));
  } catch (_) {}

  console.error('');
  console.error(`Scan complete: ${count} files mapped`);
  console.error(`Manifest: ${MANIFEST}`);

  console.error(`\n=== SUMMARY ===`);
  console.error(`Total files:  ${count}`);
  console.error(`Mismatched:   ${mismatches}`);
  console.error(`Containers:   ${containers}`);
  console.error(`SQLite DBs:   ${databases}`);
  console.error(`Binary plists: ${plists}`);
  console.error(`Encoded:      ${encoded}`);
  console.error(`.DS_Store:    ${dsStores}`);
  console.error(`\nType breakdown:`);
  for (const [k, v] of Object.entries(types).sort((a, b) => b[1] - a[1])) {
    console.error(`  ${k}: ${v}`);
  }
  const manifestStat = fs.statSync(MANIFEST);
  console.error(`\nManifest size: ${(manifestStat.size / (1024 * 1024)).toFixed(1)} MB`);
}

// ─── BACKWARD: metadata → original (decode on demand) ───────────────
function backward(filePath) {
  const type = detectType(filePath);
  const stat = fs.statSync(filePath);
  console.log(`\u250C\u2500 BACKWARD: ${filePath}`);
  console.log(`\u2502  True type: ${type}`);
  console.log(`\u2502  Size: ${stat.size} bytes`);
  console.log(`\u2502  Extension: ${path.extname(filePath)}`);

  switch (type) {
    case 'encoding/base64':
      console.log('\u2502  Decoding base64...');
      console.log('\u2514\u2500');
      try { process.stdout.write(execSync(`base64 -D < ${shQuote(filePath)}`)); } catch(_) {}
      break;
    case 'application/bplist':
    case 'application/bplist-in-text':
      console.log('\u2502  Converting binary plist to XML...');
      console.log('\u2514\u2500');
      try { process.stdout.write(execSync(`plutil -convert xml1 -o - ${shQuote(filePath)}`)); }
      catch(_) { try { process.stdout.write(execSync(`xxd ${shQuote(filePath)} | head -40`)); } catch(_) {} }
      break;
    case 'application/sqlite':
      console.log('\u2502  Listing SQLite tables + schema...');
      console.log('\u2514\u2500');
      try { process.stdout.write(execSync(`sqlite3 ${shQuote(filePath)} ".tables" 2>/dev/null`)); }
      catch(_) {}
      try { process.stdout.write(execSync(`sqlite3 ${shQuote(filePath)} ".schema" 2>/dev/null | head -60`)); }
      catch(_) {}
      break;
    case 'application/gzip':
      console.log('\u2502  Listing gzip/tar contents...');
      console.log('\u2514\u2500');
      try { process.stdout.write(execSync(`gzip -dc ${shQuote(filePath)} 2>/dev/null | tar tf - 2>/dev/null || gzip -dc ${shQuote(filePath)} 2>/dev/null | head -c 4096`)); }
      catch(_) {}
      break;
    case 'application/zip':
    case 'application/zip-empty':
    case 'application/zip-spanned':
      console.log('\u2502  Listing zip contents (not extracting)...');
      console.log('\u2514\u2500');
      try { process.stdout.write(execSync(`unzip -l ${shQuote(filePath)} 2>/dev/null`)); } catch(_) {}
      break;
    default:
      if (/^image\//.test(type)) {
        console.log('\u2502  Image metadata (no pixel decode)...');
        console.log('\u2514\u2500');
        try { process.stdout.write(execSync(`file ${shQuote(filePath)}`)); } catch(_) {}
        try { process.stdout.write(execSync(`mdls -name kMDItemContentType -name kMDItemPixelHeight -name kMDItemPixelWidth -name kMDItemColorSpace ${shQuote(filePath)} 2>/dev/null`)); } catch(_) {}
        // Check trailing strings
        try {
          const trail = execSync(`tail -c 256 ${shQuote(filePath)} 2>/dev/null | strings 2>/dev/null`).toString().trim();
          if (trail) console.log(`Trailing strings:\n${trail}`);
        } catch(_) {}
      } else if (/^font\//.test(type)) {
        console.log('\u2502  Font metadata...');
        console.log('\u2514\u2500');
        try { process.stdout.write(execSync(`strings ${shQuote(filePath)} | grep -iE "name|family|regular|bold|version|copyright" | head -15`)); } catch(_) {}
      } else if (/macho/.test(type)) {
        console.log('\u2502  Mach-O header + dependency tree...');
        console.log('\u2514\u2500');
        try { process.stdout.write(execSync(`file ${shQuote(filePath)}`)); } catch(_) {}
        console.log('\n=== Shared Library Dependencies (otool -L) ===');
        try { process.stdout.write(execSync(`otool -L ${shQuote(filePath)} 2>/dev/null`)); } catch(_) {}
        console.log('\n=== Rpaths (otool -l | grep -A2 LC_RPATH) ===');
        try { process.stdout.write(execSync(`otool -l ${shQuote(filePath)} 2>/dev/null | grep -A2 LC_RPATH`)); } catch(_) {}
        console.log('\n=== Load Commands Summary ===');
        try { process.stdout.write(execSync(`otool -l ${shQuote(filePath)} 2>/dev/null | grep -E "cmd |name |path " | head -40`)); } catch(_) {}
      } else if (/^application\/icc/.test(type) || /\.icc$/.test(filePath)) {
        console.log('\u2502  ICC Color Profile...');
        console.log('\u2514\u2500');
        try { process.stdout.write(execSync(`file ${shQuote(filePath)}`)); } catch(_) {}
        try { process.stdout.write(execSync(`strings ${shQuote(filePath)} | grep -iE "desc|copy|dmnd|dmdd|wtpt|bkpt|rXYZ|gXYZ|bXYZ|chad|sRGB|Display|Adobe|color" | head -20`)); } catch(_) {}
      } else if (/\.dictionary$/.test(filePath) || /linguistic/i.test(filePath)) {
        console.log('\u2502  Linguistic/Dictionary data...');
        console.log('\u2514\u2500');
        try { process.stdout.write(execSync(`file ${shQuote(filePath)}`)); } catch(_) {}
        try { process.stdout.write(execSync(`ls -la ${shQuote(filePath)} 2>/dev/null`)); } catch(_) {}
        try { process.stdout.write(execSync(`strings ${shQuote(filePath)} | head -20`)); } catch(_) {}
      } else {
        console.log('\u2502  First 512 bytes...');
        console.log('\u2514\u2500');
        const buf = Buffer.alloc(512);
        const fd = fs.openSync(filePath, 'r');
        fs.readSync(fd, buf, 0, 512, 0);
        fs.closeSync(fd);
        process.stdout.write(buf);
        console.log('');
      }
  }
}

// ─── HEADER: Show raw magic bytes ───────────────────────────────────
function showHeader(filePath) {
  const type = detectType(filePath);
  const stat = fs.statSync(filePath);
  console.log(`\u250C\u2500 HEADER: ${filePath}`);
  console.log(`\u2502  Extension: ${path.extname(filePath)}`);
  console.log(`\u2502  True type: ${type}`);
  console.log(`\u2502  Size: ${stat.size} bytes`);
  console.log(`\u2502  Modified: ${stat.mtime.toISOString()}`);
  console.log('\u2502');
  console.log('\u2502  First 64 bytes (hex):');
  try { const out = execSync(`xxd -l 64 ${shQuote(filePath)} 2>/dev/null`).toString(); out.split('\n').forEach(l => console.log(`\u2502  ${l}`)); } catch(_) {}
  console.log('\u2502');
  console.log('\u2502  Extended attributes:');
  try { const out = execSync(`xattr -l ${shQuote(filePath)} 2>/dev/null`).toString().trim(); if (out) out.split('\n').forEach(l => console.log(`\u2502  ${l}`)); else console.log('\u2502  (none)'); } catch(_) { console.log('\u2502  (none)'); }
  console.log('\u2514\u2500');
}

// ─── DRILL: Descend into a container ────────────────────────────────
function drill(filePath) {
  const type = detectType(filePath);
  const container = isContainer(type);
  console.log(`\u250C\u2500 DRILL: ${filePath}`);
  console.log(`\u2502  True type: ${type}`);
  console.log(`\u2502  Container: ${container}`);
  console.log('\u2514\u2500');

  switch (container) {
    case 'archive':
      if (/zip/.test(type)) try { process.stdout.write(execSync(`unzip -l ${shQuote(filePath)} 2>/dev/null`)); } catch(_) {}
      else if (/gzip/.test(type)) try { process.stdout.write(execSync(`gzip -dc ${shQuote(filePath)} 2>/dev/null | tar tf - 2>/dev/null || echo "(not tar inside gzip)"`)); } catch(_) {}
      else if (/bzip2/.test(type)) try { process.stdout.write(execSync(`bzip2 -dc ${shQuote(filePath)} 2>/dev/null | tar tf - 2>/dev/null || echo "(not tar inside bzip2)"`)); } catch(_) {}
      else if (/xz/.test(type)) try { process.stdout.write(execSync(`xz -dc ${shQuote(filePath)} 2>/dev/null | tar tf - 2>/dev/null || echo "(not tar inside xz)"`)); } catch(_) {}
      break;
    case 'database':
      console.log('=== Tables ===');
      try { process.stdout.write(execSync(`sqlite3 ${shQuote(filePath)} ".tables" 2>/dev/null`)); } catch(_) {}
      console.log('\n=== Row Counts ===');
      try {
        const tables = execSync(`sqlite3 ${shQuote(filePath)} ".tables" 2>/dev/null`).toString().trim().split(/\s+/);
        for (const t of tables) {
          if (!t) continue;
          try {
            const sql = `SELECT COUNT(*) FROM "${t.replace(/"/g, '""')}";`;
            const c = execSync(`sqlite3 ${shQuote(filePath)} ${shQuote(sql)} 2>/dev/null`).toString().trim();
            console.log(`  ${t}: ${c} rows`);
          } catch(_) {}
        }
      } catch(_) {}
      break;
    case 'plist':
      try { process.stdout.write(execSync(`plutil -convert xml1 -o - ${shQuote(filePath)} 2>/dev/null`)); } catch(_) { console.log('(cannot convert plist)'); }
      break;
    case 'json':
      try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (Array.isArray(data)) console.log(`Array[${data.length}]`);
        else for (const [k, v] of Object.entries(data)) {
          const t = Array.isArray(v) ? `Array[${v.length}]` : typeof v;
          console.log(`  ${k}: ${t}`);
        }
      } catch(_) { console.log('(cannot parse JSON)'); }
      break;
    case 'font':
      console.log('Font metadata:');
      try { process.stdout.write(execSync(`strings ${shQuote(filePath)} | grep -iE "name|family|regular|bold|italic|version|copyright" | head -15`)); } catch(_) {}
      break;
    case 'binary':
      console.log('=== Mach-O Dependency Tree ===');
      try { process.stdout.write(execSync(`otool -L ${shQuote(filePath)} 2>/dev/null`)); } catch(_) {}
      console.log('\n=== Rpaths ===');
      try { process.stdout.write(execSync(`otool -l ${shQuote(filePath)} 2>/dev/null | grep -A2 LC_RPATH`)); } catch(_) {}
      console.log('\n=== Code Signature ===');
      try { process.stdout.write(execSync(`codesign -dvv ${shQuote(filePath)} 2>&1 | head -15`)); } catch(_) {}
      break;
    default:
      // Check if it's an ICC color profile
      if (/\.icc$/i.test(filePath)) {
        console.log('ICC Color Profile:');
        try { process.stdout.write(execSync(`file ${shQuote(filePath)}`)); } catch(_) {}
        try { process.stdout.write(execSync(`strings ${shQuote(filePath)} | head -15`)); } catch(_) {}
      } else {
        console.log('Not a recognized container.');
      }
  }
}

// ─── MAIN ───────────────────────────────────────────────────────────
const args = process.argv.slice(2);

if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  console.log('L7 SCAN \u2014 Filesystem Archaeology Scanner');
  console.log('');
  console.log('  l7scan <root_path> [max_depth]   Scan filesystem, generate manifest');
  console.log('  l7scan --backward <path>          Decode/open a file on demand');
  console.log('  l7scan --drill <path>             Descend into container');
  console.log('  l7scan --header <path>            Show raw magic bytes + true type');
  console.log('');
  console.log('Forward:  file \u2192 12D coordinate (metadata only, never reads content)');
  console.log('Backward: coordinate \u2192 original (decode on demand)');
  console.log('Each node may contain another tree. Drill to descend.');
  process.exit(0);
}

switch (args[0]) {
  case '--backward':
    if (!args[1]) { console.error('Usage: l7scan --backward <path>'); process.exit(1); }
    backward(args[1]);
    break;
  case '--drill':
    if (!args[1]) { console.error('Usage: l7scan --drill <path>'); process.exit(1); }
    drill(args[1]);
    break;
  case '--header':
    if (!args[1]) { console.error('Usage: l7scan --header <path>'); process.exit(1); }
    showHeader(args[1]);
    break;
  default: {
    // Parse flags
    const scanArgs = [];
    let append = false;
    const exclude = [];
    for (const a of args) {
      if (a === '--append') append = true;
      else if (a.startsWith('--exclude=')) exclude.push(a.split('=')[1]);
      else scanArgs.push(a);
    }
    const rootDir = path.resolve(scanArgs[0] || process.env.HOME);
    const depth = parseInt(scanArgs[1]) || 30;
    scan(rootDir, depth, { append, exclude }).catch(e => { console.error(e); process.exit(1); });
  }
}

// L7:PROVENANCE
// Creator: Alberto Valido Delgado | System: L7 WAY | License: Proprietary — Framework free, products licensed (Law XXII)
// File: l7scan.js | Body-Hash: SHA-256:eadb2dd94cef9ab096cf8bb0340ae4f81d2ed259d294b57ada41965fde62f40d
// Chain-Hash: SHA-256:696719b8eefb5ce6c65b00467fd607936a0c380930981736d6a49a4565d92591 | Signed: 2026-03-01T15:09:50.005032+00:00
// This work is the intellectual property of Alberto Valido Delgado.
// Chain: 3 works. Verify: python3 provenance.py verify l7scan.js
// L7:PROVENANCE
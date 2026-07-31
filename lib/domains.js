

/**
 * L7 Domains — The Four Sacred Boundaries
 * Law XVII — .morph .work .salt .vault
 *
 * Each domain has rules. Boundaries are inviolable.
 *
 * .morph  — dream (Yod/Fire)    — mutable, never shared, sacred
 * .work   — produce (Vav/Air)   — stable, versioned, shareable
 * .salt   — preserve (He/Earth) — sealed, immutable, archived
 * .vault  — protect (He/Water)  — encrypted, biometric, quantum-resistant
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { MorphCycle } = require('./morph-cycle');
const { resolveContainedFile } = require('./safe-path');

const L7_DIR = process.env.L7_DIR || path.join(process.env.HOME, '.l7');

// Steel integration — morph state persistence across restarts (The Unnamed fix)
let _steel = null;
try { _steel = require('./steel'); } catch { /* steel optional at load time */ }
const _restoredMorph = _steel ? _steel.restoreMorphState() : null;

const DOMAIN_PATHS = {
  morph: path.join(L7_DIR, 'morph'),
  work:  path.join(L7_DIR, 'work'),
  salt:  path.join(L7_DIR, 'salt'),
  // The real vault is an AES-256 APFS image opened by ./vault with Touch ID.
  // Generic domain code must never create a plaintext ~/.l7/vault substitute.
  vault: process.env.L7_VAULT_MOUNT || '/Volumes/L7_VAULT'
};

function vaultBrokerRequired(operation) {
  const error = new Error(
    `Vault ${operation} requires the dedicated biometric intent broker; ` +
    'generic domain access is disabled',
  );
  error.code = 'L7_VAULT_ACCESS_REQUIRED';
  return error;
}

function assertGenericDomainAccess(domain, operation) {
  if (domain === 'vault') throw vaultBrokerRequired(operation);
}

function artifactPath(domain, name) {
  const domainPath = DOMAIN_PATHS[domain];
  if (!domainPath) throw new Error(`Unknown domain: ${domain}`);
  assertGenericDomainAccess(domain, 'path resolution');
  try {
    return resolveContainedFile(domainPath, name, { label: 'Artifact name' });
  } catch (error) {
    if (error.code === 'L7_UNSAFE_PATH') {
      const boundaryError = new Error(`Artifact path escapes .${domain}: ${name}`);
      boundaryError.code = 'L7_UNSAFE_PATH';
      throw boundaryError;
    }
    throw error;
  }
}

// Ensure all domain directories exist
for (const [domain, dir] of Object.entries(DOMAIN_PATHS)) {
  if (domain === 'vault') continue;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const DOMAIN_RULES = Object.freeze({
  morph: {
    mutable: true,
    shareable: false,
    exportable: false,
    deletable: true,
    maxDepth: 3,  // 3 recursive layers — as above, so below
    description: 'The dreamscape. 3 layers: Above → Mirror → Below. Recursive, not cascading.',
    tetragrammaton: 'Yod',
    element: 'Fire',
    letter: 'י'
  },
  work: {
    mutable: true,  // Until published
    shareable: true,
    exportable: true,
    deletable: false, // Archived to .salt instead
    description: 'The workshop. Stable, shareable, versioned. Proof of work.',
    tetragrammaton: 'Vav',
    element: 'Air',
    letter: 'ו'
  },
  salt: {
    mutable: false,
    shareable: true,  // Read-only
    exportable: true,
    deletable: false,
    description: 'The archive. Sealed, immutable. What has been proven is preserved.',
    tetragrammaton: 'He (final)',
    element: 'Earth',
    letter: 'ה'
  },
  vault: {
    mutable: true,
    shareable: false,
    exportable: false, // Must go through gateway translation
    deletable: true,   // With 72hr grace (Law XLII)
    description: 'The vault. Encrypted, biometric, quantum-resistant.',
    tetragrammaton: 'He',
    element: 'Water',
    letter: 'ה'
  }
});

/**
 * Valid transitions between domains.
 * morph → work (publish), work → salt (archive), work → vault (protect)
 * vault → work (declassify), salt → work (unseal — sovereign only)
 */
const VALID_TRANSITIONS = Object.freeze({
  morph: ['work'],          // Dream → Produce
  work:  ['salt', 'vault'], // Produce → Archive or Protect
  salt:  ['work'],          // Unseal (sovereign only)
  vault: ['work']           // Declassify (sovereign only, biometric)
});

// ═══ MORPH LAYERS — As Above, So Below, Then Salt ═══
// 3 dream layers, then automatic crystallization:
//   Layer 1: ABOVE  — the sky, the idea, the seed        (Gold/Yellow)
//   Layer 2: MIRROR — the horizon, the fold, the pivot   (Silver/White)
//   Layer 3: BELOW  — the root, the reflection, the echo (Copper/Red)
//   Layer 4: SALT   — automatic crystallization           (Earth/Green)
// After 3 dreams, whatever formed is salted (immutable).
// New dream cycle requires explicit approval to restart at Layer 1.

const MORPH_MAX_DEPTH = 3;

const MORPH_LAYERS = Object.freeze([
  { name: 'ABOVE',  color: '\x1b[93m', label: '△ ABOVE',  symbol: '☉', desc: 'The sky. The idea. The seed.' },
  { name: 'MIRROR', color: '\x1b[97m', label: '◇ MIRROR', symbol: '☽', desc: 'The horizon. The fold. The pivot.' },
  { name: 'BELOW',  color: '\x1b[91m', label: '▽ BELOW',  symbol: '⊕', desc: 'The root. The reflection. The echo.' },
  { name: 'SALT',   color: '\x1b[32m', label: '◆ SALT',   symbol: '⬡', desc: 'Crystallization. The dream becomes stone.' }
]);

const morphCycle = new MorphCycle({
  layers: MORPH_LAYERS.slice(0, MORPH_MAX_DEPTH).map(layer => layer.name),
  initialState: _restoredMorph,
  persist: (depth, locked) => {
    if (_steel) _steel.persistMorphState(depth, locked);
  },
});

/**
 * Get current morph layer info (0-indexed from morphDepth).
 */
function currentMorphLayer() {
  if (morphCycle.depth === 0) return null;
  return MORPH_LAYERS[morphCycle.depth - 1] || null;
}

/**
 * Format a morph layer title with color.
 */
function morphTitle(depth) {
  const layer = MORPH_LAYERS[depth - 1];
  if (!layer) return '';
  const reset = '\x1b[0m';
  return `${layer.color}${layer.symbol} .morph [${layer.label}] — ${layer.desc}${reset}`;
}

function createArtifactRecord(domain, name, content, metadata = {}) {
  const contentChecksum = crypto.createHash('sha256')
    .update(typeof content === 'string' ? content : JSON.stringify(content))
    .digest('hex');

  return {
    _checksum: contentChecksum,
    name,
    domain,
    content,
    metadata: {
      ...metadata,
      created: new Date().toISOString(),
      signature: crypto.createHash('sha256')
        .update(JSON.stringify({ name, domain, content }))
        .digest('hex').slice(0, 16)
    }
  };
}

/**
 * Crystallize all morph artifacts into .salt — Layer 4 automatic.
 * After 3 dreams, whatever formed becomes stone.
 * Returns array of crystallized artifact names.
 */
function crystallizeDreams() {
  const morphPath = DOMAIN_PATHS.morph;
  // Doctrine is a precondition, not a post-write assertion. Nothing below
  // this line may mutate storage unless all three dream layers are complete.
  morphCycle.assertCanCrystallize();

  if (!fs.existsSync(morphPath)) {
    throw new Error('Cannot crystallize an empty morph domain');
  }
  const completedDepth = morphCycle.depth;

  const files = fs.readdirSync(morphPath, { withFileTypes: true })
    .filter(entry => !entry.name.startsWith('.') && entry.isFile())
    .map(entry => entry.name);
  if (files.length === 0) throw new Error('Cannot crystallize an empty morph domain');

  const crystallized = [];
  const prepared = [];
  const reservedPaths = new Set();
  const transactionId = crypto.randomBytes(8).toString('hex');
  const saltLayer = MORPH_LAYERS[3]; // SALT layer
  const reset = '\x1b[0m';

  for (const f of files) {
    const artifact = read('morph', f);
    if (!artifact) continue;

    let saltName = f.endsWith('.json') ? f : `${f}.salt.json`;
    let saltPath = artifactPath('salt', saltName);
    let reused = false;

    // Preserve every distinct crystallization without mutating prior SALT.
    if (fs.existsSync(saltPath)) {
      const existing = read('salt', saltName);
      if (existing?._checksum === artifact._checksum) {
        reused = true;
      } else {
        const extension = path.extname(saltName);
        const stem = extension ? saltName.slice(0, -extension.length) : saltName;
        saltName = `${stem}.${artifact._checksum}${extension || '.salt.json'}`;
        saltPath = artifactPath('salt', saltName);
      }
    }

    if (!reused && (fs.existsSync(saltPath) || reservedPaths.has(saltPath))) {
      const extension = path.extname(saltName);
      const stem = extension ? saltName.slice(0, -extension.length) : saltName;
      saltName = `${stem}.${transactionId}${extension || '.salt.json'}`;
      saltPath = artifactPath('salt', saltName);
    }
    if (!reused) reservedPaths.add(saltPath);

    // Legacy morph records predate the canonical artifact envelope and carry
    // their payload at the root. Preserve that complete record instead of
    // passing `undefined` into the content hasher.
    const sourceContent = Object.prototype.hasOwnProperty.call(artifact, 'content')
      ? artifact.content
      : artifact;
    const record = reused ? null : createArtifactRecord('salt', saltName, sourceContent, {
      ...artifact.metadata,
      crystallized_from: 'morph',
      crystallized_at: new Date().toISOString(),
      dream_layers_traversed: completedDepth,
      crystallization_transaction: transactionId,
    });

    prepared.push({ sourceName: f, saltName, saltPath, record, reused });
    crystallized.push(saltName);
  }

  const staged = [];
  const published = [];
  try {
    for (let index = 0; index < prepared.length; index++) {
      const item = prepared[index];
      if (item.reused) continue;
      const temporaryName = `.crystallize-${transactionId}-${index}.tmp`;
      const temporaryPath = artifactPath('salt', temporaryName);
      const descriptor = fs.openSync(temporaryPath, 'wx', 0o600);
      staged.push(temporaryPath);
      try {
        fs.writeFileSync(descriptor, JSON.stringify(item.record, null, 2));
        fs.fsyncSync(descriptor);
      } finally {
        fs.closeSync(descriptor);
      }
      item.temporaryPath = temporaryPath;
    }

    // A hard-link publish fails on collision instead of replacing an existing
    // immutable crystal. Both paths are in the same filesystem and directory.
    for (const item of prepared) {
      if (item.reused) continue;
      fs.linkSync(item.temporaryPath, item.saltPath);
      published.push(item.saltPath);
      fs.chmodSync(item.saltPath, 0o444);
      fs.unlinkSync(item.temporaryPath);
    }

    // Persist the lock only after every crystal is durable. Morph sources are
    // retained if publication or state persistence fails.
    morphCycle.crystallize();
  } catch (error) {
    for (const temporaryPath of staged) {
      try { fs.unlinkSync(temporaryPath); } catch (cleanupError) {
        if (cleanupError.code !== 'ENOENT') error.cleanupError = cleanupError;
      }
    }
    for (const publishedPath of published.reverse()) {
      try {
        fs.chmodSync(publishedPath, 0o600);
        fs.unlinkSync(publishedPath);
      } catch (cleanupError) {
        if (cleanupError.code !== 'ENOENT') error.cleanupError = cleanupError;
      }
    }
    throw error;
  }

  // Once SALT and the durable lock both exist, retire the mutable sources.
  for (const f of files) {
    const sourcePath = artifactPath('morph', f);
    if (fs.existsSync(sourcePath)) fs.unlinkSync(sourcePath);
  }

  process.stdout.write(`\n${saltLayer.color}${saltLayer.symbol} [${saltLayer.label}] — ${saltLayer.desc}${reset}\n`);
  for (const item of prepared) {
    const message = item.reused
      ? `${item.sourceName} — identical crystal already sealed`
      : `${item.sourceName} → ${item.saltName} (sealed)`;
    process.stdout.write(`${saltLayer.color}  ⬡ ${message}${reset}\n`);
  }

  process.stdout.write(`${saltLayer.color}  ⬡ ${crystallized.length} dream(s) crystallized. Morph locked — approval required to dream again.${reset}\n\n`);

  return crystallized;
}

/**
 * Approve a new dream cycle — unlocks morph, resets to Layer 1.
 * Only the Philosopher can approve.
 */
function approveDreamCycle() {
  morphCycle.approve();
  const above = MORPH_LAYERS[0];
  const reset = '\x1b[0m';
  process.stdout.write(`${above.color}${above.symbol} Dream cycle approved. Morph unlocked at Layer 1 [${above.label}].${reset}\n`);
  return true;
}

/**
 * Write an artifact to a domain.
 */
function write(domain, name, content, metadata = {}) {
  const rules = DOMAIN_RULES[domain];
  if (!rules) throw new Error(`Unknown domain: ${domain}`);
  assertGenericDomainAccess(domain, 'write');

  // MORPH — 3 layers then crystallize
  let morphStep = null;
  if (domain === 'morph') {
    morphStep = morphCycle.next();
    const layer = MORPH_LAYERS[morphStep.depth - 1];
    metadata._morphLayer = morphStep.depth;
    metadata._morphName = layer.name;
    process.stdout.write(morphTitle(morphStep.depth) + '\n');
  }

  const targetPath = artifactPath(domain, name);

  // Salt is immutable — cannot overwrite
  if (domain === 'salt' && fs.existsSync(targetPath)) {
    throw new Error(`Cannot overwrite sealed artifact: ${name} in .salt`);
  }

  // Mandatory checksum — SHA-256 of content, verified on every read
  const artifact = createArtifactRecord(domain, name, content, metadata);

  fs.writeFileSync(targetPath, JSON.stringify(artifact, null, 2));
  if (morphStep) morphCycle.advance();
  if (morphStep?.shouldCrystallize) {
    process.stdout.write('\x1b[32m⬡ Three dream layers complete — crystallizing into .salt...\x1b[0m\n');
    artifact.crystallized = crystallizeDreams();
  }
  return artifact;
}

/**
 * Read an artifact from a domain.
 */
function read(domain, name) {
  assertGenericDomainAccess(domain, 'read');
  const targetPath = artifactPath(domain, name);

  if (!fs.existsSync(targetPath)) return null;

  try {
    const artifact = JSON.parse(fs.readFileSync(targetPath, 'utf8'));

    // Mandatory checksum verification on read — reject corrupted/tampered files
    if (artifact._checksum && artifact.content !== undefined) {
      const contentStr = typeof artifact.content === 'string'
        ? artifact.content : JSON.stringify(artifact.content);
      const actualChecksum = crypto.createHash('sha256').update(contentStr).digest('hex');
      if (actualChecksum !== artifact._checksum) {
        throw new Error(
          `INTEGRITY VIOLATION: ${name} in .${domain} — checksum mismatch. ` +
          `Expected ${artifact._checksum.slice(0, 16)}..., got ${actualChecksum.slice(0, 16)}... ` +
          `File may be corrupted or tampered.`
        );
      }
      artifact._verified = true;
    }

    return artifact;
  } catch (e) {
    // If it's our integrity error, propagate it
    if (e.message && e.message.includes('INTEGRITY VIOLATION')) throw e;

    // Raw file — wrap it with computed checksum
    const rawContent = fs.readFileSync(targetPath, 'utf8');
    return {
      _checksum: crypto.createHash('sha256').update(rawContent).digest('hex'),
      _verified: true,
      name,
      domain,
      content: rawContent,
      metadata: { raw: true }
    };
  }
}

/**
 * Transition an artifact between domains.
 * Returns the artifact in its new domain.
 */
function transition(fromDomain, toDomain, name, options = {}) {
  if (fromDomain === 'vault' || toDomain === 'vault') {
    throw vaultBrokerRequired(`transition .${fromDomain} → .${toDomain}`);
  }
  const allowed = VALID_TRANSITIONS[fromDomain] || [];
  if (!allowed.includes(toDomain)) {
    throw new Error(`Cannot transition from .${fromDomain} to .${toDomain}. Allowed: ${allowed.join(', ')}`);
  }

  const artifact = read(fromDomain, name);
  if (!artifact) {
    throw new Error(`Artifact not found: ${name} in .${fromDomain}`);
  }

  // Write to new domain
  const transitioned = write(toDomain, name, artifact.content, {
    ...artifact.metadata,
    transitioned_from: fromDomain,
    transitioned_at: new Date().toISOString(),
    ...options
  });

  // Handle source domain cleanup
  if (fromDomain === 'morph') {
    // Delete from morph (it was a dream, now it's real)
    const oldPath = artifactPath('morph', name);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    morphCycle.releaseLayer();
  }
  // Salt and vault don't get deleted on transition (they keep the original)

  return transitioned;
}

/**
 * Delete an artifact. Respects domain rules.
 * Law XLII — 72hr grace period for vault.
 */
function remove(domain, name) {
  const rules = DOMAIN_RULES[domain];
  if (!rules) throw new Error(`Unknown domain: ${domain}`);
  assertGenericDomainAccess(domain, 'remove');
  if (!rules.deletable) {
    throw new Error(`Cannot delete from .${domain} — domain is immutable`);
  }

  const targetPath = artifactPath(domain, name);

  if (!fs.existsSync(targetPath)) return false;

  if (domain === 'vault') {
    // Law XLII — mark for deletion with 72hr grace
    const artifact = read(domain, name);
    artifact.metadata = artifact.metadata || {};
    artifact.metadata.marked_for_deletion = new Date().toISOString();
    artifact.metadata.deletion_after = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
    fs.writeFileSync(targetPath, JSON.stringify(artifact, null, 2));
    return { scheduled: true, deletion_after: artifact.metadata.deletion_after };
  }

  // Morph — immediate deletion
  fs.unlinkSync(targetPath);
  if (domain === 'morph') morphCycle.releaseLayer();
  return { deleted: true };
}

/**
 * List all artifacts in a domain.
 */
function list(domain) {
  if (!DOMAIN_RULES[domain]) throw new Error(`Unknown domain: ${domain}`);
  assertGenericDomainAccess(domain, 'list');
  const domainPath = DOMAIN_PATHS[domain];
  if (!fs.existsSync(domainPath)) return [];

  return fs.readdirSync(domainPath)
    .filter(f => !f.startsWith('.'))
    .map(f => {
      const artifact = read(domain, f);
      return {
        name: f,
        domain,
        created: artifact?.metadata?.created,
        signature: artifact?.metadata?.signature
      };
    });
}

/**
 * Check which domain an artifact should live in based on its coordinate.
 * Security-heavy → vault. Experimental → morph. Stable → work. Archived → salt.
 */
function suggestDomain(coordinate) {
  // Mars (security, index 4) dominant → vault
  if (coordinate[4] >= 8) return 'vault';

  // Venus (persistence, index 3) high + Saturn (output, index 6) high → salt
  if (coordinate[3] >= 8 && coordinate[6] >= 7) return 'salt';

  // Neptune (consciousness, index 8) high OR Pluto (transformation, index 9) high → morph
  if (coordinate[8] >= 8 || coordinate[9] >= 8) return 'morph';

  // Default → work
  return 'work';
}

module.exports = {
  DOMAIN_RULES,
  DOMAIN_PATHS,
  VALID_TRANSITIONS,
  MORPH_LAYERS,
  artifactPath,
  write,
  read,
  transition,
  remove,
  list,
  suggestDomain,
  currentMorphLayer,
  morphTitle,
  crystallizeDreams,
  approveDreamCycle,
  get morphDepth() { return morphCycle.depth; },
  get morphLocked() { return morphCycle.locked; },
  get morphState() { return morphCycle.snapshot(); }
};

// L7:PROVENANCE
// Creator: Alberto Valido Delgado | System: L7 WAY | License: Proprietary — Framework free, products licensed (Law XXII)
// File: lib/domains.js | Body-Hash: SHA-256:44c9ffc9fd9af403500b17d8f8cc615290e980d922f29542fd9129726420b326
// Chain-Hash: SHA-256:a78662b48674c31c35b9053de386cb4cd22e1fcd2f4fbfac57bf5d17c59558ca | Signed: 2026-03-01T15:09:50.016438+00:00
// This work is the intellectual property of Alberto Valido Delgado.
// Chain: 17 works. Verify: python3 provenance.py verify lib/domains.js
// L7:PROVENANCE

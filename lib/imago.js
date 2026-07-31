'use strict';

const crypto = require('crypto');
const { CONTRACT_VERSIONS } = require('./contracts');

const VERSION = CONTRACT_VERSIONS.imago || 'l7.imago/0.1';
const MAX_LEVEL = 24;
const TAU = Math.PI * 2;

const BASIS_AXES = Object.freeze([
  'form',
  'scale',
  'depth',
  'motion',
  'material',
  'luminance',
  'chroma',
  'texture',
  'symmetry',
  'entropy',
]);

const WAVE_NAMES = Object.freeze(['geometry', 'matter', 'detail']);
const MORPH_LAYERS = Object.freeze(['ABOVE', 'MIRROR', 'BELOW']);

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function digest(value) {
  return crypto.createHash('sha256').update(stableStringify(value)).digest('hex');
}

function unit(source, index = 0) {
  return crypto.createHash('sha256').update(`${index}:${source}`).digest().readUInt32BE(0) / 0xffffffff;
}

function fixed(value, digits = 6) {
  return Number(value.toFixed(digits));
}

function normalizeCoordinate(value, source) {
  if (value !== undefined) {
    if (!Array.isArray(value) || value.length !== 12 || value.some(item => !Number.isFinite(item))) {
      throw new Error('coordinate must contain exactly 12 finite numbers');
    }
    return value.map(item => fixed(clamp(item, 0, 10), 4));
  }
  return Array.from({ length: 12 }, (_, index) => fixed(unit(source, index) * 10, 4));
}

function createWaves(source) {
  const ranges = [
    { name: 'geometry', amplitude: [0.12, 0.28], frequency: [0.45, 1.8] },
    { name: 'matter', amplitude: [0.35, 0.72], frequency: [1.2, 4.2] },
    { name: 'detail', amplitude: [0.06, 0.22], frequency: [4.5, 12] },
  ];
  return ranges.map((wave, waveIndex) => ({
    name: wave.name,
    amplitude: fixed(wave.amplitude[0] + unit(source, 20 + waveIndex) * (wave.amplitude[1] - wave.amplitude[0])),
    frequency: Array.from({ length: 3 }, (_, axis) => fixed(
      wave.frequency[0] + unit(source, 30 + waveIndex * 3 + axis) * (wave.frequency[1] - wave.frequency[0]),
    )),
    phase: fixed(unit(source, 50 + waveIndex) * TAU),
    velocity: fixed((unit(source, 60 + waveIndex) * 2 - 1) * (0.25 + waveIndex * 0.2)),
  }));
}

function reducedDyadicKey(numerator, level) {
  let n = numerator;
  let l = level;
  while (l > 0 && n % 2 === 0) {
    n /= 2;
    l -= 1;
  }
  return l === 0 ? String(n) : `${n}/2^${l}`;
}

function waveSignal(wave, x, y, z = 0, time = 0) {
  const phase = TAU * (
    wave.frequency[0] * x +
    wave.frequency[1] * y +
    wave.frequency[2] * z +
    wave.velocity * time
  ) + wave.phase;
  return wave.amplitude * Math.sin(phase);
}

function surfaceHeight(manifest, u, v) {
  const x = u * 2 - 1;
  const y = v * 2 - 1;
  return fixed(manifest.waves.reduce((sum, wave, index) => {
    const weight = index === 0 ? 0.32 : index === 1 ? 0.07 : 0.025;
    return sum + waveSignal(wave, x, y) * weight;
  }, 0));
}

function fieldAt(manifest, u, v) {
  const source = `${manifest.id}|${fixed(u, 12)}|${fixed(v, 12)}`;
  const components = BASIS_AXES.map((_, index) => {
    const intent = manifest.intent.coordinate[index % 12];
    const local = unit(source, index) * 10;
    return fixed(clamp(intent * 0.68 + local * 0.32, 0, 10), 4);
  });
  const potential = fixed(clamp(
    manifest.intent.astrocyte * (0.5 + unit(source, 11) * 0.5),
  ), 6);
  return { components, potential };
}

function createVertex(manifest, gridX, gridY, level) {
  const denominator = 2 ** level;
  const u = gridX / denominator;
  const v = gridY / denominator;
  const key = `${reducedDyadicKey(gridX, level)}:${reducedDyadicKey(gridY, level)}`;
  const source = `${manifest.id}|vertex|${key}`;
  const onU = u === 0 || u === 1;
  const onV = v === 0 || v === 1;
  const valence = onU && onV ? 2 : onU || onV ? 3 : 4;
  return {
    id: `v-${digest(source).slice(0, 20)}`,
    uv: [fixed(u, 12), fixed(v, 12)],
    position: [fixed(u * 2 - 1), fixed(v * 2 - 1), surfaceHeight(manifest, u, v)],
    field: fieldAt(manifest, u, v),
    valence,
    spin: unit(source, 70) < 0.5 ? -1 : 1,
    charge: fixed(unit(source, 71) * 2 - 1),
  };
}

function interpolateVector(a, b, amount) {
  return a.map((value, index) => fixed(value + (b[index] - value) * amount));
}

function createEdge(from, to) {
  const ordered = [from.id, to.id].sort();
  const source = `${ordered[0]}|${ordered[1]}`;
  return {
    id: `e-${digest(source).slice(0, 20)}`,
    from: from.id,
    to: to.id,
    path: [
      from.position,
      interpolateVector(from.position, to.position, 1 / 3),
      interpolateVector(from.position, to.position, 2 / 3),
      to.position,
    ],
    valence: Math.min(from.valence, to.valence),
    spin: from.spin === to.spin ? 1 : -1,
    charge: fixed((from.charge + to.charge) / 2),
  };
}

function averageField(corners) {
  return {
    components: BASIS_AXES.map((_, index) => fixed(
      corners.reduce((sum, corner) => sum + corner.field.components[index], 0) / corners.length,
      4,
    )),
    potential: fixed(corners.reduce((sum, corner) => sum + corner.field.potential, 0) / corners.length),
  };
}

function createPatch(manifest, cell = { level: 0, x: 0, y: 0 }, address = 'q') {
  const { level, x, y } = cell;
  if (!Number.isInteger(level) || level < 0 || level > MAX_LEVEL) {
    throw new Error(`patch level must be an integer from 0 to ${MAX_LEVEL}`);
  }
  const side = 2 ** level;
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= side || y >= side) {
    throw new Error(`patch cell (${x}, ${y}) is outside level ${level}`);
  }
  const corners = [
    createVertex(manifest, x, y, level),
    createVertex(manifest, x + 1, y, level),
    createVertex(manifest, x + 1, y + 1, level),
    createVertex(manifest, x, y + 1, level),
  ];
  const denominator = 2 ** level;
  return {
    address,
    cell: { level, x, y },
    bounds: [
      fixed(x / denominator, 12),
      fixed(y / denominator, 12),
      fixed((x + 1) / denominator, 12),
      fixed((y + 1) / denominator, 12),
    ],
    corners,
    edges: [
      createEdge(corners[0], corners[1]),
      createEdge(corners[1], corners[2]),
      createEdge(corners[2], corners[3]),
      createEdge(corners[3], corners[0]),
    ],
    field: averageField(corners),
  };
}

function createImago(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('IMAGO input must be an object');
  }
  const brief = String(input.brief || '').trim();
  if (!brief) throw new Error('brief is required');
  if (brief.length > 4000) throw new Error('brief must be 4000 characters or fewer');
  const identity = String(input.identity || brief).trim();
  if (!identity) throw new Error('identity is required');
  const seed = Number(input.seed || 0) >>> 0;
  const astrocyte = fixed(clamp(
    Number.isFinite(Number(input.astrocyte)) ? Number(input.astrocyte) : 0.42,
  ));
  const source = stableStringify({ brief, identity, seed });
  const coordinate = normalizeCoordinate(input.coordinate, source);
  const waves = createWaves(`${source}|${coordinate.join(',')}|${astrocyte}`);
  const core = {
    version: VERSION,
    seed,
    intent: { brief, identity, coordinate, astrocyte },
    basis: { axes: [...BASIS_AXES], governor: 'potential' },
    waves,
    morphology: {
      layers: [...MORPH_LAYERS],
      crystallizes_after: 3,
      target: '.salt',
      restart_requires_approval: true,
    },
  };
  const sourceHash = digest(core);
  const manifest = {
    ...core,
    id: `imago-${sourceHash.slice(0, 24)}`,
    root_patch: null,
    provenance: { source_hash: sourceHash, address_rule: 'dyadic-quadtree/v1' },
  };
  manifest.root_patch = createPatch(manifest);
  return manifest;
}

function refinePatch(manifest, patch = manifest?.root_patch) {
  if (!manifest || !patch) throw new Error('manifest and patch are required');
  const { level, x, y } = patch.cell;
  if (level >= MAX_LEVEL) throw new Error(`cannot refine beyond level ${MAX_LEVEL}`);
  return [0, 1, 2, 3].map(index => {
    const dx = index % 2;
    const dy = Math.floor(index / 2);
    return createPatch(
      manifest,
      { level: level + 1, x: x * 2 + dx, y: y * 2 + dy },
      `${patch.address}/${index}`,
    );
  });
}

function bilinear(corners, u, v, select) {
  const values = corners.map(select);
  return values[0].map((_, index) => {
    const top = values[0][index] * (1 - u) + values[1][index] * u;
    const bottom = values[3][index] * (1 - u) + values[2][index] * u;
    return top * (1 - v) + bottom * v;
  });
}

function samplePatch(manifest, patch, u, v, time = 0) {
  if (!Number.isFinite(u) || !Number.isFinite(v) || u < 0 || u > 1 || v < 0 || v > 1) {
    throw new Error('sample coordinates must be within [0, 1]');
  }
  const position = bilinear(patch.corners, u, v, corner => corner.position).map(value => fixed(value));
  const components = bilinear(patch.corners, u, v, corner => corner.field.components)
    .map(value => fixed(clamp(value, 0, 10), 4));
  const potentials = patch.corners.map(corner => [corner.field.potential]);
  const potential = fixed(bilinear(
    patch.corners,
    u,
    v,
    (_, index) => potentials[index],
  )[0]);
  const signals = Object.fromEntries(manifest.waves.map(wave => [
    wave.name,
    fixed(waveSignal(wave, position[0], position[1], position[2], time)),
  ]));
  return { position, field: { components, potential }, signals };
}

module.exports = {
  VERSION,
  MAX_LEVEL,
  BASIS_AXES,
  WAVE_NAMES,
  MORPH_LAYERS,
  createImago,
  createPatch,
  refinePatch,
  samplePatch,
  stableStringify,
};
// L7:PROVENANCE
// Creator: Alberto Valido Delgado | System: L7 WAY | License: Proprietary — Framework free, products licensed (Law XXII)
// File: lib/imago.js | Body-Hash: SHA-256:d5f0a772471835984d693609d73caf7d4ccf9f0fd87c0cc6ea3cfea3b7e94166
// Chain-Hash: SHA-256:65b3aca573dccf728e5e1a546ada30987d0243a88d64782560e54155be25c617 | Signed: 2026-07-28T15:51:22.830799+00:00
// This work is the intellectual property of Alberto Valido Delgado.
// Chain: 72 works. Verify: python3 provenance.py verify lib/imago.js
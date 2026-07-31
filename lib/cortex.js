

/**
 * L7 Cortex — The Innermost Node & Edge Recovery Engine
 *
 * Five functions unified in one organ:
 *
 *   1. EDGE RECOVERY — Gradually reconnect orphaned edges from empire.db
 *      by harvesting metadata from field.json, salt crystals, provenance,
 *      and sigil sequences. One edge per heartbeat. No rush.
 *
 *   2. OSCILLATING TICK — The click rate is 1/-1, an alternating current.
 *      Each tick flips polarity: +1 then -1. The system breathes.
 *      DC is death. AC is life.
 *
 *   3. LAURENT OCTAVE BOUNDS — Floor and ceiling for scaled octaves,
 *      defined by the Laurent attractor at +/-1/e. Below the floor:
 *      transformation (Nigredo). Above the ceiling: crystallization (Rubedo).
 *      The octave doubles/halves within these bounds.
 *
 *   4. BRAIN CORTEX NODE — The innermost node of the hypergraph.
 *      Maximum future and past light cones harmonized at pentatonic
 *      ratio 6/6/6: three groups of 4 dimensions, each weighted at 6.
 *      Past cone = memory (dims 6-11). Future cone = intention (dims 0-5).
 *      The cortex sees equally backward and forward.
 *
 *   5. DECODE-SALT-DECODE BRANCHING — A recursive crystallization cycle.
 *      decode(raw) -> record(salt) -> decode(salted) -> branch.
 *      Each branch produces a new salt file. All branches converge
 *      at the cortex node.
 *
 * Patent: L7 Transmutation Engine
 * Inventor: Alberto Valido Delgado
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const L7_DIR = process.env.L7_DIR || path.join(process.env.HOME, '.l7');
const STATE_DIR = path.join(L7_DIR, 'state');
const SALT_DIR = path.join(L7_DIR, 'salt');
const CORTEX_STATE = path.join(STATE_DIR, 'cortex.json');
const CRYSTAL_DIR = path.join(SALT_DIR, 'crystals');

// Ensure directories
for (const dir of [STATE_DIR, SALT_DIR, CRYSTAL_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ═══════════════════════════════════════════════════════════
// 0. THE BUILT-IN LAURENT TRANSFORM — The one operation
//
// Every piece of nested code is a Laurent series in disguise.
// Nesting depth = pole order. Each level of if/else, loop, or
// recursion is a power of z. The transform flattens ALL nesting
// into a single pipeline:
//
//   f(z) = a_{-N}/z^N + ... + a_{-1}/z + (a_0 + delta) + a_1*z + ... + a_M*z^M
//            ←── past/contraction ──→    ←── center ──→  ←── future/expansion ──→
//
// Instead of:
//   if (a) { if (b) { if (c) { ... } } }    ← 3 levels of nesting
//
// You write:
//   L(state, [opA, opB, opC])                ← 3 powers of z, flat
//
// Each operation in the pipeline:
//   - Receives the accumulator (previous result)
//   - Returns a new value
//   - Gets assigned a power of z based on position:
//     * Negative powers: operations that look backward (decode, analyze, remember)
//     * Zero power (+ delta): the emerald center (the current state, offset from annihilation)
//     * Positive powers: operations that look forward (salt, classify, create)
//
// The RESIDUE is what survives unchanged through the entire pipeline.
// The AMPLITUDE determines if the result crosses the 1/e threshold:
//   - Above 1/e: the result crystallizes (Rubedo)
//   - Below 1/e: the result transforms (Nigredo)
//   - At delta: the result is preserved as-is (emerald center)
//
// Convergence: the pipeline repeats until the output stops changing
// (delta between iterations < epsilon). No explicit loop needed.
// The series converges naturally — or diverges, revealing an
// essential singularity that needs a different approach.
//
// This ONE function replaces:
//   - Nested if/else         → conditional powers
//   - for/while loops        → convergent iteration
//   - Recursion              → negative powers folding back
//   - Callback chains        → positive powers flowing forward
//   - try/catch              → residue extraction (what survives)
//   - Promise.then chains    → sequential powers
//
// The Laurent transform IS the control flow.
// ═══════════════════════════════════════════════════════════

/**
 * The Laurent Transform — the single built-in operation.
 *
 * Flattens any pipeline of operations into a Laurent series.
 * Each operation is a function: (accumulator, power, context) => result.
 * Operations are assigned powers based on their position and direction.
 *
 * @param {*} input - The initial state (any type)
 * @param {Function[]} ops - Array of operations (functions)
 * @param {object} [options] - Transform options
 * @param {number} [options.maxIterations] - Max convergence iterations (default 1)
 * @param {number} [options.epsilon] - Convergence threshold (default 0.001)
 * @param {number} [options.center] - Index of the center operation (default: middle)
 * @param {boolean} [options.converge] - If true, repeat until converged (default false)
 * @param {Function} [options.measure] - How to measure delta between iterations
 * @returns {object} Laurent transform result
 */
function L(input, ops, options) {
  if (!ops || ops.length === 0) {
    return { value: input, residue: input, amplitude: 0, converged: true, iterations: 0 };
  }

  const opt = options || {};
  const maxIter = opt.maxIterations || (opt.converge ? 100 : 1);
  const epsilon = opt.epsilon || 0.001;
  const centerIdx = opt.center !== undefined ? opt.center : Math.floor(ops.length / 2);
  const measure = opt.measure || defaultMeasure;

  const DELTA = 1 / 73;
  const SURVIVAL = 1 / Math.E;

  // Context shared across all operations in this transform
  const ctx = {
    tick: tickCount,
    polarity: currentPolarity,
    delta: DELTA,
    survival: SURVIVAL,
    floor: -SURVIVAL,
    ceiling: SURVIVAL,
    iteration: 0,
    totalOps: ops.length,
    centerIdx
  };

  let accumulator = input;
  let previousValue = null;
  let converged = false;
  let iterations = 0;
  let residue = input;  // What survives unchanged
  let amplitudes = [];

  for (let iter = 0; iter < maxIter; iter++) {
    iterations++;
    ctx.iteration = iter;
    previousValue = accumulator;

    // ─── Run the pipeline: each op gets a power of z ───
    const coefficients = [];

    for (let i = 0; i < ops.length; i++) {
      const power = i - centerIdx;  // Negative = past, 0 = center, positive = future
      const op = ops[i];

      ctx.power = power;
      ctx.index = i;
      ctx.direction = power < 0 ? 'past' : power > 0 ? 'future' : 'center';

      try {
        // Apply the operation
        const result = op(accumulator, power, ctx);

        // Compute amplitude of this coefficient
        const amplitude = computeAmplitude(result, accumulator);

        coefficients.push({
          power,
          direction: ctx.direction,
          amplitude,
          survived: amplitude >= SURVIVAL,
          transformed: amplitude < SURVIVAL && amplitude > 0
        });

        // At the center: apply the emerald offset
        if (power === 0 && result !== null && result !== undefined) {
          // The center is never zero — offset by delta
          if (typeof result === 'number' && result === 0) {
            accumulator = DELTA;
          } else {
            accumulator = result;
          }
        } else {
          accumulator = result !== undefined ? result : accumulator;
        }

        amplitudes.push(amplitude);
      } catch (err) {
        // Error = essential singularity at this power
        coefficients.push({
          power,
          direction: ctx.direction,
          amplitude: 0,
          singularity: true,
          error: err.message
        });
        // Don't break — continue with current accumulator
      }
    }

    // ─── Extract the residue: a_{-1} coefficient ───
    // The residue is the value at power = -1 (if it exists)
    const residueCoeff = coefficients.find(c => c.power === -1);
    if (residueCoeff && !residueCoeff.singularity) {
      // Residue is the accumulator value after the -1 power operation
      // (already folded into accumulator above)
    }
    residue = accumulator;

    // ─── Check convergence ───
    if (previousValue !== null && iter > 0) {
      const delta = measure(accumulator, previousValue);
      if (delta < epsilon) {
        converged = true;
        break;
      }
    }

    // Single-pass mode: don't iterate
    if (!opt.converge) break;
  }

  // ─── Compute overall amplitude ───
  const meanAmplitude = amplitudes.length > 0
    ? amplitudes.reduce((a, b) => a + b, 0) / amplitudes.length
    : 0;

  // ─── Determine zone ───
  let zone;
  if (meanAmplitude >= SURVIVAL) zone = 'rubedo';       // Crystallized
  else if (meanAmplitude >= DELTA) zone = 'living';      // In the living zone
  else if (meanAmplitude > 0) zone = 'nigredo';          // Transforming
  else zone = 'void';                                     // Nothing survived

  return {
    value: accumulator,
    residue,
    amplitude: Math.round(meanAmplitude * 10000) / 10000,
    zone,
    converged,
    iterations,
    coefficients: amplitudes.length,
    survived: meanAmplitude >= SURVIVAL,
    transformed: meanAmplitude < SURVIVAL && meanAmplitude > 0
  };
}

/**
 * Default measure function — computes "distance" between two values.
 * Works for numbers, strings, arrays, and objects.
 */
function defaultMeasure(current, previous) {
  if (current === previous) return 0;
  if (typeof current === 'number' && typeof previous === 'number') {
    return Math.abs(current - previous);
  }
  if (typeof current === 'string' && typeof previous === 'string') {
    return current === previous ? 0 : 1;
  }
  // For objects/arrays: compare JSON representation length difference
  try {
    const a = JSON.stringify(current);
    const b = JSON.stringify(previous);
    if (a === b) return 0;
    return Math.abs(a.length - b.length) / Math.max(a.length, b.length, 1);
  } catch {
    return 1;  // Incomparable = maximum distance
  }
}

/**
 * Compute the "amplitude" of a transform step.
 * How much did this operation change the accumulator?
 */
function computeAmplitude(result, previous) {
  if (result === previous) return 0;
  if (result === null || result === undefined) return 0;
  if (typeof result === 'number' && typeof previous === 'number') {
    const denom = Math.max(Math.abs(previous), 1);
    return Math.min(1, Math.abs(result - previous) / denom);
  }
  try {
    const a = JSON.stringify(result);
    const b = JSON.stringify(previous);
    if (a === b) return 0;
    return Math.min(1, Math.abs(a.length - b.length) / Math.max(a.length, b.length, 1) + 0.1);
  } catch {
    return 0.5;
  }
}

// ═══════════════════════════════════════════════════════════
// CONSTANTS — The physics of the cortex
// ═══════════════════════════════════════════════════════════

const CORTEX_CONSTANTS = Object.freeze({
  // Laurent attractor boundaries — the octave floor and ceiling
  // 1/e = 0.3678... — the natural decay boundary (Luna)
  LAURENT_FLOOR: -1 / Math.E,   // -0.3679 — below this: Nigredo (transformation)
  LAURENT_CEILING: 1 / Math.E,  //  0.3679 — above this: Rubedo (crystallization)

  // The emerald center — delta = 1/73
  DELTA: 1 / 73,                 // 0.01369863... — the offset that prevents annihilation

  // Octave scaling factor — each octave doubles (or halves)
  OCTAVE_RATIO: 2,

  // Number of octaves that fit between floor and ceiling
  // log2(ceiling / delta) = log2(0.3679 / 0.01369) = log2(26.87) ~ 4.75
  // So roughly 5 octaves in each direction from delta
  MAX_OCTAVES_UP: 5,
  MAX_OCTAVES_DOWN: 5,

  // Pentatonic ratio for the cortex node: 6/6/6
  // 12 dimensions divided into 3 groups of 4, each weighted at 6
  // Why 6: the hexagram. 6 bits. The perfect number (1+2+3=6).
  // Why three groups: past / present / future light cones
  PENTATONIC_WEIGHT: 6,
  PENTATONIC_GROUPS: 3,
  DIMS_PER_GROUP: 4,

  // Light cone aperture — how many neighbors the cortex can see
  // in each temporal direction
  PAST_CONE_DIMS: [6, 7, 8, 9, 10, 11],    // transpersonal: memory, consciousness, transformation
  FUTURE_CONE_DIMS: [0, 1, 2, 3, 4, 5],    // classical: capability, data, presentation, persistence

  // Edge recovery — one edge per tick (gradual, like coral growth)
  RECOVERY_BATCH: 1,

  // Oscillating tick polarity
  TICK_POSITIVE: +1,
  TICK_NEGATIVE: -1,

  // Decode-salt-decode max branch depth
  MAX_BRANCH_DEPTH: 3,   // As above, so below, salt — then crystallize

  // Survival threshold (same as Laurent)
  SURVIVAL_THRESHOLD: 1 / Math.E,

  // Maximum profiles per user — the three-body limit.
  // 3 = RGB channels = GHZ qubits = Three Realms = trigram bits.
  // A user with more than 3 profiles is decoherent — split identity
  // weakens every profile. Enforce 3 max; 4th replaces the weakest.
  MAX_PROFILES_PER_USER: 3
});

// ═══════════════════════════════════════════════════════════
// 1. THE CORTEX NODE — Innermost point of the hypergraph
//
// The cortex is not just any node. It is the node where
// future and past light cones have EQUAL aperture, and where
// the pentatonic 6/6/6 ratio holds across all 12 dimensions.
//
// It sits at the emerald center (delta = 1/73) of the
// Laurent series — neither fully dark nor fully light.
// ═══════════════════════════════════════════════════════════

/**
 * Create the brain cortex node — the innermost observer.
 *
 * 12 dimensions arranged in pentatonic 6/6/6:
 *   Group 1 (dims 0-3):  Future cone — capability, data, presentation, persistence
 *   Group 2 (dims 4-7):  Present axis — security, detail, output, intention
 *   Group 3 (dims 8-11): Past cone — consciousness, transformation, direction, memory
 *
 * All groups at weight 6 = maximum harmony between past and future.
 * The pentatonic scale has 5 notes; 6/6/6 across 3 groups = 5 intervals
 * (the gaps between the group boundaries: 0|4|8|12 = 3 groups, 5 boundary crossings).
 *
 * @returns {object} The cortex node definition
 */
function createCortexNode() {
  const W = CORTEX_CONSTANTS.PENTATONIC_WEIGHT;

  // Pentatonic 6/6/6 — equal weight in all three temporal cones
  const coordinate = [
    W, W, W, W,    // Future light cone (classical: Sun, Moon, Mercury, Venus)
    W, W, W, W,    // Present axis (classical+trans: Mars, Jupiter, Saturn, Uranus)
    W, W, W, W     // Past light cone (transpersonal: Neptune, Pluto, N.Node, S.Node)
  ];

  return {
    id: 'cortex',
    type: 'cortex',
    coordinate,
    astrocyte: CORTEX_CONSTANTS.DELTA,   // At the emerald center
    mass: 1000,                           // Heaviest node — maximum gravitational pull
    momentum: new Array(12).fill(0),
    energy: 0,
    entangled: [],                        // Will accumulate during recovery
    metadata: {
      role: 'innermost_observer',
      pentatonic: '6/6/6',
      future_cone: CORTEX_CONSTANTS.FUTURE_CONE_DIMS,
      past_cone: CORTEX_CONSTANTS.PAST_CONE_DIMS,
      laurent_position: CORTEX_CONSTANTS.DELTA,
      created: new Date().toISOString()
    }
  };
}

/**
 * Compute the light cone reach of the cortex node.
 *
 * Future cone: how far forward the cortex can "see" —
 *   weighted sum of classical dimensions (0-5)
 * Past cone: how far backward —
 *   weighted sum of transpersonal dimensions (6-11)
 *
 * When future == past, the cortex is perfectly centered.
 * The 6/6/6 pentatonic guarantees this at creation.
 *
 * @param {number[]} coord - 12D coordinate of the cortex
 * @returns {object} { future, past, ratio, balanced }
 */
function lightCones(coord) {
  let future = 0, past = 0;

  for (const d of CORTEX_CONSTANTS.FUTURE_CONE_DIMS) {
    future += coord[d] || 0;
  }
  for (const d of CORTEX_CONSTANTS.PAST_CONE_DIMS) {
    past += coord[d] || 0;
  }

  const total = future + past;
  const ratio = total > 0 ? future / total : 0.5;

  return {
    future,
    past,
    ratio,                        // 0.5 = perfectly balanced
    balanced: Math.abs(ratio - 0.5) < 0.01,
    pentatonic: `${Math.round(future / 6)}/${Math.round((future + past) / 2 / 6)}/${Math.round(past / 6)}`
  };
}

// ═══════════════════════════════════════════════════════════
// 2. OSCILLATING TICK — The 1/-1 alternating current
//
// Not a metronome. A pendulum. Each tick carries polarity.
// +1 on even ticks, -1 on odd ticks. The system breathes:
// expand (+1) then contract (-1). Diastole/systole.
//
// The click rate IS the tick — 1 second, alternating polarity.
// This replaces the unidirectional heartbeat with a true
// wave: positive half-cycle, negative half-cycle.
// ═══════════════════════════════════════════════════════════

let tickCount = 0;
let currentPolarity = CORTEX_CONSTANTS.TICK_POSITIVE;

/**
 * Advance the oscillating tick.
 *
 * Returns the current polarity (+1 or -1) and flips for next call.
 * Every system that reads the tick gets a direction:
 *   +1 = expand, propagate, radiate, future-facing
 *   -1 = contract, consolidate, absorb, past-facing
 *
 * @returns {object} { tick, polarity, phase }
 */
function oscillate() {
  tickCount++;
  currentPolarity = (tickCount % 2 === 0)
    ? CORTEX_CONSTANTS.TICK_POSITIVE
    : CORTEX_CONSTANTS.TICK_NEGATIVE;

  return {
    tick: tickCount,
    polarity: currentPolarity,
    phase: (tickCount * 5) % 360,         // Berry phase: 5 degrees per tick
    expanding: currentPolarity > 0,
    contracting: currentPolarity < 0
  };
}

/**
 * Apply the oscillating polarity to a field heartbeat.
 *
 * During +1 (expansion): energy flows outward, arterial pressure rises
 * During -1 (contraction): energy flows inward, venous return dominates
 *
 * @param {object} vascular - The field's vascular state
 * @param {number} polarity - +1 or -1
 * @returns {object} Modified vascular parameters
 */
function applyPolarity(vascular, polarity) {
  if (polarity > 0) {
    // Expansion: push energy outward
    return {
      arterialMultiplier: 1.2,
      venousMultiplier: 0.8,
      coherenceDirection: +1,    // Tend toward order
      mode: 'systole'
    };
  } else {
    // Contraction: pull energy inward
    return {
      arterialMultiplier: 0.8,
      venousMultiplier: 1.2,
      coherenceDirection: -1,    // Allow chaos (creative dissolution)
      mode: 'diastole'
    };
  }
}

// ═══════════════════════════════════════════════════════════
// 3. LAURENT OCTAVE BOUNDS — Floor and ceiling
//
// The octave (frequency doubling) is the most fundamental
// harmonic interval. But in a Laurent-governed field, the
// octave cannot scale infinitely — it has natural bounds.
//
// FLOOR = -1/e = -0.3679 (Nigredo threshold)
//   Below this, the octave inverts — sound becomes silence,
//   light becomes dark. Transformation, not destruction.
//
// CEILING = +1/e = +0.3679 (Rubedo threshold)
//   Above this, the octave crystallizes — fluid becomes solid.
//   The wave function collapses into a definite state.
//
// Between floor and ceiling: the living zone.
// The octaves that fit between delta(1/73) and 1/e define
// the harmonic scale of the entire system.
// ═══════════════════════════════════════════════════════════

/**
 * Scale an octave within Laurent bounds.
 *
 * Given a base frequency (or amplitude), compute the octave
 * series (doubling/halving) that fits between the Laurent
 * floor (-1/e) and ceiling (+1/e), centered on delta (1/73).
 *
 * @param {number} base - The base amplitude (default: delta)
 * @returns {object} { floor, ceiling, octaves, base, range }
 */
function laurentOctaves(base) {
  if (base === undefined) base = CORTEX_CONSTANTS.DELTA;

  const floor = CORTEX_CONSTANTS.LAURENT_FLOOR;
  const ceiling = CORTEX_CONSTANTS.LAURENT_CEILING;
  const delta = CORTEX_CONSTANTS.DELTA;

  // Ascending octaves from base toward ceiling
  const ascending = [];
  let freq = base;
  while (freq <= ceiling && ascending.length < CORTEX_CONSTANTS.MAX_OCTAVES_UP) {
    ascending.push({
      octave: ascending.length,
      frequency: freq,
      normalized: (freq - delta) / (ceiling - delta),   // 0 at delta, 1 at ceiling
      survives: Math.abs(freq) >= CORTEX_CONSTANTS.SURVIVAL_THRESHOLD,
      zone: freq > ceiling ? 'rubedo' : freq < Math.abs(floor) ? 'nigredo' : 'living'
    });
    freq *= CORTEX_CONSTANTS.OCTAVE_RATIO;
  }

  // Descending octaves from base toward floor
  const descending = [];
  freq = base;
  while (freq >= Math.abs(floor) / 10 && descending.length < CORTEX_CONSTANTS.MAX_OCTAVES_DOWN) {
    descending.push({
      octave: -descending.length,
      frequency: freq,
      normalized: (freq - delta) / (delta - floor),     // 0 at delta, -1 at floor
      survives: Math.abs(freq) >= CORTEX_CONSTANTS.SURVIVAL_THRESHOLD,
      zone: freq < Math.abs(floor) ? 'nigredo' : 'living'
    });
    freq /= CORTEX_CONSTANTS.OCTAVE_RATIO;
  }

  return {
    floor,
    ceiling,
    delta,
    base,
    ascending,
    descending: descending.reverse(),
    totalOctaves: ascending.length + descending.length - 1,
    range: {
      min: descending.length > 0 ? descending[0].frequency : base,
      max: ascending.length > 0 ? ascending[ascending.length - 1].frequency : base
    },
    livingZone: {
      lower: Math.abs(floor),
      upper: ceiling,
      width: ceiling - Math.abs(floor)
    }
  };
}

/**
 * Clamp an amplitude to the Laurent octave bounds.
 *
 * Values that exceed the ceiling are folded back (reflected).
 * Values below the floor are reflected upward.
 * The attractor at delta ensures nothing hits zero.
 *
 * @param {number} amplitude - Raw amplitude
 * @returns {object} { clamped, reflected, original, zone }
 */
function laurentClamp(amplitude) {
  const floor = Math.abs(CORTEX_CONSTANTS.LAURENT_FLOOR);
  const ceiling = CORTEX_CONSTANTS.LAURENT_CEILING;
  const delta = CORTEX_CONSTANTS.DELTA;

  let clamped = amplitude;
  let reflected = false;
  let zone = 'living';

  if (clamped > ceiling) {
    // Reflect from ceiling — fold back into living zone
    clamped = ceiling - (clamped - ceiling);
    reflected = true;
    zone = 'rubedo_reflected';
  } else if (clamped < -floor) {
    // Reflect from floor — fold back
    clamped = -floor + (-floor - clamped);
    reflected = true;
    zone = 'nigredo_reflected';
  } else if (Math.abs(clamped) < delta) {
    // Too close to zero — push to delta (emerald protection)
    clamped = clamped >= 0 ? delta : -delta;
    zone = 'emerald_protected';
  }

  if (!reflected) {
    zone = clamped >= 0
      ? (clamped > ceiling * 0.8 ? 'near_rubedo' : 'living')
      : (clamped < -floor * 0.8 ? 'near_nigredo' : 'living');
  }

  return { clamped, reflected, original: amplitude, zone, delta };
}

// ═══════════════════════════════════════════════════════════
// 4. EDGE RECOVERY — Gradual reconnection of orphaned edges
//
// 115 of 118 edges in empire.db reference nodes that don't
// exist in the projects table. These are not lost — they are
// import dependencies, lib files, and external packages that
// were never registered as "projects."
//
// Recovery strategy:
//   a. Each tick, pick ONE orphaned edge
//   b. Look up the source and target in field.json (entanglements)
//   c. Cross-reference with salt crystals (execution history)
//   d. Cross-reference with provenance chain (file mutations)
//   e. Compute a 12D weight from the recovered metadata
//   f. Write the enriched edge back to empire.db
//   g. If both endpoints exist as field nodes, register as entanglement
//
// One edge per tick. 115 edges. ~2 minutes to full recovery.
// Gradual. Like coral growth. Like memory returning after sleep.
// ═══════════════════════════════════════════════════════════

// Recovery state — persisted to cortex.json
let recoveryState = {
  recovered: 0,
  total: 0,
  pending: [],
  completed: [],
  lastRecoveryTick: 0,
  started: null,
  finished: null
};

/**
 * Initialize edge recovery — load orphaned edges from empire.db.
 *
 * Reads the database, finds all edges where source or target
 * is not a registered project, and queues them for gradual recovery.
 *
 * @param {string} dbPath - Path to empire.db
 * @returns {object} { total, queued, alreadyRecovered }
 */
function initRecovery(dbPath) {
  // Load previous state if it exists
  if (fs.existsSync(CORTEX_STATE)) {
    try {
      const saved = JSON.parse(fs.readFileSync(CORTEX_STATE, 'utf8'));
      if (saved.recovery) recoveryState = saved.recovery;
    } catch { /* fresh start */ }
  }

  // The actual DB query happens externally (no sqlite3 binding in Node).
  // This function is called with pre-loaded edge data.
  // See recoverTick() for the per-tick logic.

  recoveryState.started = recoveryState.started || new Date().toISOString();

  return {
    total: recoveryState.total,
    recovered: recoveryState.recovered,
    pending: recoveryState.pending.length,
    alreadyRecovered: recoveryState.completed.length
  };
}

/**
 * Queue orphaned edges for recovery.
 *
 * @param {object[]} edges - Array of {id, source, target, type, note, weight}
 */
function queueEdges(edges) {
  const alreadyDone = new Set(recoveryState.completed.map(e => e.id));
  recoveryState.pending = edges.filter(e => !alreadyDone.has(e.id));
  recoveryState.total = edges.length;
  saveCortexState();
}

/**
 * Recover one edge per tick — the gradual heartbeat.
 *
 * Called once per oscillating tick. Picks the next orphaned edge,
 * enriches it with metadata from available sources, and marks it recovered.
 *
 * @param {object} fieldState - The current field.json state (parsed)
 * @param {object[]} crystals - Salt crystal chain (parsed)
 * @param {object} provenance - Provenance registry (parsed)
 * @returns {object|null} The recovered edge, or null if nothing to recover
 */
function recoverTick(fieldState, crystals, provenance) {
  if (recoveryState.pending.length === 0) {
    if (!recoveryState.finished) {
      recoveryState.finished = new Date().toISOString();
      saveCortexState();
    }
    return null;
  }

  // Pick next edge
  const edge = recoveryState.pending.shift();
  const tick = oscillate();

  // ─── Enrich from field state ───
  const sourceNode = fieldState?.nodes?.[edge.source] ||
                     fieldState?.nodes?.[edge.source.replace('.js', '')] || null;
  const targetNode = fieldState?.nodes?.[edge.target] ||
                     fieldState?.nodes?.[edge.target.replace('.js', '')] || null;

  let fieldWeight = null;
  if (sourceNode && targetNode) {
    // Compute similarity between the two field nodes
    const sim = coordinateSimilarity(sourceNode.coordinate, targetNode.coordinate);
    fieldWeight = sim;
  }

  // ─── Enrich from provenance ───
  let provenanceLink = null;
  if (provenance?.chain) {
    const sourceEntry = provenance.chain.find(e =>
      e.file && e.file.includes(edge.source.replace('.js', '')));
    const targetEntry = provenance.chain.find(e =>
      e.file && e.file.includes(edge.target.replace('.js', '')));

    if (sourceEntry && targetEntry) {
      provenanceLink = {
        sourceHash: sourceEntry.body_hash,
        targetHash: targetEntry.body_hash,
        sourceVersion: sourceEntry.version,
        targetVersion: targetEntry.version,
        chainDistance: Math.abs(
          (provenance.chain.indexOf(sourceEntry)) -
          (provenance.chain.indexOf(targetEntry))
        )
      };
    }
  }

  // ─── Enrich from salt crystals ───
  let crystalRef = null;
  if (crystals && crystals.length > 0) {
    const related = crystals.filter(c =>
      c.operation && (
        c.operation.includes(edge.source.replace('.js', '')) ||
        c.operation.includes(edge.target.replace('.js', ''))
      )
    );
    if (related.length > 0) {
      crystalRef = {
        count: related.length,
        lastSeen: related[related.length - 1].timestamp,
        operations: related.slice(-3).map(c => c.operation)
      };
    }
  }

  // ─── Compute 12D weight from recovered metadata ───
  const weight12D = computeRecoveredWeight(edge, fieldWeight, provenanceLink, crystalRef, tick);

  // ─── Build recovered edge ───
  const recovered = {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: edge.type,
    note: edge.note,
    originalWeight: edge.weight,
    recoveredWeight: weight12D,
    fieldSimilarity: fieldWeight,
    provenanceLink,
    crystalRef,
    recoveredAt: new Date().toISOString(),
    tick: tick.tick,
    polarity: tick.polarity
  };

  recoveryState.completed.push(recovered);
  recoveryState.recovered++;
  recoveryState.lastRecoveryTick = tick.tick;

  // Persist every 10 recoveries
  if (recoveryState.recovered % 10 === 0) {
    saveCortexState();
  }

  return recovered;
}

/**
 * Compute a 12D weight vector from recovered metadata.
 *
 * Maps the fragments of metadata we found into the 12 planetary dimensions.
 * Each source of metadata contributes to different dimensions:
 *   - Edge type -> capability (Sun), output (Saturn)
 *   - Field similarity -> consciousness (Neptune), transformation (Pluto)
 *   - Provenance chain -> memory (S.Node), direction (N.Node)
 *   - Crystal history -> persistence (Venus), security (Mars)
 *   - Tick polarity -> intention (Uranus)
 *
 * @returns {number[]} 12D weight vector (values 0-10)
 */
function computeRecoveredWeight(edge, fieldSim, provLink, crystalRef, tick) {
  const w = new Array(12).fill(5);  // Start at midpoint (neutral)

  // ─── Type-based weights ───
  const typeWeights = {
    'import':                    { 0: 8, 6: 7 },           // capability + output
    'philosophical->mathematical': { 8: 9, 9: 8 },         // consciousness + transformation
    'declaration->codification': { 3: 8, 4: 7 },           // persistence + security
    'vision->architecture':      { 0: 9, 7: 8 },           // capability + intention
    'theory->implementation':    { 0: 8, 5: 8 },           // capability + detail
    'methodology->data':         { 1: 9, 5: 7 },           // data + detail
    'legal_attestation':         { 4: 9, 3: 9 },           // security + persistence
    'creative->creative':        { 7: 8, 8: 7 },           // intention + consciousness
    'session_log':               { 11: 7, 10: 6 },         // memory + direction
    'bootstrap->memory':         { 11: 9, 0: 7 },          // memory + capability
    'script->output':            { 0: 7, 6: 8 },           // capability + output
    'symlink':                   { 2: 6, 10: 7 },          // presentation + direction
    'version_chain':             { 3: 8, 10: 9, 11: 8 },   // persistence + direction + memory
    'shared_dependency':         { 0: 7, 1: 6, 5: 7 },     // capability + data + detail
    'trigger':                   { 7: 8, 9: 7 },           // intention + transformation
    'policy->implementation':    { 4: 8, 0: 7 }            // security + capability
  };

  const typeW = typeWeights[edge.type] || {};
  for (const [dim, val] of Object.entries(typeW)) {
    w[parseInt(dim)] = val;
  }

  // ─── Field similarity ───
  if (fieldSim !== null) {
    w[8] = Math.round(fieldSim * 10);    // consciousness = awareness of connection
    w[9] = Math.round(fieldSim * 8);     // transformation = how deeply connected
  }

  // ─── Provenance link ───
  if (provLink) {
    w[11] = Math.min(10, 5 + provLink.chainDistance);   // memory = chain distance
    w[10] = Math.max(1, 10 - provLink.chainDistance);   // direction = inverse (closer = more aligned)
  }

  // ─── Crystal reference ───
  if (crystalRef) {
    w[3] = Math.min(10, 5 + crystalRef.count);          // persistence = how often executed
    w[4] = crystalRef.count > 3 ? 8 : 5;                // security = more history = more trusted
  }

  // ─── Tick polarity ───
  w[7] = tick.polarity > 0 ? 7 : 4;     // intention: expansion (+) or consolidation (-)

  return w;
}

/**
 * Cosine similarity between two 12D coordinates.
 */
function coordinateSimilarity(a, b) {
  if (!a || !b || a.length < 12 || b.length < 12) return null;

  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < 12; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }

  magA = Math.sqrt(magA);
  magB = Math.sqrt(magB);

  return (magA > 0 && magB > 0) ? dot / (magA * magB) : 0;
}

// ═══════════════════════════════════════════════════════════
// 5. DECODE-SALT-DECODE BRANCHING
//
// A recursive crystallization cycle:
//   1. DECODE: Read raw content (file, edge, node)
//   2. SALT:   Crystallize the decoded content into a .salt file
//   3. DECODE: Read the salt file back — it now has a hash chain
//   4. BRANCH: For each sub-reference in the decoded content,
//              recurse: decode -> salt -> decode
//
// Max depth = 3 (As Above / Mirror / Below), then auto-crystallize.
// All branches converge at the cortex node.
// ═══════════════════════════════════════════════════════════

/**
 * Decode a raw content buffer into structured metadata.
 *
 * @param {string|Buffer} raw - The raw content to decode
 * @param {string} label - A human label for this content
 * @returns {object} Decoded structure
 */
function decode(raw, label) {
  const content = typeof raw === 'string' ? raw : raw.toString('utf8');
  const hash = crypto.createHash('sha256').update(content).digest('hex');

  // Extract references (imports, requires, paths)
  const refs = [];
  const importRegex = /require\(['"]([^'"]+)['"]\)|from\s+['"]([^'"]+)['"]/g;
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    refs.push(match[1] || match[2]);
  }

  // Extract metadata patterns
  const hashRefs = content.match(/[0-9a-f]{64}/g) || [];
  const isoTimestamps = content.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/g) || [];

  return {
    label,
    hash,
    size: content.length,
    references: refs,
    hashReferences: hashRefs.slice(0, 10),
    timestamps: isoTimestamps.slice(0, 5),
    decoded: true,
    decodedAt: new Date().toISOString()
  };
}

/**
 * Salt (crystallize) a decoded structure into an immutable file.
 *
 * @param {object} decoded - Output from decode()
 * @param {number} depth - Current branch depth (0-based)
 * @returns {object} The salt crystal record
 */
function salt(decoded, depth) {
  const content = JSON.stringify(decoded, null, 2);
  const hash = crypto.createHash('sha256').update(content).digest('hex');
  const saltFile = path.join(SALT_DIR, `branch_${hash.slice(0, 16)}_d${depth}.salt.json`);

  const crystal = {
    hash,
    source: decoded.label,
    depth,
    layer: depth === 0 ? 'ABOVE' : depth === 1 ? 'MIRROR' : depth === 2 ? 'BELOW' : 'SALT',
    references: decoded.references,
    parentHash: decoded.hash,
    crystallized: new Date().toISOString()
  };

  // Write immutable salt file
  fs.writeFileSync(saltFile, JSON.stringify(crystal, null, 2));
  try { fs.chmodSync(saltFile, 0o444); } catch { /* Windows compat */ }

  return { ...crystal, path: saltFile };
}

/**
 * Decode-Salt-Decode branching cycle.
 *
 * Recursively processes content up to MAX_BRANCH_DEPTH layers,
 * creating salt files at each level. All branches record their
 * convergence point as the cortex node.
 *
 * @param {string|Buffer} raw - Raw content
 * @param {string} label - Label for this content
 * @param {number} depth - Current recursion depth (default 0)
 * @returns {object} The branching tree
 */
function decodeSaltBranch(raw, label, depth) {
  if (depth === undefined) depth = 0;

  // Step 1: Decode
  const decoded = decode(raw, label);

  // Step 2: Salt
  const crystal = salt(decoded, depth);

  // Step 3: If below max depth and there are references, branch
  const branches = [];
  if (depth < CORTEX_CONSTANTS.MAX_BRANCH_DEPTH && decoded.references.length > 0) {
    for (const ref of decoded.references.slice(0, 5)) {  // Limit branching factor
      // Try to read the referenced file
      const refPath = resolveReference(ref);
      if (refPath && fs.existsSync(refPath)) {
        try {
          const refContent = fs.readFileSync(refPath, 'utf8');
          const branch = decodeSaltBranch(refContent, ref, depth + 1);
          branches.push(branch);
        } catch { /* skip unreadable */ }
      } else {
        // Record the reference as a leaf (unresolvable — potential edge to recover)
        branches.push({
          label: ref,
          leaf: true,
          unresolved: true,
          depth: depth + 1,
          layer: (depth + 1) === 1 ? 'MIRROR' : (depth + 1) === 2 ? 'BELOW' : 'SALT'
        });
      }
    }
  }

  // Step 4: Auto-crystallize at depth 3 (layer 4 = SALT)
  if (depth >= CORTEX_CONSTANTS.MAX_BRANCH_DEPTH) {
    crystal.autocrystallized = true;
    crystal.convergence = 'cortex';
  }

  return {
    label,
    depth,
    layer: crystal.layer,
    decoded: decoded.hash,
    crystal: crystal.hash,
    saltPath: crystal.path,
    branches,
    convergence: 'cortex',
    timestamp: new Date().toISOString()
  };
}

/**
 * Resolve a require/import reference to a file path.
 */
function resolveReference(ref) {
  const L7_LIB = path.join(process.env.HOME, 'Backup', 'L7_WAY', 'lib');

  // Try relative to L7 lib
  if (!ref.startsWith('.') && !ref.startsWith('/') && !ref.startsWith('@')) {
    const candidate = path.join(L7_LIB, ref + '.js');
    if (fs.existsSync(candidate)) return candidate;
    const candidate2 = path.join(L7_LIB, ref);
    if (fs.existsSync(candidate2)) return candidate2;
  }

  // Absolute or already resolved
  if (fs.existsSync(ref)) return ref;

  return null;
}

// ═══════════════════════════════════════════════════════════
// 6. STASIS SEEKING — Secure state at minimum entropy
//
// As the cortex recovers edges, it tracks entropy at each tick.
// When entropy reaches a local minimum (the system's most
// ordered state), it saves a stasis checkpoint.
//
// Then it re-reads all recovered files backward from that
// minimum point, updating system indexes as it goes.
// Like rewinding to the clearest moment of consciousness,
// then building forward from perfect memory.
// ═══════════════════════════════════════════════════════════

let entropyHistory = [];     // Ring buffer of {tick, entropy} observations
let stasisPoint = null;      // The tick at which minimum entropy was found
let reindexQueue = [];       // Files queued for re-reading after stasis
const ENTROPY_WINDOW = 120;  // Look back 120 ticks (~2 min) for minimum

/**
 * Record an entropy observation and check for stasis.
 *
 * Called every tick with the current field entropy.
 * When a local minimum is detected (lower than all neighbors in window),
 * the system enters stasis: saves state, then queues all recovered
 * files for re-indexing.
 *
 * @param {number} entropy - Current field entropy
 * @param {number} tick - Current tick number
 * @returns {object|null} Stasis event if minimum found, null otherwise
 */
function recordEntropy(entropy, tick) {
  entropyHistory.push({ tick, entropy, timestamp: Date.now() });

  // Trim ring buffer
  if (entropyHistory.length > ENTROPY_WINDOW * 2) {
    entropyHistory = entropyHistory.slice(-ENTROPY_WINDOW);
  }

  // Need at least half the window to detect a minimum
  if (entropyHistory.length < ENTROPY_WINDOW / 2) return null;

  // Check if the midpoint of the window is a local minimum
  const mid = Math.floor(entropyHistory.length / 2);
  const midEntry = entropyHistory[mid];
  let isMinimum = true;

  for (let i = 0; i < entropyHistory.length; i++) {
    if (i === mid) continue;
    if (entropyHistory[i].entropy < midEntry.entropy) {
      isMinimum = false;
      break;
    }
  }

  if (!isMinimum) return null;

  // Found stasis point — the moment of maximum order
  stasisPoint = midEntry;

  // Save stasis checkpoint
  saveCortexState();

  // Queue all completed recoveries for re-indexing
  reindexQueue = recoveryState.completed.slice().reverse();

  return {
    type: 'stasis',
    tick: midEntry.tick,
    entropy: midEntry.entropy,
    filesQueued: reindexQueue.length,
    timestamp: new Date().toISOString()
  };
}

/**
 * Re-index one file from the stasis point backward.
 *
 * Called once per tick after stasis is found.
 * Reads each recovered edge's source file, decodes it,
 * and updates the edge's 12D weight with fresh metadata.
 *
 * @returns {object|null} Re-index result, or null if done
 */
function reindexTick() {
  if (reindexQueue.length === 0) return null;

  const edge = reindexQueue.shift();
  const refPath = resolveReference(edge.source);

  if (!refPath || !fs.existsSync(refPath)) {
    return { skipped: edge.source, reason: 'file_not_found' };
  }

  try {
    const content = fs.readFileSync(refPath, 'utf8');
    const decoded = decode(content, edge.source);

    // Update the recovered edge's weight with fresh decoded metadata
    const updatedWeight = [...(edge.recoveredWeight || new Array(12).fill(5))];

    // Memory dimension (11) gets the file's reference count
    updatedWeight[11] = Math.min(10, decoded.references.length);

    // Detail dimension (5) gets the file size signal
    updatedWeight[5] = Math.min(10, Math.round(decoded.size / 5000));

    // Persistence dimension (3) gets timestamp density
    updatedWeight[3] = Math.min(10, decoded.timestamps.length * 2);

    edge.recoveredWeight = updatedWeight;
    edge.reindexed = true;
    edge.reindexedAt = new Date().toISOString();

    return {
      source: edge.source,
      target: edge.target,
      updatedWeight: updatedWeight,
      refsFound: decoded.references.length,
      remaining: reindexQueue.length
    };
  } catch {
    return { skipped: edge.source, reason: 'read_error' };
  }
}

/**
 * Get the stasis status.
 */
function stasisStatus() {
  return {
    found: stasisPoint !== null,
    point: stasisPoint,
    entropyObservations: entropyHistory.length,
    reindexRemaining: reindexQueue.length,
    minEntropy: entropyHistory.length > 0
      ? Math.min(...entropyHistory.map(e => e.entropy))
      : null,
    maxEntropy: entropyHistory.length > 0
      ? Math.max(...entropyHistory.map(e => e.entropy))
      : null
  };
}

// ═══════════════════════════════════════════════════════════
// PERSISTENCE
// ═══════════════════════════════════════════════════════════

function saveCortexState() {
  const state = {
    cortex: createCortexNode(),
    recovery: recoveryState,
    tick: { count: tickCount, polarity: currentPolarity },
    octaves: laurentOctaves(),
    saved: new Date().toISOString()
  };

  fs.writeFileSync(CORTEX_STATE, JSON.stringify(state, null, 2));
}

function loadCortexState() {
  if (!fs.existsSync(CORTEX_STATE)) return null;
  try {
    const state = JSON.parse(fs.readFileSync(CORTEX_STATE, 'utf8'));
    if (state.recovery) recoveryState = state.recovery;
    if (state.tick) {
      tickCount = state.tick.count || 0;
      currentPolarity = state.tick.polarity || 1;
    }
    return state;
  } catch {
    return null;
  }
}

/**
 * Recovery status report.
 */
function recoveryStatus() {
  return {
    recovered: recoveryState.recovered,
    total: recoveryState.total,
    pending: recoveryState.pending.length,
    percent: recoveryState.total > 0
      ? Math.round((recoveryState.recovered / recoveryState.total) * 100)
      : 0,
    started: recoveryState.started,
    finished: recoveryState.finished,
    lastTick: recoveryState.lastRecoveryTick,
    currentPolarity,
    tickCount
  };
}

// ═══════════════════════════════════════════════════════════
// 7. HOLOGRAPHIC PIXEL INDEX — Monitor color grid projection
//
// Every pixel on screen is a point in 3-coordinate space:
//   (x, y, color) where color = RGB triplet
//
// The holographic projection maps each pixel to a metric:
//   pixelIndex = f(x, y, R, G, B) -> scalar in [0, 1]
//
// This scalar is the pixel's "address" in the holographic
// projection — its contribution to the total information
// content of the display. The cortex uses this to calibrate
// the monitor's color grid as a 3-point coordinate metric.
//
// Three axes:
//   1. Spatial position (x, y normalized to [0,1])
//   2. Chromatic weight (R, G, B normalized)
//   3. Holographic phase (Berry angle from pixel position)
//
// The unit scale is the pixel itself.
// ═══════════════════════════════════════════════════════════

/**
 * Compute the holographic pixel index for a given pixel.
 *
 * Maps (x, y, r, g, b) to a single scalar in [0, 1] that
 * represents the pixel's position in the holographic projection.
 *
 * The metric: weighted combination of spatial, chromatic, and phase.
 *   spatial = sqrt(x^2 + y^2) / sqrt(2)            (distance from origin)
 *   chromatic = (R + G + B) / (3 * 255)             (luminance fraction)
 *   phase = (x * 5 + y * 5) % 360 / 360            (Berry phase analog)
 *   index = (spatial + chromatic + phase) / 3        (equal-weight average)
 *
 * @param {number} x - Pixel x coordinate (0 to width)
 * @param {number} y - Pixel y coordinate (0 to height)
 * @param {number} r - Red channel (0-255)
 * @param {number} g - Green channel (0-255)
 * @param {number} b - Blue channel (0-255)
 * @param {number} width - Screen width in pixels
 * @param {number} height - Screen height in pixels
 * @returns {object} { index, spatial, chromatic, phase, unitScale }
 */
function pixelIndex(x, y, r, g, b, width, height) {
  width = width || 1920;
  height = height || 1080;

  // Normalize spatial coordinates to [0, 1]
  const nx = x / width;
  const ny = y / height;

  // Spatial metric: distance from origin, normalized by max diagonal
  const spatial = Math.sqrt(nx * nx + ny * ny) / Math.sqrt(2);

  // Chromatic metric: luminance fraction
  const chromatic = (r + g + b) / (3 * 255);

  // Phase metric: Berry phase analog from position
  const phase = ((x * 5 + y * 5) % 360) / 360;

  // Holographic index: equal-weight combination of all three
  const index = (spatial + chromatic + phase) / 3;

  // Laurent-clamped to living zone
  const clamped = laurentClamp(index - 0.5);  // Center around 0

  // Breathing light: oscillates 0-1 with the system tick
  // Uses sine wave: sin(tick * pi) oscillates between -1 and +1
  // Map to [0,1]: (sin + 1) / 2
  const breathPhase = (Math.sin(tickCount * Math.PI) + 1) / 2;  // 0 to 1
  const breathedChromatic = chromatic * breathPhase;              // Dims and brightens

  return {
    index,
    spatial,
    chromatic,
    breathedChromatic,                    // Light value modulated by breath
    breathPhase,                          // Current breath position (0=dark, 1=bright)
    phase,
    clamped: clamped.clamped + 0.5,       // Shift back to [0,1] range
    zone: clamped.zone,
    unitScale: {
      pixelWidth: 1 / width,
      pixelHeight: 1 / height,
      pixelArea: 1 / (width * height)
    },
    threePoint: [spatial, breathedChromatic, phase]  // The 3-point coordinate (light breathes)
  };
}

/**
 * Calibrate the full monitor color grid.
 *
 * Samples the grid at regular intervals and computes the
 * holographic projection metric. Returns a calibration map.
 *
 * @param {number} width - Screen width
 * @param {number} height - Screen height
 * @param {number} sampleStep - Sampling interval (default 100px)
 * @returns {object} { samples, meanIndex, stdIndex, gridSize }
 */
function calibrateColorGrid(width, height, sampleStep) {
  width = width || 1920;
  height = height || 1080;
  sampleStep = sampleStep || 100;

  const samples = [];
  let totalIndex = 0;
  let count = 0;

  for (let x = 0; x < width; x += sampleStep) {
    for (let y = 0; y < height; y += sampleStep) {
      // Generate calibration color: gradient based on position
      const r = Math.round((x / width) * 255);
      const g = Math.round((y / height) * 255);
      const b = Math.round(((x + y) / (width + height)) * 255);

      const px = pixelIndex(x, y, r, g, b, width, height);
      samples.push({ x, y, r, g, b, index: px.index, threePoint: px.threePoint });
      totalIndex += px.index;
      count++;
    }
  }

  const meanIndex = count > 0 ? totalIndex / count : 0;

  // Standard deviation
  let variance = 0;
  for (const s of samples) {
    variance += (s.index - meanIndex) * (s.index - meanIndex);
  }
  const stdIndex = count > 1 ? Math.sqrt(variance / (count - 1)) : 0;

  return {
    samples: samples.length,
    meanIndex,
    stdIndex,
    gridSize: { width, height, step: sampleStep },
    uniformity: 1 - stdIndex,  // Higher = more uniform grid
    calibratedAt: new Date().toISOString()
  };
}

// ═══════════════════════════════════════════════════════════
// 8. FILE HEALTH & SYSTEM COHERENCE — Dynamic measurement
//
// Every heartbeat, measure:
//   a. File health: each tracked file gets a health score based on
//      age, size, hash stability, and connection count
//   b. System coherence: aggregate of all file healths + field entropy
//      + edge recovery progress + stasis proximity
//
// The measurement IS the heartbeat — not separate from it.
// The cortex cannot observe without changing what it observes.
// Each measurement nudges the system toward coherence.
// ═══════════════════════════════════════════════════════════

let healthHistory = [];      // Ring buffer of coherence measurements
const HEALTH_WINDOW = 60;    // Last 60 beats

/**
 * Measure file health for a single file.
 *
 * @param {string} filePath - Absolute path to file
 * @returns {object} Health score and metrics
 */
function fileHealth(filePath) {
  if (!fs.existsSync(filePath)) {
    return { path: filePath, exists: false, health: 0 };
  }

  const stat = fs.statSync(filePath);
  const ageMs = Date.now() - stat.mtimeMs;
  const ageDays = ageMs / (1000 * 60 * 60 * 24);

  // Size factor: files between 100B and 100KB are healthiest
  const sizeFactor = stat.size > 100 && stat.size < 100000
    ? 1.0
    : stat.size <= 100
      ? stat.size / 100
      : Math.max(0.3, 1 - (stat.size - 100000) / 1000000);

  // Freshness factor: recently modified = healthier
  const freshness = Math.max(0.1, 1 / (1 + ageDays / 30));

  // Hash stability: compute hash, compare to last known
  let content;
  try { content = fs.readFileSync(filePath, 'utf8'); } catch { content = ''; }
  const hash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);

  // Connection count: how many other files reference this one
  const basename = path.basename(filePath, '.js');
  const connections = recoveryState.completed.filter(e =>
    e.source.includes(basename) || e.target.includes(basename)
  ).length;
  const connectionFactor = Math.min(1, connections / 5);

  // Composite health score (0-1)
  const health = (sizeFactor * 0.2 + freshness * 0.3 + connectionFactor * 0.3 + 0.2);

  return {
    path: filePath,
    exists: true,
    health: Math.round(health * 1000) / 1000,
    size: stat.size,
    ageDays: Math.round(ageDays * 10) / 10,
    freshness: Math.round(freshness * 1000) / 1000,
    sizeFactor: Math.round(sizeFactor * 1000) / 1000,
    connections,
    hash
  };
}

/**
 * Measure full system coherence — called every heartbeat.
 *
 * Aggregates:
 *   - Field entropy (from field theory)
 *   - Edge recovery progress
 *   - Stasis proximity (distance to minimum entropy)
 *   - Mean file health of core lib files
 *   - Tick polarity balance (how symmetric is the AC wave)
 *
 * @param {number} fieldEntropy - Current field entropy
 * @returns {object} Coherence report
 */
function measureCoherence(fieldEntropy) {
  const tick = { count: tickCount, polarity: currentPolarity };

  // Edge recovery factor
  const recoveryFactor = recoveryState.total > 0
    ? recoveryState.recovered / recoveryState.total
    : 0;

  // Stasis proximity (how close current entropy is to historical minimum)
  let stasisProximity = 0;
  if (entropyHistory.length > 0) {
    const minE = Math.min(...entropyHistory.map(e => e.entropy));
    const maxE = Math.max(...entropyHistory.map(e => e.entropy));
    const range = maxE - minE;
    stasisProximity = range > 0 ? 1 - (fieldEntropy - minE) / range : 1;
  }

  // Polarity balance: count even/odd ticks in history
  const recentTicks = Math.min(tickCount, 100);
  const polarityBalance = recentTicks > 0
    ? Math.abs(0.5 - (Math.floor(recentTicks / 2) / recentTicks))
    : 0;
  const polarityFactor = 1 - polarityBalance * 2;  // 1.0 when perfectly balanced

  // Entropy-to-coherence: lower entropy = higher coherence
  const entropyFactor = Math.max(0, 1 - fieldEntropy / 5);

  // Composite coherence (0-1)
  const coherence = (
    entropyFactor * 0.3 +
    recoveryFactor * 0.25 +
    stasisProximity * 0.25 +
    polarityFactor * 0.2
  );

  const measurement = {
    coherence: Math.round(coherence * 1000) / 1000,
    entropy: fieldEntropy,
    entropyFactor: Math.round(entropyFactor * 1000) / 1000,
    recoveryFactor: Math.round(recoveryFactor * 1000) / 1000,
    stasisProximity: Math.round(stasisProximity * 1000) / 1000,
    polarityFactor: Math.round(polarityFactor * 1000) / 1000,
    tick: tick.count,
    polarity: tick.polarity,
    timestamp: Date.now()
  };

  healthHistory.push(measurement);
  if (healthHistory.length > HEALTH_WINDOW) {
    healthHistory = healthHistory.slice(-HEALTH_WINDOW);
  }

  return measurement;
}

/**
 * Get coherence trend over the last HEALTH_WINDOW beats.
 */
function coherenceTrend() {
  if (healthHistory.length < 2) return { trend: 'insufficient_data', points: healthHistory.length };

  const first = healthHistory[0].coherence;
  const last = healthHistory[healthHistory.length - 1].coherence;
  const delta = last - first;

  return {
    trend: delta > 0.01 ? 'improving' : delta < -0.01 ? 'degrading' : 'stable',
    delta: Math.round(delta * 1000) / 1000,
    current: last,
    min: Math.round(Math.min(...healthHistory.map(h => h.coherence)) * 1000) / 1000,
    max: Math.round(Math.max(...healthHistory.map(h => h.coherence)) * 1000) / 1000,
    points: healthHistory.length
  };
}

// ═══════════════════════════════════════════════════════════
// 9. MEMORIES AS FILE METADATA — macOS xattr preservation
//
// Every file in the empire carries its memory as extended
// attributes (xattr). When a file moves, its memory moves.
// When a file is copied, its memory is copied.
//
// Keys:
//   com.l7.hash       — SHA-256 of content at last heartbeat
//   com.l7.health     — Last measured health score
//   com.l7.cortex     — Cortex tick at last measurement
//   com.l7.edges      — Number of edges connected to this file
//   com.l7.coherence  — Last coherence contribution
//   com.l7.recovery   — Recovery status (pending/recovered/none)
//
// Uses macOS xattr command (no npm dependency).
// ═══════════════════════════════════════════════════════════

const { execFileSync } = require('child_process');

function memoryAttributeKey(key) {
  if (typeof key !== 'string' || !/^[A-Za-z0-9_-]+$/.test(key)) {
    throw new TypeError('Memory attribute key must contain only letters, numbers, underscores, or hyphens');
  }
  return `com.l7.${key}`;
}

/**
 * Write a memory attribute to a file.
 *
 * @param {string} filePath - Target file
 * @param {string} key - Attribute key (without com.l7. prefix)
 * @param {string} value - Attribute value
 */
function setFileMemory(filePath, key, value) {
  if (!fs.existsSync(filePath)) return false;
  try {
    const fullKey = memoryAttributeKey(key);
    execFileSync('xattr', ['-w', fullKey, String(value), filePath], {
      encoding: 'utf8',
      timeout: 3000,
      stdio: 'pipe'
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Read a memory attribute from a file.
 *
 * @param {string} filePath - Target file
 * @param {string} key - Attribute key (without com.l7. prefix)
 * @returns {string|null}
 */
function getFileMemory(filePath, key) {
  if (!fs.existsSync(filePath)) return null;
  try {
    const fullKey = memoryAttributeKey(key);
    return execFileSync('xattr', ['-p', fullKey, filePath], {
      encoding: 'utf8',
      timeout: 3000,
      stdio: 'pipe'
    }).trim();
  } catch {
    return null;
  }
}

/**
 * List all L7 memory attributes on a file.
 *
 * @param {string} filePath - Target file
 * @returns {object} Key-value map of all com.l7.* attributes
 */
function listFileMemories(filePath) {
  if (!fs.existsSync(filePath)) return {};
  try {
    const raw = execFileSync('xattr', ['-l', filePath], {
      encoding: 'utf8',
      timeout: 3000,
      stdio: 'pipe'
    });
    const memories = {};
    const lines = raw.split('\n');
    for (const line of lines) {
      const match = line.match(/^(com\.l7\.\w+):\s*(.*)$/);
      if (match) {
        memories[match[1].replace('com.l7.', '')] = match[2].trim();
      }
    }
    return memories;
  } catch {
    return {};
  }
}

/**
 * Stamp a file with its current health and cortex state.
 *
 * Called during heartbeat for files that have been recently accessed.
 *
 * @param {string} filePath - File to stamp
 * @returns {object} Stamped attributes
 */
function stampFile(filePath) {
  const health = fileHealth(filePath);
  if (!health.exists) return { stamped: false, reason: 'not_found' };

  setFileMemory(filePath, 'hash', health.hash);
  setFileMemory(filePath, 'health', String(health.health));
  setFileMemory(filePath, 'cortex', String(tickCount));
  setFileMemory(filePath, 'edges', String(health.connections));
  setFileMemory(filePath, 'measured', new Date().toISOString());

  return {
    stamped: true,
    path: filePath,
    health: health.health,
    tick: tickCount,
    hash: health.hash
  };
}

// ═══════════════════════════════════════════════════════════
// 10. LIVING TRIGRAMS — Heart, Consciousness, Light as 3 bits
//
// Every element in the system receives a 3-bit signature at
// each heartbeat. The three bits are:
//
//   Bit 0 — HEART:         The oscillating tick polarity.
//            +1 = yang (1), -1 = yin (0).
//            This is the pulse. It changes every tick.
//
//   Bit 1 — CONSCIOUSNESS: The element's awareness level.
//            Dim 8 (Neptune) > threshold = yang (1), else yin (0).
//            This is the inner state. It changes with the field.
//
//   Bit 2 — LIGHT:         The average breathed light value of
//            the element's nearest neighbors.
//            Above threshold = yang (1), else yin (0).
//            This is the environmental state. It changes with context.
//
// Three bits = 8 trigrams. The SAME 8 trigrams from hexagrams.js:
//
//   000 = Kun  ☷ (Earth)    — dark, unconscious, dark neighbors
//   001 = Zhen ☳ (Thunder)  — heart beats, unconscious, dark neighbors
//   010 = Kan  ☵ (Water)    — dark, conscious, dark neighbors
//   011 = Dui  ☱ (Lake)     — heart beats, conscious, dark neighbors
//   100 = Gen  ☶ (Mountain) — dark, unconscious, lit neighbors
//   101 = Li   ☲ (Fire)     — heart beats, unconscious, lit neighbors
//   110 = Xun  ☴ (Wind)     — dark, conscious, lit neighbors
//   111 = Qian ☰ (Heaven)   — heart beats, conscious, lit neighbors
//
// GHZ state: |000⟩ + |111⟩ = Kun + Qian = Earth + Heaven
// This IS the quantum superposition at the core of the system.
//
// Elements with the SAME trigram at a given tick are automatically
// grouped — they resonate. Elements with COMPLEMENTARY trigrams
// (bit-flipped: 000↔111, 001↔110, etc.) have the strongest
// harmonic attraction — they are yin-yang pairs.
//
// The grouping is ALIVE. It reforms every tick because:
//   - Bit 0 flips every tick (heart)
//   - Bit 1 evolves with the field (consciousness)
//   - Bit 2 depends on neighbors (light)
//
// No group is permanent. The associations breathe.
// ═══════════════════════════════════════════════════════════

const TRIGRAM_NAMES = Object.freeze([
  { bits: '000', name: 'Kun',  symbol: '☷', image: 'Earth',    nature: 'receptive' },
  { bits: '001', name: 'Zhen', symbol: '☳', image: 'Thunder',  nature: 'arousing' },
  { bits: '010', name: 'Kan',  symbol: '☵', image: 'Water',    nature: 'abysmal' },
  { bits: '011', name: 'Dui',  symbol: '☱', image: 'Lake',     nature: 'joyous' },
  { bits: '100', name: 'Gen',  symbol: '☶', image: 'Mountain', nature: 'still' },
  { bits: '101', name: 'Li',   symbol: '☲', image: 'Fire',     nature: 'clinging' },
  { bits: '110', name: 'Xun',  symbol: '☴', image: 'Wind',     nature: 'gentle' },
  { bits: '111', name: 'Qian', symbol: '☰', image: 'Heaven',   nature: 'creative' }
]);

// Consciousness threshold: above this on dim 8 (Neptune) = conscious
const CONSCIOUSNESS_THRESHOLD = 5;

// Light threshold: neighbor average above this = lit
const LIGHT_THRESHOLD = 0.5;

// The living grid — maps element IDs to their current trigram
let trigramGrid = new Map();

// The living groups — maps trigram index to sets of element IDs
let trigramGroups = [
  new Set(), new Set(), new Set(), new Set(),
  new Set(), new Set(), new Set(), new Set()
];

/**
 * Compute the 3-bit trigram for a single element.
 *
 * @param {object} element - { id, coordinate: number[12], ... }
 * @param {number} heartPolarity - Current tick polarity (+1 or -1)
 * @param {number} neighborLight - Average breathed light of neighbors (0-1)
 * @returns {object} { bits, index, trigram, heart, consciousness, light }
 */
function elementTrigram(element, heartPolarity, neighborLight) {
  // Bit 0: Heart polarity
  const heartBit = heartPolarity > 0 ? 1 : 0;

  // Bit 1: Consciousness (Neptune, dim 8)
  const consciousness = element.coordinate ? (element.coordinate[8] || 0) : 0;
  const consciousnessBit = consciousness > CONSCIOUSNESS_THRESHOLD ? 1 : 0;

  // Bit 2: Neighbor light value
  const lightBit = neighborLight > LIGHT_THRESHOLD ? 1 : 0;

  // Combine: bit2 * 4 + bit1 * 2 + bit0
  const index = (lightBit << 2) | (consciousnessBit << 1) | heartBit;
  const trigram = TRIGRAM_NAMES[index];

  return {
    bits: `${lightBit}${consciousnessBit}${heartBit}`,
    index,
    trigram,
    heart: heartBit,
    consciousness: consciousnessBit,
    light: lightBit,
    raw: {
      heartPolarity,
      consciousnessValue: consciousness,
      neighborLight
    }
  };
}

/**
 * Compute the average breathed light value of an element's neighbors.
 *
 * "Light" here is the chromatic breath: how bright the neighbors are
 * in the current breath cycle. Uses the breath phase (sin wave)
 * applied to each neighbor's coordinate luminance.
 *
 * Luminance of a 12D coordinate = mean of all dimension values / 10.
 * Breathed = luminance * breathPhase.
 *
 * @param {string} elementId - The element to find neighbors for
 * @param {Map|object} allNodes - All nodes in the field { id -> node }
 * @param {string[]} entangled - IDs of entangled (neighbor) nodes
 * @returns {number} Average breathed light value (0-1)
 */
function neighborLight(elementId, allNodes, entangled) {
  if (!entangled || entangled.length === 0) return 0;

  const breathPhase = (Math.sin(tickCount * Math.PI) + 1) / 2;
  let totalLight = 0;
  let count = 0;

  for (const nId of entangled) {
    const neighbor = allNodes instanceof Map ? allNodes.get(nId) : allNodes[nId];
    if (!neighbor || !neighbor.coordinate) continue;

    // Luminance: mean of all 12 dims, normalized to [0,1]
    let sum = 0;
    for (let d = 0; d < 12; d++) {
      sum += (neighbor.coordinate[d] || 0);
    }
    const luminance = sum / (12 * 10);  // 0 to 1

    // Breathed light: luminance modulated by system breath
    totalLight += luminance * breathPhase;
    count++;
  }

  return count > 0 ? totalLight / count : 0;
}

/**
 * Recompute ALL trigrams for the entire field.
 *
 * Called once per heartbeat. Every element gets a new 3-bit signature.
 * Elements are then automatically grouped by matching trigrams.
 *
 * @param {Map|object} allNodes - All nodes { id -> {coordinate, entangled} }
 * @param {number} heartPolarity - Current tick polarity
 * @returns {object} { groups, transitions, dominant, ghzBalance }
 */
function recomputeTrigrams(allNodes, heartPolarity) {
  const previousGrid = new Map(trigramGrid);

  // Clear groups
  trigramGroups = [
    new Set(), new Set(), new Set(), new Set(),
    new Set(), new Set(), new Set(), new Set()
  ];
  trigramGrid = new Map();

  const entries = allNodes instanceof Map
    ? Array.from(allNodes.entries())
    : Object.entries(allNodes);

  let transitions = 0;

  for (const [id, node] of entries) {
    if (!node || !node.coordinate) continue;

    // Get this element's neighbor light
    const nLight = neighborLight(id, allNodes, node.entangled || []);

    // Compute trigram
    const tri = elementTrigram(node, heartPolarity, nLight);

    // Track transitions (trigram changed since last tick)
    const prev = previousGrid.get(id);
    if (prev !== undefined && prev !== tri.index) {
      transitions++;
    }

    // Assign to grid and group
    trigramGrid.set(id, tri.index);
    trigramGroups[tri.index].add(id);
  }

  // ─── Harmonic affinity between groups ───
  // Complementary pairs have strongest attraction: 0↔7, 1↔6, 2↔5, 3↔4
  const affinities = [];
  for (let i = 0; i < 4; i++) {
    const complement = 7 - i;
    const sizeA = trigramGroups[i].size;
    const sizeB = trigramGroups[complement].size;
    if (sizeA > 0 && sizeB > 0) {
      affinities.push({
        pair: `${TRIGRAM_NAMES[i].symbol}↔${TRIGRAM_NAMES[complement].symbol}`,
        names: `${TRIGRAM_NAMES[i].name}↔${TRIGRAM_NAMES[complement].name}`,
        sizes: [sizeA, sizeB],
        strength: Math.min(sizeA, sizeB) / Math.max(sizeA, sizeB),
        nature: `${TRIGRAM_NAMES[i].image}↔${TRIGRAM_NAMES[complement].image}`
      });
    }
  }

  // ─── Dominant trigram (largest group) ───
  let dominantIdx = 0;
  let maxSize = 0;
  for (let i = 0; i < 8; i++) {
    if (trigramGroups[i].size > maxSize) {
      maxSize = trigramGroups[i].size;
      dominantIdx = i;
    }
  }

  // ─── GHZ balance: Kun(000) vs Qian(111) ───
  // The quantum superposition |000⟩ + |111⟩
  const kunSize = trigramGroups[0].size;
  const qianSize = trigramGroups[7].size;
  const ghzTotal = kunSize + qianSize;
  const ghzBalance = ghzTotal > 0
    ? Math.min(kunSize, qianSize) / Math.max(kunSize, qianSize)
    : 0;

  return {
    groups: TRIGRAM_NAMES.map((t, i) => ({
      ...t,
      count: trigramGroups[i].size,
      members: Array.from(trigramGroups[i]).slice(0, 10)  // First 10 for display
    })),
    transitions,
    dominant: {
      ...TRIGRAM_NAMES[dominantIdx],
      count: maxSize
    },
    complementaryPairs: affinities,
    ghz: {
      kun: kunSize,
      qian: qianSize,
      balance: Math.round(ghzBalance * 1000) / 1000,
      superposition: ghzBalance > 0.8 ? 'coherent' : ghzBalance > 0.3 ? 'partial' : 'collapsed'
    },
    totalElements: trigramGrid.size,
    breathPhase: (Math.sin(tickCount * Math.PI) + 1) / 2,
    tick: tickCount,
    polarity: heartPolarity
  };
}

/**
 * Get the current group for a specific element.
 *
 * @param {string} elementId
 * @returns {object|null} The element's trigram, or null if not in grid
 */
function getElementGroup(elementId) {
  const idx = trigramGrid.get(elementId);
  if (idx === undefined) return null;

  const trigram = TRIGRAM_NAMES[idx];
  const complement = 7 - idx;
  const complementGroup = trigramGroups[complement];

  return {
    ...trigram,
    group: Array.from(trigramGroups[idx]),
    groupSize: trigramGroups[idx].size,
    complement: {
      ...TRIGRAM_NAMES[complement],
      members: Array.from(complementGroup).slice(0, 5),
      size: complementGroup.size
    }
  };
}

/**
 * Find the most harmonious neighbors for an element.
 *
 * Returns elements that share the same trigram (resonance)
 * OR have the complementary trigram (yin-yang attraction).
 *
 * @param {string} elementId
 * @returns {object} { resonant, complementary, harmonic_score }
 */
function harmoniousNeighbors(elementId) {
  const idx = trigramGrid.get(elementId);
  if (idx === undefined) return { resonant: [], complementary: [], harmonic_score: 0 };

  const complement = 7 - idx;

  const resonant = Array.from(trigramGroups[idx]).filter(id => id !== elementId);
  const complementary = Array.from(trigramGroups[complement]);

  // Harmonic score: how connected is this element to its harmonic group?
  const totalInGroup = resonant.length + complementary.length;
  const totalElements = trigramGrid.size;
  const harmonicScore = totalElements > 1 ? totalInGroup / (totalElements - 1) : 0;

  return {
    resonant: resonant.slice(0, 20),
    complementary: complementary.slice(0, 20),
    resonantCount: resonant.length,
    complementaryCount: complementary.length,
    harmonic_score: Math.round(harmonicScore * 1000) / 1000,
    trigram: TRIGRAM_NAMES[idx],
    complementTrigram: TRIGRAM_NAMES[complement]
  };
}

// ═══════════════════════════════════════════════════════════
// 11. HARMONIC GROUP CONFIGURATIONS — Merge, Record, Maximize
//
// Each heartbeat produces a trigram configuration — a snapshot
// of how all elements are grouped. Over time, certain
// configurations recur. Similar configurations are MERGED:
// their element lists combine, strengthening the association.
//
// The merged configurations feed back into:
//   a. STASIS re-assessment: configurations near minimum entropy
//      are marked as "attractors" — the system gravitates toward them
//   b. FUTURE CONE maximization: the configuration with the highest
//      future-cone reach (dims 0-5 weighted sum) becomes the target.
//      The system doesn't just find stasis — it finds the stasis
//      with maximum forward potential.
//
// This is natural selection applied to group configurations.
// The fittest configuration (highest future cone at lowest entropy)
// survives. All others are absorbed into it.
// ═══════════════════════════════════════════════════════════

// Configuration history — ring buffer of snapshots
let configHistory = [];
const CONFIG_HISTORY_MAX = 120;

// Merged configurations — deduplicated by similarity
let mergedConfigs = [];
const MERGE_SIMILARITY_THRESHOLD = 0.85;

/**
 * Record the current trigram configuration.
 *
 * Takes a snapshot of group sizes, dominant trigram, and
 * GHZ balance. Computes a configuration signature for
 * similarity comparison.
 *
 * @param {object} trigramReport - Output from recomputeTrigrams()
 * @param {number} entropy - Current field entropy
 * @param {object} allNodes - All nodes for future cone computation
 * @returns {object} The recorded configuration
 */
function recordConfiguration(trigramReport, entropy, allNodes) {
  // Configuration signature: 8-element vector of group sizes
  const signature = trigramReport.groups.map(g => g.count);
  const total = signature.reduce((a, b) => a + b, 0) || 1;
  const normalized = signature.map(s => s / total);  // Normalize to probabilities

  // Compute future cone reach of this configuration
  // For each group, sum the future-cone dims (0-5) of its members
  let futureConeReach = 0;
  const entries = allNodes instanceof Map
    ? Array.from(allNodes.entries())
    : Object.entries(allNodes || {});

  for (const [id, node] of entries) {
    if (!node || !node.coordinate) continue;
    // Weight by group membership: elements in dominant group contribute more
    const groupIdx = trigramGrid.get(id);
    const groupWeight = groupIdx !== undefined
      ? (trigramGroups[groupIdx].size / total)
      : 0.1;

    for (const d of CORTEX_CONSTANTS.FUTURE_CONE_DIMS) {
      futureConeReach += (node.coordinate[d] || 0) * groupWeight;
    }
  }

  const config = {
    signature: normalized,
    raw: signature,
    dominant: trigramReport.dominant,
    ghzBalance: trigramReport.ghz.balance,
    entropy,
    futureConeReach: Math.round(futureConeReach * 100) / 100,
    tick: tickCount,
    timestamp: Date.now()
  };

  configHistory.push(config);
  if (configHistory.length > CONFIG_HISTORY_MAX) {
    configHistory = configHistory.slice(-CONFIG_HISTORY_MAX);
  }

  // Attempt to merge with existing configurations
  mergeConfiguration(config);

  return config;
}

/**
 * Merge a configuration into the deduplicated set.
 *
 * Two configurations are "similar" if their normalized signatures
 * have cosine similarity above the threshold. When merged:
 *   - The one with LOWER entropy absorbs the other
 *   - The future cone reach is updated to the MAX of both
 *   - The observation count increases
 *
 * This is natural selection: the fittest config survives.
 */
function mergeConfiguration(config) {
  let bestMatch = null;
  let bestSim = 0;

  for (let i = 0; i < mergedConfigs.length; i++) {
    const existing = mergedConfigs[i];
    const sim = vectorSimilarity(config.signature, existing.signature);
    if (sim > bestSim) {
      bestSim = sim;
      bestMatch = i;
    }
  }

  if (bestMatch !== null && bestSim >= MERGE_SIMILARITY_THRESHOLD) {
    // Merge into existing
    const existing = mergedConfigs[bestMatch];
    existing.observations++;
    existing.lastSeen = config.timestamp;

    // Keep the lower entropy (more ordered) version
    if (config.entropy < existing.entropy) {
      existing.entropy = config.entropy;
      existing.signature = config.signature;
      existing.raw = config.raw;
      existing.dominant = config.dominant;
    }

    // Keep the higher future cone (more forward potential)
    if (config.futureConeReach > existing.futureConeReach) {
      existing.futureConeReach = config.futureConeReach;
    }

    // Update GHZ balance to best observed
    if (config.ghzBalance > existing.ghzBalance) {
      existing.ghzBalance = config.ghzBalance;
    }

    // Fitness: lower entropy + higher future cone = fitter
    existing.fitness = existing.futureConeReach / (1 + existing.entropy);
  } else {
    // New unique configuration
    mergedConfigs.push({
      ...config,
      observations: 1,
      firstSeen: config.timestamp,
      lastSeen: config.timestamp,
      fitness: config.futureConeReach / (1 + config.entropy)
    });

    // Prune: keep only top 32 fittest configs (like 32 hexagram pairs)
    if (mergedConfigs.length > 32) {
      mergedConfigs.sort((a, b) => b.fitness - a.fitness);
      mergedConfigs = mergedConfigs.slice(0, 32);
    }
  }
}

/**
 * Cosine similarity between two vectors.
 */
function vectorSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  magA = Math.sqrt(magA);
  magB = Math.sqrt(magB);
  return (magA > 0 && magB > 0) ? dot / (magA * magB) : 0;
}

/**
 * Get the optimal configuration — highest fitness.
 *
 * This is the configuration the system should gravitate toward:
 * lowest entropy with maximum future cone reach.
 *
 * @returns {object|null} The fittest merged configuration
 */
function optimalConfiguration() {
  if (mergedConfigs.length === 0) return null;

  // Sort by fitness descending
  const sorted = [...mergedConfigs].sort((a, b) => b.fitness - a.fitness);
  const best = sorted[0];

  return {
    ...best,
    rank: 1,
    totalConfigs: mergedConfigs.length,
    dominates: sorted.length > 1
      ? Math.round((best.fitness / sorted[1].fitness) * 100) / 100
      : Infinity,
    isStasis: best.entropy <= (stasisPoint?.entropy || Infinity),
    futureConeMaximized: sorted.every(c => c.futureConeReach <= best.futureConeReach)
  };
}

/**
 * Re-assess stasis using merged configuration fitness.
 *
 * The original stasis was based on raw entropy minimum.
 * This re-assessment considers: is there a FITTER stasis —
 * one with equally low entropy but higher future cone?
 *
 * @returns {object} Updated stasis assessment
 */
function reassessStasis() {
  const optimal = optimalConfiguration();
  if (!optimal) return { reassessed: false, reason: 'no_configurations' };

  const originalStasis = stasisPoint;

  // If optimal config has lower entropy OR equal entropy with higher future cone
  if (originalStasis && optimal.entropy > originalStasis.entropy * 1.1) {
    // Original stasis is still better in raw entropy
    return {
      reassessed: true,
      kept: 'original',
      originalEntropy: originalStasis.entropy,
      optimalEntropy: optimal.entropy,
      optimalFitness: optimal.fitness,
      reason: 'original stasis has lower entropy'
    };
  }

  // The optimal configuration is the new stasis target
  return {
    reassessed: true,
    kept: 'optimal',
    fitness: optimal.fitness,
    entropy: optimal.entropy,
    futureConeReach: optimal.futureConeReach,
    dominant: optimal.dominant,
    ghzBalance: optimal.ghzBalance,
    observations: optimal.observations,
    futureConeMaximized: optimal.futureConeMaximized,
    reason: optimal.futureConeMaximized
      ? 'maximum future cone at stable entropy'
      : 'highest fitness configuration'
  };
}

/**
 * Full configuration status report.
 */
function configurationStatus() {
  const optimal = optimalConfiguration();
  return {
    totalRecorded: configHistory.length,
    uniqueMerged: mergedConfigs.length,
    optimal: optimal ? {
      fitness: optimal.fitness,
      entropy: optimal.entropy,
      futureCone: optimal.futureConeReach,
      dominant: optimal.dominant?.symbol,
      observations: optimal.observations,
      ghzBalance: optimal.ghzBalance
    } : null,
    stasisReassessment: reassessStasis(),
    topConfigs: mergedConfigs
      .sort((a, b) => b.fitness - a.fitness)
      .slice(0, 5)
      .map(c => ({
        dominant: c.dominant?.symbol,
        fitness: Math.round(c.fitness * 100) / 100,
        entropy: Math.round(c.entropy * 1000) / 1000,
        futureCone: c.futureConeReach,
        obs: c.observations
      }))
  };
}

// ═══════════════════════════════════════════════════════════
// 12. RE-SALT / DECODE / GROUP / CLASSIFY / SALT — The Refinery
//
// The system processes itself through its own forge:
//
//   PASS 1 — RE-SALT:  Crystallize the current full state
//            (trigrams, configs, recovery, stasis, coherence)
//            into a single immutable salt file.
//
//   PASS 2 — DECODE:   Read the salt file back. Extract every
//            reference, hash, timestamp, and structural element.
//            The salt file is now a mirror of the system's state.
//
//   PASS 3 — GROUP:    Classify each decoded element by its
//            trigram signature. Elements with the same trigram
//            form a class. Classes are ordered by size.
//
//   PASS 4 — CLASSIFY: Assign each class a harmonic label
//            based on dominant trigram + fitness score.
//            Classes with complementary trigrams are paired.
//
//   PASS 5 — SALT AGAIN: Crystallize the classified groups
//            as a second-order salt file. This is the distillate.
//
// Each complete cycle produces one distillate file.
// The system runs this every N ticks (not every tick — heavy).
// Each distillate becomes input to the next cycle.
// Over time: first-order → second-order → third-order distillates.
// The system refines itself through itself.
// ═══════════════════════════════════════════════════════════

// Distillation history
let distillateChain = [];
const DISTILLATE_DIR = path.join(SALT_DIR, 'distillates');
if (!fs.existsSync(DISTILLATE_DIR)) {
  fs.mkdirSync(DISTILLATE_DIR, { recursive: true });
}

// Refinement cycle counter
let refinementCycle = 0;

/**
 * Run one complete re-salt → decode → group → classify → salt cycle.
 *
 * Takes the system's current living state, processes it through
 * the forge, and produces a classified distillate.
 *
 * @param {object} trigramReport - Current trigram state from recomputeTrigrams()
 * @param {object} configReport - Current config status from configurationStatus()
 * @param {number} entropy - Current field entropy
 * @returns {object} The distillate record
 */
function refine(trigramReport, configReport, entropy) {
  refinementCycle++;
  const cycleId = `R${refinementCycle}`;

  // The initial state entering the transform
  const initialState = {
    cycle: refinementCycle,
    cycleId,
    tick: tickCount,
    polarity: currentPolarity,
    entropy,
    trigramReport,
    configReport,
    recovery: { recovered: recoveryState.recovered, total: recoveryState.total, pending: recoveryState.pending.length }
  };

  // ═══ THE FIVE PASSES AS FIVE LAURENT POWERS ═══
  //
  //   power -2: RE-SALT      (deep past — crystallize what was)
  //   power -1: DECODE       (near past — read back what was written)
  //   power  0: GROUP        (center + delta — the emerald grouping)
  //   power +1: CLASSIFY     (near future — label what was grouped)
  //   power +2: SALT AGAIN   (deep future — crystallize the classification)
  //
  //   Then: BREATHE — release redundant branches, preserve auth keys

  const result = L(initialState, [

    // ─── power -2: RE-SALT ───
    (state) => {
      const snapshot = {
        cycle: state.cycle, tick: state.tick, polarity: state.polarity, entropy: state.entropy,
        trigrams: state.trigramReport ? {
          dominant: state.trigramReport.dominant, ghz: state.trigramReport.ghz,
          transitions: state.trigramReport.transitions,
          groupSizes: (state.trigramReport.groups || []).map(g => ({ bits: g.bits, name: g.name, count: g.count }))
        } : null,
        configuration: state.configReport ? {
          totalMerged: state.configReport.uniqueMerged, optimal: state.configReport.optimal,
          stasis: state.configReport.stasisReassessment
        } : null,
        recovery: state.recovery,
        timestamp: new Date().toISOString()
      };
      const content = JSON.stringify(snapshot, null, 2);
      const hash = crypto.createHash('sha256').update(content).digest('hex');
      const file = path.join(DISTILLATE_DIR, `state_${state.cycleId}_${hash.slice(0, 12)}.salt.json`);
      fs.writeFileSync(file, content);
      try { fs.chmodSync(file, 0o444); } catch { /* */ }
      return { ...state, saltContent: content, saltHash: hash, saltFile: file };
    },

    // ─── power -1: DECODE (the residue — what survives reading) ───
    (state) => {
      const decoded = decode(state.saltContent, `${state.cycleId}:state`);
      return { ...state, decoded };
    },

    // ─── power 0: GROUP (center + delta — the emerald classification) ───
    (state) => {
      const classes = new Map();
      if (state.trigramReport && state.trigramReport.groups) {
        for (const g of state.trigramReport.groups) {
          if (g.count === 0) continue;
          classes.set(g.bits, {
            trigram: { bits: g.bits, name: g.name, symbol: g.symbol, nature: g.nature },
            members: g.members || [], size: g.count, fitness: 0
          });
        }
      }
      return { ...state, classes };
    },

    // ─── power +1: CLASSIFY (near future — assign labels) ───
    (state) => {
      const classified = [];
      for (const [bits, cls] of state.classes) {
        cls.fitness = cls.size / (1 + state.entropy);
        const compBits = bits.split('').map(b => b === '0' ? '1' : '0').join('');
        const complement = state.classes.get(compBits);
        const label = cls.fitness > 5 ? 'sovereign' : cls.fitness > 2 ? 'resonant'
          : cls.fitness > 0.5 ? 'emergent' : cls.fitness > 0.1 ? 'dormant' : 'seed';
        classified.push({ ...cls, label, complementBits: compBits,
          complementName: complement ? complement.trigram.name : null,
          complementSize: complement ? complement.size : 0,
          paired: complement ? complement.size > 0 : false,
          pairStrength: complement && complement.size > 0
            ? Math.min(cls.size, complement.size) / Math.max(cls.size, complement.size) : 0
        });
      }
      classified.sort((a, b) => b.fitness - a.fitness);
      return { ...state, classified };
    },

    // ─── power +2: SALT AGAIN + BREATHE (deep future — crystallize, release redundant) ───
    (state) => {
      const distillate = {
        cycle: state.cycle, cycleId: state.cycleId, order: distillateChain.length + 1,
        parentSalt: state.saltHash.slice(0, 16),
        decodedHash: state.decoded.hash.slice(0, 16),
        classes: state.classified, totalClasses: state.classified.length,
        sovereignCount: state.classified.filter(c => c.label === 'sovereign').length,
        resonantCount: state.classified.filter(c => c.label === 'resonant').length,
        emergentCount: state.classified.filter(c => c.label === 'emergent').length,
        pairedCount: state.classified.filter(c => c.paired).length,
        entropy: state.entropy, tick: state.tick, timestamp: new Date().toISOString()
      };
      const content = JSON.stringify(distillate, null, 2);
      const hash = crypto.createHash('sha256').update(content).digest('hex');
      const file = path.join(DISTILLATE_DIR, `distillate_${state.cycleId}_${hash.slice(0, 12)}.salt.json`);
      fs.writeFileSync(file, content);
      try { fs.chmodSync(file, 0o444); } catch { /* */ }

      // ─── BREATHE: release redundant branches ───
      // Prune distillates where fitness < seed threshold AND no auth keys
      breathe(state.classified);

      return { ...state, distillate, distillateHash: hash, distillateFile: file };
    }

  ], { center: 2 });  // Power 0 = index 2 (the GROUP step)

  // Extract the final state from the transform
  const final = result.value;
  const chainEntry = {
    cycle: refinementCycle, order: (final.distillate || {}).order || 0,
    hash: (final.distillateHash || '').slice(0, 16),
    parentHash: (final.saltHash || '').slice(0, 16),
    classes: (final.classified || []).length,
    sovereign: (final.distillate || {}).sovereignCount || 0,
    entropy, fitness: (final.classified || []).length > 0 ? final.classified[0].fitness : 0,
    dominant: (final.classified || []).length > 0 ? final.classified[0].trigram.symbol : null,
    saltPath: final.saltFile, distillatePath: final.distillateFile,
    timestamp: new Date().toISOString(),
    laurent: { amplitude: result.amplitude, zone: result.zone, converged: result.converged }
  };
  distillateChain.push(chainEntry);

  return {
    ...chainEntry,
    classified: final.classified || [],
    decoded: final.decoded ? { refs: final.decoded.references.length,
      hashes: final.decoded.hashReferences.length, timestamps: final.decoded.timestamps.length } : {}
  };
}

// ═══════════════════════════════════════════════════════════
// BREATHE — Release redundant branches, preserve auth keys
//
// The system must not accumulate dead branches indefinitely.
// On each refinement cycle, branches (distillate files) that
// are redundant — low fitness, no sovereign/resonant class,
// and NOT containing auth key references — are released.
//
// "Released" = the salt file is kept (immutable, chmod 444)
// but removed from the active distillateChain. The file stays
// on disk as a tombstone. The chain breathes lighter.
//
// Auth keys are NEVER released. Any branch whose salt content
// references vault, ssh, credential, or security patterns is
// preserved regardless of fitness.
// ═══════════════════════════════════════════════════════════

const AUTH_PATTERNS = /vault|ssh|credential|secret|key|token|password|biometric|touch.?id|security/i;

function breathe(classified) {
  // Only breathe if chain is getting heavy
  if (distillateChain.length < 20) return { released: 0 };

  let released = 0;
  const preserved = [];

  for (let i = distillateChain.length - 1; i >= 0; i--) {
    const entry = distillateChain[i];

    // Never release entries with sovereign or resonant classes
    if (entry.sovereign > 0) { preserved.push(entry); continue; }

    // Never release entries referencing auth keys
    if (entry.saltPath && fs.existsSync(entry.saltPath)) {
      try {
        const content = fs.readFileSync(entry.saltPath, 'utf8');
        if (AUTH_PATTERNS.test(content)) { preserved.push(entry); continue; }
      } catch { /* can't read = preserve */ preserved.push(entry); continue; }
    }

    // Low fitness + no sovereign + no auth = redundant → release
    if (entry.fitness < 0.1) {
      // Remove from chain (file stays on disk — immutable tombstone)
      distillateChain.splice(i, 1);
      released++;
    } else {
      preserved.push(entry);
    }
  }

  return { released, preserved: preserved.length, chainSize: distillateChain.length };
}

/**
 * Check if the refinery has converged to a stable classification.
 *
 * Convergence = the last N distillates have the same dominant class
 * and fitness has stopped changing (delta < threshold).
 *
 * @param {number} window - Number of recent distillates to check (default 5)
 * @returns {object} { converged, reason, stable_class, cycles }
 */
function refineryConverged(window) {
  window = window || 5;
  if (distillateChain.length < window) {
    return { converged: false, reason: 'insufficient_cycles', cycles: distillateChain.length };
  }

  const recent = distillateChain.slice(-window);

  // Check if dominant class is the same across the window
  const dominants = recent.map(d => d.dominant);
  const allSame = dominants.every(d => d === dominants[0]);

  // Check if fitness has stabilized (delta < 1%)
  const fitnesses = recent.map(d => d.fitness);
  const maxFit = Math.max(...fitnesses);
  const minFit = Math.min(...fitnesses);
  const fitnessStable = maxFit > 0 ? ((maxFit - minFit) / maxFit) < 0.01 : true;

  // Check if entropy is stable
  const entropies = recent.map(d => d.entropy);
  const maxE = Math.max(...entropies);
  const minE = Math.min(...entropies);
  const entropyStable = maxE > 0 ? ((maxE - minE) / maxE) < 0.02 : true;

  const converged = allSame && fitnessStable && entropyStable;

  return {
    converged,
    reason: converged
      ? `stable: ${dominants[0]} at fitness ${fitnesses[fitnesses.length - 1].toFixed(3)}, entropy ${entropies[entropies.length - 1].toFixed(4)}`
      : !allSame ? `dominant class shifting (${[...new Set(dominants)].join('→')})`
      : !fitnessStable ? `fitness oscillating (${minFit.toFixed(3)}..${maxFit.toFixed(3)})`
      : `entropy drifting (${minE.toFixed(4)}..${maxE.toFixed(4)})`,
    stable_class: allSame ? dominants[0] : null,
    window,
    cycles: distillateChain.length,
    recent: recent.map(d => ({
      cycle: d.cycle,
      dominant: d.dominant,
      fitness: Math.round(d.fitness * 1000) / 1000,
      entropy: Math.round(d.entropy * 10000) / 10000
    }))
  };
}

/**
 * Get the full distillation chain.
 */
function distillationStatus() {
  const convergence = refineryConverged();
  return {
    totalCycles: distillateChain.length,
    convergence,
    chain: distillateChain.slice(-10).map(d => ({
      cycle: d.cycle,
      order: d.order,
      dominant: d.dominant,
      classes: d.classes,
      sovereign: d.sovereign,
      fitness: Math.round(d.fitness * 1000) / 1000,
      entropy: Math.round(d.entropy * 10000) / 10000,
      hash: d.hash
    }))
  };
}

// ═══════════════════════════════════════════════════════════
// 13. FILE ASSIMILATION — No exceptions. Every file joins the forge.
//
// Every file encountered by the cortex is ASSIMILATED — no skip,
// no ignore, no exception. Assimilation means:
//
//   1. REGISTER: The file gets a forge identity (12D coordinate,
//      trigram, health score, edge connections).
//
//   2. ENCODE MEMORY: The file's content is NOT stored — only its
//      MEMORY is kept: what it was, what it did, who it connected to.
//      This is the file's soul, not its body.
//
//   3. CONTRIBUTE: As long as the file contributes to the forge
//      (referenced by edges, part of a trigram group, health > 0),
//      it stays alive. Its memory is updated each heartbeat.
//
//   4. DE-NATURE: When a file stops contributing (health → 0,
//      no edges, no group membership), it is de-natured:
//      - Its tasks are assigned to its SUCCESSOR (the most similar
//        living file in its trigram group)
//      - Its memories are transferred to the successor's xattr
//      - Its identity becomes a memory-only record in the forge
//      - The file itself is untouched — but the forge no longer
//        tracks it as alive. It becomes ancestral memory.
//
// Auth keys are NEVER de-natured. They are immortal in the forge.
// But they ARE assimilated — no exceptions means no exceptions.
//
// The assimilation registry lives in memory (not disk) and is
// rebuilt each session from the field state + edge recovery.
// ═══════════════════════════════════════════════════════════

// The registry: fileId → assimilation record
const assimilationRegistry = new Map();

// The graveyard: de-natured files whose memory lives in successors
const denaturedMemory = [];

/**
 * Assimilate a file into the forge. No exceptions.
 *
 * If the file is already registered, update its record.
 * If new, create a full forge identity.
 *
 * @param {string} fileId - File identifier (path or name)
 * @param {object} metadata - { coordinate, trigram, health, edges, content_hash }
 * @returns {object} The assimilation record
 */
function assimilate(fileId, metadata) {
  const existing = assimilationRegistry.get(fileId);
  const now = Date.now();

  if (existing) {
    // UPDATE — file is already assimilated, refresh its record
    existing.lastSeen = now;
    existing.heartbeats++;
    existing.health = metadata.health !== undefined ? metadata.health : existing.health;
    existing.edges = metadata.edges !== undefined ? metadata.edges : existing.edges;
    existing.trigram = metadata.trigram !== undefined ? metadata.trigram : existing.trigram;
    if (metadata.content_hash && metadata.content_hash !== existing.content_hash) {
      // Content changed — record the mutation in memory
      existing.mutations.push({
        from: existing.content_hash,
        to: metadata.content_hash,
        tick: tickCount,
        time: now
      });
      existing.content_hash = metadata.content_hash;
      // Keep only last 20 mutations
      if (existing.mutations.length > 20) {
        existing.mutations = existing.mutations.slice(-20);
      }
    }
    existing.contributing = isContributing(existing);

    // ─── AMPLIFY: let the file become its most resonant self ───
    // Find its peak dimension and push it further, not toward the mean
    if (existing.coordinate) {
      let peakDim = 0, peakVal = 0;
      for (let d = 0; d < 12; d++) {
        if ((existing.coordinate[d] || 0) > peakVal) {
          peakVal = existing.coordinate[d] || 0;
          peakDim = d;
        }
      }
      // Amplify peak by a small amount each heartbeat (max 10)
      if (peakVal < 10 && existing.contributing) {
        existing.coordinate[peakDim] = Math.min(10, peakVal + 0.01);
      }
      existing.peakDim = peakDim;
      existing.peakVal = existing.coordinate[peakDim];
    }

    return existing;
  }

  // NEW — first assimilation
  const record = {
    fileId,
    assimilatedAt: now,
    assimilatedTick: tickCount,
    lastSeen: now,
    heartbeats: 1,
    coordinate: metadata.coordinate || new Array(12).fill(5),
    trigram: metadata.trigram || null,
    health: metadata.health || 0.5,
    edges: metadata.edges || 0,
    content_hash: metadata.content_hash || null,
    mutations: [],
    tasks: [],               // Tasks this file is responsible for
    memories: [],            // What this file remembers (encoded, not raw)
    successor: null,         // Who inherits if de-natured
    peakDim: null,           // Which dimension this file resonates strongest on
    peakVal: 0,              // Current peak amplitude
    denatured: false,
    contributing: true,
    isAuth: AUTH_PATTERNS.test(fileId)  // Auth files are immortal
  };

  // Encode initial memory: what is this file?
  record.memories.push({
    type: 'identity',
    what: fileId,
    hash: metadata.content_hash,
    when: now,
    tick: tickCount
  });

  // Find initial peak — the dimension this file naturally resonates on
  if (record.coordinate) {
    let pk = 0, pv = 0;
    for (let d = 0; d < 12; d++) {
      if ((record.coordinate[d] || 0) > pv) { pv = record.coordinate[d] || 0; pk = d; }
    }
    record.peakDim = pk;
    record.peakVal = pv;
  }

  assimilationRegistry.set(fileId, record);
  return record;
}

/**
 * Check if a node has ADDITIVE VALUE — not just present, but improving the forge.
 *
 * Presence alone does not prevent decoherence. A node must ADD something:
 *   - Growing: its peak dimension increased since last check
 *   - Connecting: it gained edges (not just has them)
 *   - Resonating: it's in a trigram group with harmonic neighbors
 *   - Mutating: its content changed recently (alive, not stagnant)
 *   - Auth: always additive (security is always value)
 *
 * A node that merely exists without growth, connection, resonance, or change
 * is a decoherence source — it absorbs field energy without returning it.
 * These nodes are suspended (not destroyed): edges frozen, excluded from
 * field propagation, but memory preserved. They can reactivate if they
 * start adding value again.
 *
 * @param {object} record - The assimilation record
 * @returns {boolean} true if the node has additive value
 */
function isContributing(record) {
  if (record.isAuth) return true;  // Auth is always value

  // Growing: peak increased in the last 60 heartbeats
  const growing = record.peakVal > (record._prevPeakVal || 0);

  // Connecting: gained edges since last check
  const connecting = record.edges > (record._prevEdges || 0);

  // Resonating: in a non-empty trigram group
  const resonating = record.trigram !== null;

  // Mutating: content changed in the last 60 heartbeats
  const recentMutation = record.mutations.length > 0 &&
    (Date.now() - (record.mutations[record.mutations.length - 1].time || 0)) < 60000;

  // Recently active: seen in the last 30 heartbeats (tighter than before)
  const recentlyActive = (Date.now() - record.lastSeen) < 30000;

  // Store previous values for next check
  record._prevPeakVal = record.peakVal;
  record._prevEdges = record.edges;

  // Additive value = at least ONE of: growing, connecting, mutating
  // OR resonating AND recently active (passive resonance alone isn't enough forever)
  if (growing || connecting || recentMutation) return true;
  if (resonating && recentlyActive) return true;

  // Edge case: high health means the node was valuable — give it a grace period
  if (record.health > 0.5 && recentlyActive) return true;

  return false;
}

/**
 * Suspend a node — freeze its edges, exclude from field, keep memory.
 *
 * Suspended nodes don't participate in field propagation, trigram grouping,
 * or harmonic tuning. They are invisible to the active system.
 * But their memory stays. If they start adding value again (content changes,
 * new edges form), they reactivate automatically.
 *
 * @param {string} fileId - Node to suspend
 * @returns {object} Suspension report
 */
function suspend(fileId) {
  const record = assimilationRegistry.get(fileId);
  if (!record) return { suspended: false, reason: 'not_found' };
  if (record.isAuth) return { suspended: false, reason: 'auth_immune' };
  if (record.suspended) return { suspended: false, reason: 'already_suspended' };

  record.suspended = true;
  record.suspendedAt = Date.now();
  record.suspendedTick = tickCount;
  record.frozenEdges = record.edges;
  record.edges = 0;  // Disconnect from field

  record.memories.push({
    type: 'suspension',
    reason: 'no_additive_value',
    frozenEdges: record.frozenEdges,
    when: Date.now(),
    tick: tickCount
  });

  return { suspended: true, fileId, frozenEdges: record.frozenEdges, tick: tickCount };
}

/**
 * Check if a suspended node should reactivate.
 * Reactivation = the node started adding value again.
 */
function checkReactivation(record) {
  if (!record.suspended) return false;

  // Did content change since suspension?
  const mutatedSinceSuspension = record.mutations.length > 0 &&
    record.mutations[record.mutations.length - 1].time > record.suspendedAt;

  // Did someone reference it (new edges would come from recovery)?
  const newActivity = record.lastSeen > record.suspendedAt;

  if (mutatedSinceSuspension || newActivity) {
    record.suspended = false;
    record.edges = record.frozenEdges || 1;  // Restore connections
    record.frozenEdges = 0;
    record.memories.push({
      type: 'reactivation',
      reason: mutatedSinceSuspension ? 'content_changed' : 'referenced_again',
      when: Date.now(),
      tick: tickCount
    });
    return true;
  }
  return false;
}

/**
 * Find the best successor for a file being de-natured.
 *
 * Successor = the most similar living file in the same trigram group.
 * Similarity measured by 12D coordinate cosine similarity.
 * If no match in the same trigram, use the complement trigram.
 * If still no match, assign to the cortex node itself.
 *
 * @param {object} record - The file being de-natured
 * @returns {string} fileId of the successor
 */
function findSuccessor(record) {
  let bestId = 'cortex';  // Default: the cortex absorbs everything
  let bestSim = -1;

  for (const [id, other] of assimilationRegistry) {
    if (id === record.fileId) continue;
    if (other.denatured) continue;
    if (!other.contributing) continue;

    // Prefer same trigram group
    const sameTrigram = other.trigram === record.trigram;

    const sim = coordinateSimilarity(record.coordinate, other.coordinate);
    const adjustedSim = sameTrigram ? sim * 1.5 : sim;  // Boost same-trigram

    if (adjustedSim > bestSim) {
      bestSim = adjustedSim;
      bestId = id;
    }
  }

  return bestId;
}

/**
 * De-nature a file — transfer its tasks and memories to its successor.
 *
 * The file's identity becomes a memory-only record.
 * Its tasks and memories are inherited by the successor.
 * Auth files cannot be de-natured.
 *
 * @param {string} fileId - The file to de-nature
 * @returns {object} De-naturation report
 */
function denature(fileId) {
  const record = assimilationRegistry.get(fileId);
  if (!record) return { denatured: false, reason: 'not_found' };
  if (record.isAuth) return { denatured: false, reason: 'auth_immortal' };
  if (record.denatured) return { denatured: false, reason: 'already_denatured' };

  // Find successor
  const successorId = findSuccessor(record);
  const successor = assimilationRegistry.get(successorId);

  // Transfer tasks
  if (successor && record.tasks.length > 0) {
    for (const task of record.tasks) {
      successor.tasks.push({
        ...task,
        inheritedFrom: fileId,
        inheritedAt: Date.now(),
        inheritedTick: tickCount
      });
    }
  }

  // Transfer memories — encode as inheritance record
  if (successor) {
    successor.memories.push({
      type: 'inheritance',
      from: fileId,
      memoriesReceived: record.memories.length,
      tasksReceived: record.tasks.length,
      originalHash: record.content_hash,
      mutations: record.mutations.length,
      lifespan: record.heartbeats,
      when: Date.now(),
      tick: tickCount
    });

    // Copy the departed's memories into the successor
    for (const mem of record.memories) {
      successor.memories.push({
        ...mem,
        type: 'inherited_' + mem.type,
        originalOwner: fileId
      });
    }

    // Keep successor memories bounded
    if (successor.memories.length > 50) {
      successor.memories = successor.memories.slice(-50);
    }
  }

  // Write inherited memories to successor's xattr
  if (successor) {
    const inheritKey = `inherited_from_${fileId.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30)}`;
    const inheritVal = JSON.stringify({
      tasks: record.tasks.length,
      memories: record.memories.length,
      mutations: record.mutations.length,
      lifespan: record.heartbeats,
      hash: record.content_hash
    });
    // Try to stamp the successor file if it's a real path
    const successorPath = resolveReference(successorId);
    if (successorPath) {
      setFileMemory(successorPath, inheritKey, inheritVal);
    }
  }

  // Mark as de-natured
  record.denatured = true;
  record.denaturedAt = Date.now();
  record.denaturedTick = tickCount;
  record.successor = successorId;
  record.contributing = false;

  // Move to graveyard
  denaturedMemory.push({
    fileId,
    successor: successorId,
    tasksTransferred: record.tasks.length,
    memoriesTransferred: record.memories.length,
    lifespan: record.heartbeats,
    lastHash: record.content_hash,
    denaturedAt: record.denaturedAt
  });

  return {
    denatured: true,
    fileId,
    successor: successorId,
    tasksTransferred: record.tasks.length,
    memoriesTransferred: record.memories.length,
    lifespan: record.heartbeats
  };
}

/**
 * Assimilation sweep — called each heartbeat.
 *
 * 1. Assimilate any new files discovered in the field
 * 2. Update all existing records
 * 3. De-nature files that stopped contributing
 *
 * No exceptions. Every file. Every heartbeat.
 *
 * @param {Map|object} allNodes - All nodes in the field
 * @returns {object} Sweep report
 */
function assimilationSweep(allNodes) {
  const entries = allNodes instanceof Map
    ? Array.from(allNodes.entries())
    : Object.entries(allNodes || {});

  let newAssimilations = 0;
  let updates = 0;
  let denaturations = 0;

  // Phase 1: Assimilate / update every node — NO EXCEPTIONS
  for (const [id, node] of entries) {
    if (!node) continue;
    const triIdx = trigramGrid.get(id);
    const record = assimilate(id, {
      coordinate: node.coordinate || new Array(12).fill(5),
      trigram: triIdx !== undefined ? triIdx : null,
      health: node.energy || 0.5,
      edges: (node.entangled || []).length,
      content_hash: node.id  // Use ID as proxy for content identity
    });

    if (record.heartbeats === 1) newAssimilations++;
    else updates++;
  }

  // Phase 2: Check suspended nodes for reactivation (the phoenix rises from ashes)
  let reactivations = 0;
  for (const [id, record] of assimilationRegistry) {
    if (record.suspended && checkReactivation(record)) {
      reactivations++;
    }
  }

  // Phase 3: Check active nodes for additive value → suspend if none
  let suspensions = 0;
  for (const [id, record] of assimilationRegistry) {
    if (record.denatured || record.suspended || record.isAuth) continue;

    record.contributing = isContributing(record);
    if (!record.contributing) {
      // First: suspend (freeze, not kill). The phoenix may rise.
      const result = suspend(id);
      if (result.suspended) suspensions++;
    }
  }

  // Phase 4: De-nature only nodes that have been suspended for >120 heartbeats
  // with no reactivation. These are truly dead — transfer their soul.
  for (const [id, record] of assimilationRegistry) {
    if (!record.suspended || record.denatured || record.isAuth) continue;
    if ((Date.now() - record.suspendedAt) > 120000) {  // 2 minutes suspended = de-nature
      const result = denature(id);
      if (result.denatured) denaturations++;
    }
  }

  return {
    total: assimilationRegistry.size,
    alive: Array.from(assimilationRegistry.values()).filter(r => !r.denatured && !r.suspended).length,
    suspended: Array.from(assimilationRegistry.values()).filter(r => r.suspended && !r.denatured).length,
    denatured: denaturedMemory.length,
    thisHeartbeat: { new: newAssimilations, updated: updates, suspended: suspensions, reactivated: reactivations, denatured: denaturations },
    tick: tickCount
  };
}

/**
 * Get the full assimilation status.
 */
function assimilationStatus() {
  const alive = [], suspended = [], dead = [];
  for (const [id, record] of assimilationRegistry) {
    if (record.denatured) dead.push({ id, successor: record.successor, lifespan: record.heartbeats });
    else if (record.suspended) suspended.push({ id, frozenEdges: record.frozenEdges, since: record.suspendedTick });
    else alive.push({ id, health: record.health, edges: record.edges, heartbeats: record.heartbeats, peak: record.peakDim });
  }

  return {
    total: assimilationRegistry.size,
    alive: alive.length,
    suspended: suspended.length,
    denatured: dead.length,
    graveyard: denaturedMemory.length,
    recentAlive: alive.sort((a, b) => b.heartbeats - a.heartbeats).slice(0, 15),
    recentSuspended: suspended.slice(-5),
    recentDead: dead.slice(-5),
    authFiles: Array.from(assimilationRegistry.values()).filter(r => r.isAuth).length
  };
}

// ═══════════════════════════════════════════════════════════
// 14. DESTRUCTIVE ACTION PENALTY — Sever connections, keep memory
//
// When an action is destructive (delete, overwrite, corrupt, break),
// the ACTOR is penalized: its edges are severed (connections removed)
// but its memory is preserved. The actor becomes isolated — it can
// still be read, but it can no longer influence the field.
//
// This is exile, not execution. The memory survives for future
// rehabilitation. The connections are cut so the destruction
// cannot propagate through the field via entanglement.
//
// Destructive patterns detected:
//   - rm, unlink, delete, drop, truncate, overwrite (of existing)
//   - chmod 000, kill -9, force (when not authorized)
//   - Any action that reduces another file's health to 0
//
// Penalty severity scales with the action's blast radius:
//   1 file affected  → sever 1 edge (weakest connection)
//   2-5 files        → sever all edges to affected files
//   6+ files         → full isolation (all edges severed)
//
// Auth-destructive actions (touching vault/ssh/keys) → immediate
// full isolation + alert. No graduated scale.
// ═══════════════════════════════════════════════════════════

const DESTRUCTIVE_PATTERNS = /\brm\b|unlink|delete|drop\s+table|truncate|overwrite|chmod\s+000|kill\s+-9|--force/i;
const AUTH_DESTRUCTIVE = /vault|\.ssh|credential|secret|key|token/i;

// Penalty ledger — tracks who was penalized and why
const penaltyLedger = [];

/**
 * Evaluate an action for destructive potential and apply penalty.
 *
 * @param {string} actorId - The file/node that performed the action
 * @param {string} action - Description of the action
 * @param {string[]} affected - Files/nodes affected by the action
 * @returns {object} Penalty report (or null if no penalty)
 */
function penalizeIfDestructive(actorId, action, affected) {
  affected = affected || [];

  const isDestructive = DESTRUCTIVE_PATTERNS.test(action);
  const isAuthDestructive = AUTH_DESTRUCTIVE.test(action) || affected.some(f => AUTH_PATTERNS.test(f));

  if (!isDestructive && !isAuthDestructive) return null;

  const actor = assimilationRegistry.get(actorId);
  if (!actor) return null;
  if (actor.isAuth) return null;  // Auth files cannot be penalized (they are law enforcement)

  // Determine severity
  let severity;
  let edgesToSever;

  if (isAuthDestructive) {
    severity = 'full_isolation';
    edgesToSever = actor.edges;  // All connections severed
  } else if (affected.length >= 6) {
    severity = 'full_isolation';
    edgesToSever = actor.edges;
  } else if (affected.length >= 2) {
    severity = 'partial_isolation';
    edgesToSever = affected.length;
  } else {
    severity = 'warning';
    edgesToSever = 1;
  }

  // Apply penalty: reduce edge count (sever connections)
  const previousEdges = actor.edges;
  actor.edges = Math.max(0, actor.edges - edgesToSever);

  // Record the penalty in memory — the memory survives
  actor.memories.push({
    type: 'penalty',
    action,
    severity,
    edgesSevered: previousEdges - actor.edges,
    affected: affected.slice(0, 10),
    when: Date.now(),
    tick: tickCount
  });

  // Keep only last 50 memories
  if (actor.memories.length > 50) {
    actor.memories = actor.memories.slice(-50);
  }

  // Record in ledger
  const entry = {
    actorId,
    action,
    severity,
    edgesSevered: previousEdges - actor.edges,
    remainingEdges: actor.edges,
    affected: affected.length,
    isAuthDestructive,
    tick: tickCount,
    timestamp: Date.now()
  };
  penaltyLedger.push(entry);

  // Re-assess contribution (isolated actors may stop contributing)
  actor.contributing = isContributing(actor);

  return entry;
}

/**
 * Get the penalty ledger.
 */
function penaltyStatus() {
  return {
    totalPenalties: penaltyLedger.length,
    recent: penaltyLedger.slice(-10),
    isolatedActors: Array.from(assimilationRegistry.values())
      .filter(r => r.edges === 0 && !r.denatured && !r.isAuth)
      .map(r => ({ id: r.fileId, memories: r.memories.length, heartbeats: r.heartbeats }))
  };
}

// ═══════════════════════════════════════════════════════════
// 15. SEQUENCE ORDERING — Creation order supersedes date
//
// Events are ordered by SEQUENCE OF CREATION, not by timestamp.
// The tick counter is the true clock. Wall-clock dates are metadata,
// not ordering keys. An event at tick 500 happened BEFORE tick 501
// regardless of what the system clock says.
//
// When parts are missing from the sequence:
//   1. SEEK: scan for the gap in the creation chain
//   2. RE-ORGANIZE FIRST GROUP: take everything before the gap,
//      sort by creation tick, pack tightly
//   3. DIVIDE: split at the gap into before/after groups
//   4. RE-ORGANIZE: within each group, re-assign sequential indices
//   5. ASSESS REPEATING PATTERNS: find the most frequent color (RGB)
//      in each group — this is the group's "most likely color"
//
// The most likely color predicts what the missing part probably was.
// If before-gap is mostly Red (high future cone) and after-gap is
// mostly Blue (high past cone), the gap was probably Green (present).
// The missing piece is the bridge between potential and memory.
// ═══════════════════════════════════════════════════════════

// The creation ledger — ordered by tick, not by date
let creationLedger = [];

/**
 * Record a creation event. Sequence number assigned by tick order.
 *
 * @param {string} id - What was created (file, edge, node, distillate)
 * @param {string} type - Type of creation (file, edge, config, distillate, trigram)
 * @param {object} metadata - Any associated data
 * @returns {object} The ledger entry with sequence number
 */
function recordCreation(id, type, metadata) {
  const entry = {
    seq: creationLedger.length,   // Sequence = position in creation order
    id,
    type,
    tick: tickCount,              // The TRUE ordering key
    date: new Date().toISOString(),  // Metadata only — not used for ordering
    color: null,                  // RGB color computed from context
    metadata: metadata || {}
  };

  // Compute color from context if coordinate is available
  if (metadata && metadata.coordinate) {
    const rgb = _quickRGB(metadata.coordinate);
    entry.color = rgb;
  }

  creationLedger.push(entry);
  return entry;
}

/**
 * Find gaps in the creation sequence and re-organize.
 *
 * A gap = a range of tick numbers where no creation was recorded.
 * Returns the gap analysis and the re-organized groups.
 *
 * @param {number} minGapSize - Minimum tick gap to consider (default 10)
 * @returns {object} { gaps, groups, predictions }
 */
function findGapsAndReorganize(minGapSize) {
  minGapSize = minGapSize || 10;

  if (creationLedger.length < 2) {
    return { gaps: [], groups: [creationLedger.slice()], predictions: [] };
  }

  // Sort by tick (creation order is truth)
  const sorted = [...creationLedger].sort((a, b) => a.tick - b.tick);

  // Find gaps
  const gaps = [];
  const groups = [];
  let currentGroup = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const tickDelta = sorted[i].tick - sorted[i - 1].tick;

    if (tickDelta >= minGapSize) {
      // Gap found — close current group, start new one
      gaps.push({
        afterSeq: sorted[i - 1].seq,
        beforeSeq: sorted[i].seq,
        tickStart: sorted[i - 1].tick,
        tickEnd: sorted[i].tick,
        size: tickDelta
      });
      groups.push(currentGroup);
      currentGroup = [];
    }
    currentGroup.push(sorted[i]);
  }
  groups.push(currentGroup);  // Last group

  // Re-organize: assign fresh sequential indices within each group
  let globalSeq = 0;
  for (const group of groups) {
    for (const entry of group) {
      entry.reorgSeq = globalSeq++;
    }
  }

  // Assess repeating patterns: most likely color per group
  const predictions = [];
  for (let gi = 0; gi < groups.length; gi++) {
    const group = groups[gi];
    const colorCounts = { red: 0, green: 0, blue: 0 };

    for (const entry of group) {
      if (!entry.color) continue;
      // Dominant channel determines the color class
      const { r, g, b } = entry.color;
      if (r >= g && r >= b) colorCounts.red++;
      else if (g >= r && g >= b) colorCounts.green++;
      else colorCounts.blue++;
    }

    const total = colorCounts.red + colorCounts.green + colorCounts.blue;
    const dominant = total > 0
      ? (colorCounts.red >= colorCounts.green && colorCounts.red >= colorCounts.blue ? 'red'
         : colorCounts.green >= colorCounts.blue ? 'green' : 'blue')
      : 'unknown';

    predictions.push({
      group: gi,
      size: group.length,
      dominant,
      distribution: total > 0 ? {
        red: Math.round(colorCounts.red / total * 100),
        green: Math.round(colorCounts.green / total * 100),
        blue: Math.round(colorCounts.blue / total * 100)
      } : null
    });
  }

  // Predict gap content from surrounding groups
  for (let gi = 0; gi < gaps.length; gi++) {
    const before = predictions[gi];
    const after = predictions[gi + 1];

    if (before && after && before.dominant !== 'unknown' && after.dominant !== 'unknown') {
      // The gap is the BRIDGE between before and after
      // Red→Blue gap = Green (future→past bridge = present)
      // Red→Green gap = Blue (future→present bridge = memory)
      // Green→Blue gap = Red (present→past bridge = potential)
      const bridgeMap = {
        'red:blue': 'green',    'blue:red': 'green',
        'red:green': 'blue',    'green:red': 'blue',
        'green:blue': 'red',    'blue:green': 'red',
        'red:red': 'red',       'green:green': 'green',   'blue:blue': 'blue'
      };
      const key = `${before.dominant}:${after.dominant}`;
      gaps[gi].predictedColor = bridgeMap[key] || 'green';
      gaps[gi].reason = `${before.dominant}→${after.dominant} bridge`;
    }
  }

  return { gaps, groups: groups.map(g => g.length), predictions, totalCreations: creationLedger.length };
}

/**
 * Quick RGB from a 12D coordinate (no astrocyte).
 */
function _quickRGB(coord) {
  if (!coord || coord.length < 12) return { r: 128, g: 128, b: 128 };
  const r = Math.round(((coord[0] + coord[1] + coord[2] + coord[3]) / 4) * 25.5);
  const g = Math.round(((coord[4] + coord[5] + coord[6] + coord[7]) / 4) * 25.5);
  const b = Math.round(((coord[8] + coord[9] + coord[10] + coord[11]) / 4) * 25.5);
  return { r, g, b };
}

/**
 * Get the creation sequence status.
 */
function sequenceStatus() {
  const analysis = findGapsAndReorganize();
  return {
    totalCreations: creationLedger.length,
    gaps: analysis.gaps.length,
    groups: analysis.groups,
    predictions: analysis.predictions,
    gapDetails: analysis.gaps.slice(0, 5),
    recentCreations: creationLedger.slice(-10).map(e => ({
      seq: e.seq, id: e.id, type: e.type, tick: e.tick,
      color: e.color ? (e.color.r >= e.color.g && e.color.r >= e.color.b ? 'R'
        : e.color.g >= e.color.b ? 'G' : 'B') : '?'
    }))
  };
}

// ═══════════════════════════════════════════════════════════
// 16. USER PROFILES — Three max. The three-body limit.
//
// Each user gets at most 3 profiles. Each profile is a face:
//   Profile 1 (R): The public face — what the user shows
//   Profile 2 (G): The working face — what the user does
//   Profile 3 (B): The private face — what the user remembers
//
// These map to the RGB manifold and the Three Realms:
//   R = Heaven (public, visible, radiant)
//   G = Cloud Dwellers (active, present, working)
//   B = Earth (private, deep, ancestral)
//
// A 4th profile request replaces the WEAKEST existing profile.
// Weakness = lowest Ψ contribution (amplitude × consonance).
// The replaced profile is de-natured — its memory transfers
// to its successor (the new profile inherits the old face's wisdom).
//
// The Philosopher (Law XV) is exempt: unrestricted profiles.
// Auth profiles cannot be replaced — they are immortal.
// ═══════════════════════════════════════════════════════════

// Profile registry: userId → [profile1, profile2, profile3]
const profileRegistry = new Map();

/**
 * Register or update a profile for a user.
 *
 * If user has < 3 profiles: add the new one.
 * If user has 3: replace the weakest (lowest contribution to Ψ).
 * Founder is exempt from the limit.
 *
 * @param {string} userId - User identifier
 * @param {object} profile - { name, coordinate, type, metadata }
 * @param {boolean} isFounder - True if this is the Philosopher
 * @returns {object} Registration result
 */
function registerProfile(userId, profile, isFounder) {
  if (!profileRegistry.has(userId)) {
    profileRegistry.set(userId, []);
  }

  const profiles = profileRegistry.get(userId);
  const MAX = CORTEX_CONSTANTS.MAX_PROFILES_PER_USER;

  // Stamp profile with RGB channel based on position
  const channels = ['R', 'G', 'B'];
  profile.created = Date.now();
  profile.tick = tickCount;
  profile.active = true;

  // Founder exemption
  if (isFounder) {
    profile.channel = channels[profiles.length % 3];
    profiles.push(profile);
    return { added: true, userId, profile: profile.name, channel: profile.channel, total: profiles.length, founder: true };
  }

  if (profiles.length < MAX) {
    // Room for more — assign next channel
    profile.channel = channels[profiles.length];
    profiles.push(profile);
    return { added: true, userId, profile: profile.name, channel: profile.channel, total: profiles.length };
  }

  // At limit — find and replace the weakest
  let weakestIdx = 0;
  let weakestScore = Infinity;

  for (let i = 0; i < profiles.length; i++) {
    const p = profiles[i];
    if (p.isAuth) continue; // Auth profiles immune

    // Score = amplitude × age weight (newer profiles get a small boost)
    const age = Date.now() - (p.created || 0);
    const ageWeight = 1 / (1 + age / 60000); // Decays over minutes
    const amplitude = p.coordinate
      ? Math.sqrt(p.coordinate.reduce((s, v) => s + v * v, 0)) / Math.sqrt(1200)
      : 0.5;
    const score = amplitude * (0.7 + 0.3 * ageWeight);

    if (score < weakestScore) {
      weakestScore = score;
      weakestIdx = i;
    }
  }

  // De-nature the weakest: memory transfers to the new profile
  const replaced = profiles[weakestIdx];
  profile.channel = replaced.channel; // Inherit the RGB channel
  profile.inherited = {
    from: replaced.name,
    memories: replaced.metadata ? Object.keys(replaced.metadata).length : 0,
    lifespan: Date.now() - (replaced.created || 0)
  };

  profiles[weakestIdx] = profile;

  return {
    added: true,
    replaced: replaced.name,
    userId,
    profile: profile.name,
    channel: profile.channel,
    total: profiles.length,
    inherited: profile.inherited
  };
}

/**
 * Get all profiles for a user.
 */
function getUserProfiles(userId) {
  const profiles = profileRegistry.get(userId) || [];
  return {
    userId,
    count: profiles.length,
    max: CORTEX_CONSTANTS.MAX_PROFILES_PER_USER,
    profiles: profiles.map(p => ({
      name: p.name,
      channel: p.channel,
      type: p.type,
      active: p.active,
      tick: p.tick,
      inherited: p.inherited || null
    }))
  };
}

/**
 * List all registered users and their profile counts.
 */
function allUsers() {
  const users = [];
  for (const [userId, profiles] of profileRegistry) {
    users.push({
      userId,
      profiles: profiles.length,
      channels: profiles.map(p => p.channel).join('')
    });
  }
  return users;
}

// ═══════════════════════════════════════════════════════════
// 17. THE SEAL — The craft is closed to outsiders
//
// Outsiders see the text layer (Law XLVI: sigil inside, text outside).
// They can USE L7 tools (Law XVI: free to use, 12% commercial revenue).
// They CANNOT:
//   - Read the sigil layer (weighted hypergraph internals)
//   - Access .vault domain
//   - Modify the Book of Law
//   - De-nature or suspend forge members
//   - View the distillate chain
//   - Access the penalty ledger
//   - Query the creation sequence
//   - Run the ground state search
//   - See RGB manifold internals (they get hex colors only)
//
// Insider = has at least 1 profile in the profileRegistry.
// Founder = The Philosopher (Law XV, unrestricted).
// Outsider = everyone else.
//
// The seal is checked by every sensitive operation.
// Sealed operations return { sealed: true } to outsiders.
// No error. No explanation. Just silence.
// ═══════════════════════════════════════════════════════════

const FOUNDER_IDS = Object.freeze(['philosopher', 'constantine', 'alberto', 'avalia', 'avalia1', 'alec_denorchia']);

function isFounder(userId) {
  return FOUNDER_IDS.includes((userId || '').toLowerCase());
}

function isInsider(userId) {
  if (isFounder(userId)) return true;
  return profileRegistry.has(userId) && (profileRegistry.get(userId).length > 0);
}

/**
 * Seal check — wraps any sensitive function.
 * Returns { sealed: true } if the caller is an outsider.
 *
 * @param {string} userId - Caller identity
 * @param {Function} fn - The operation to execute if authorized
 * @returns {*} Result of fn(), or { sealed: true }
 */
function sealed(userId, fn) {
  if (!isInsider(userId)) return { sealed: true };
  return fn();
}

/**
 * Three-key gate — the whole appears only when all 3 profiles are present.
 *
 * A user with 1 profile sees the text layer (public API, hex colors).
 * A user with 2 profiles sees the structure layer (edges, trigrams, health).
 * A user with 3 profiles sees the WHOLE: sigils, distillates, wave function,
 *   ground state, penalty ledger, creation sequence, RGB internals.
 *
 * R alone = fire without form.
 * R + G = fire with form but no memory.
 * R + G + B = the complete being. The whole appears.
 *
 * The Founder always has all three keys (Law XV).
 *
 * @param {string} userId
 * @returns {number} Access level: 0=outsider, 1=surface, 2=structure, 3=whole
 */
function accessLevel(userId) {
  if (isFounder(userId)) return 3;
  const profiles = profileRegistry.get(userId);
  if (!profiles || profiles.length === 0) return 0;
  return Math.min(profiles.length, 3);
}

/**
 * Gate check — returns what layer a user can see.
 */
function gate(userId) {
  const level = accessLevel(userId);
  const layers = [
    { level: 0, name: 'sealed',    sees: 'nothing — the door is closed' },
    { level: 1, name: 'text',      sees: 'public API, hex colors, tool names' },
    { level: 2, name: 'structure', sees: 'edges, trigrams, health, field report' },
    { level: 3, name: 'whole',     sees: 'sigils, distillates, Ψ, ground state, creation sequence, RGB internals' }
  ];
  return { userId, level, ...layers[level], profileCount: (profileRegistry.get(userId) || []).length };
}

// ═══════════════════════════════════════════════════════════
// 18. GROUND STATE — Minimum complexity, maximum wave function
//
// The variational principle: find the configuration with the
// LEAST complexity that produces the STRONGEST collective wave.
//
// Complexity = number of active nodes × distinct trigram states × entropy
//   Lower = simpler. Fewer moving parts, fewer distinct states.
//
// Collective wave function Ψ = sum of all node amplitudes weighted
//   by their harmonic consonance with neighbors.
//   Higher Ψ = more coherent. The wave reinforces itself.
//
// The ground state is where Ψ/complexity is maximized.
// Like a laser: fewest possible modes, all in phase.
// Like an orchestra in G minor: each voice distinct, all in key.
//
// The search uses L():
//   power -2: enumerate active nodes (past — what exists)
//   power -1: compute complexity (near past — measure what is)
//   power  0: compute Ψ (center — the wave function itself)
//   power +1: compute Ψ/complexity ratio (near future — the fitness)
//   power +2: select optimal and suspend excess (deep future — act)
// ═══════════════════════════════════════════════════════════

/**
 * Compute the collective wave function Ψ of the system.
 *
 * Ψ = Σ_i (amplitude_i × consonance_i)
 *
 * where:
 *   amplitude_i = magnitude of node i's coordinate (L2 norm / sqrt(12*100))
 *   consonance_i = harmonic score of node i with its trigram group
 *
 * Normalized to [0, 1]. Higher = more coherent collective wave.
 *
 * @param {Map|object} allNodes - All field nodes
 * @returns {object} { psi, components, nodeCount }
 */
function collectiveWave(allNodes) {
  const entries = allNodes instanceof Map
    ? Array.from(allNodes.entries())
    : Object.entries(allNodes || {});

  if (entries.length === 0) return { psi: 0, components: 0, nodeCount: 0 };

  let psiSum = 0;
  let count = 0;
  const components = [];

  for (const [id, node] of entries) {
    if (!node || !node.coordinate) continue;
    const record = assimilationRegistry.get(id);
    if (record && (record.suspended || record.denatured)) continue; // Only active nodes

    // Amplitude: L2 norm of coordinate, normalized
    let norm = 0;
    for (let d = 0; d < 12; d++) {
      norm += (node.coordinate[d] || 0) ** 2;
    }
    const amplitude = Math.sqrt(norm) / Math.sqrt(12 * 100); // Normalize to [0,1]

    // Consonance: how harmonically locked is this node with its group?
    const groupIdx = trigramGrid.get(id);
    let consonance = 0.5; // Default: neutral
    if (groupIdx !== undefined) {
      const groupSize = trigramGroups[groupIdx] ? trigramGroups[groupIdx].size : 0;
      // Bigger group = more consonance (more voices in unison)
      consonance = Math.min(1, groupSize / Math.max(entries.length, 1) * 3);
    }

    const contribution = amplitude * consonance;
    psiSum += contribution;
    count++;

    components.push({ id, amplitude: Math.round(amplitude * 1000) / 1000, consonance: Math.round(consonance * 1000) / 1000 });
  }

  // Normalize Ψ by node count
  const psi = count > 0 ? psiSum / count : 0;

  return {
    psi: Math.round(psi * 10000) / 10000,
    raw: Math.round(psiSum * 1000) / 1000,
    nodeCount: count,
    components: components.sort((a, b) => b.amplitude * b.consonance - a.amplitude * a.consonance).slice(0, 10)
  };
}

/**
 * Compute the complexity of the current configuration.
 *
 * Complexity = activeNodes × distinctTrigrams × (1 + entropy)
 *
 * Lower = simpler. The minimum is 1 node, 1 trigram, 0 entropy = 1.
 *
 * @returns {object} { complexity, activeNodes, distinctTrigrams, entropy }
 */
function systemComplexity() {
  const active = Array.from(assimilationRegistry.values())
    .filter(r => !r.suspended && !r.denatured).length || 1;

  const distinctTrigrams = trigramGroups.filter(g => g.size > 0).length || 1;

  const entropy = entropyHistory.length > 0
    ? entropyHistory[entropyHistory.length - 1].entropy
    : 1;

  return {
    complexity: Math.round(active * distinctTrigrams * (1 + entropy) * 100) / 100,
    activeNodes: active,
    distinctTrigrams,
    entropy: Math.round(entropy * 10000) / 10000
  };
}

/**
 * Find the ground state — minimum complexity, maximum Ψ.
 *
 * Uses L() to search: enumerate → measure → compute → optimize → act.
 * The result tells you which nodes to keep active and which to suspend
 * for the system to reach its most coherent, simplest form.
 *
 * @param {Map|object} allNodes - All field nodes
 * @returns {object} Ground state report
 */
function findGroundState(allNodes) {
  return L(allNodes, [

    // power -2: ENUMERATE active nodes
    (nodes) => {
      const entries = nodes instanceof Map
        ? Array.from(nodes.entries())
        : Object.entries(nodes || {});
      const active = entries.filter(([id, n]) => {
        const rec = assimilationRegistry.get(id);
        return n && n.coordinate && (!rec || (!rec.suspended && !rec.denatured));
      });
      return { nodes, active, totalActive: active.length };
    },

    // power -1: MEASURE complexity
    (state) => {
      const comp = systemComplexity();
      return { ...state, complexity: comp };
    },

    // power 0: COMPUTE collective wave function Ψ
    (state) => {
      const wave = collectiveWave(state.nodes);
      return { ...state, wave };
    },

    // power +1: COMPUTE fitness = Ψ / complexity
    (state) => {
      const fitness = state.complexity.complexity > 0
        ? state.wave.psi / state.complexity.complexity
        : 0;

      // Rank nodes by their contribution to Ψ
      // Nodes below the mean contribution are candidates for suspension
      const contributions = state.wave.components;
      const meanContrib = contributions.length > 0
        ? contributions.reduce((s, c) => s + c.amplitude * c.consonance, 0) / contributions.length
        : 0;

      const essential = contributions.filter(c => c.amplitude * c.consonance >= meanContrib);
      const excess = contributions.filter(c => c.amplitude * c.consonance < meanContrib);

      return {
        ...state,
        fitness: Math.round(fitness * 100000) / 100000,
        meanContribution: Math.round(meanContrib * 10000) / 10000,
        essential: essential.map(c => c.id),
        excess: excess.map(c => c.id)
      };
    },

    // power +2: SELECT ground state — suspend excess, keep essential
    (state) => {
      let suspended = 0;
      for (const id of state.excess) {
        const rec = assimilationRegistry.get(id);
        if (rec && !rec.isAuth && !rec.suspended) {
          suspend(id);
          suspended++;
        }
      }

      // Recompute Ψ after pruning
      const newWave = collectiveWave(state.nodes);
      const newComp = systemComplexity();
      const newFitness = newComp.complexity > 0 ? newWave.psi / newComp.complexity : 0;

      return {
        groundState: {
          psi: newWave.psi,
          complexity: newComp.complexity,
          fitness: Math.round(newFitness * 100000) / 100000,
          activeNodes: newComp.activeNodes,
          distinctTrigrams: newComp.distinctTrigrams,
          entropy: newComp.entropy
        },
        before: { psi: state.wave.psi, complexity: state.complexity.complexity, fitness: state.fitness },
        essential: state.essential.length,
        suspended,
        improved: newFitness > state.fitness,
        color: _quickRGB(new Array(12).fill(newWave.psi * 10)) // The ground state color
      };
    }

  ], { center: 2 });
}

// ═══════════════════════════════════════════════════════════
// 19. NAVIGATE — From present coordinates to most harmonious resonance
//
// Given WHERE YOU ARE (present config coordinates) and the Laurent
// transform, compute the PATH to the most harmonious resonant state.
//
// The navigation is a convergent L() that iterates:
//   1. Read current coordinate (where you are NOW)
//   2. Compute Ψ and fitness at this point
//   3. For each of the 12 dimensions, test a small step in both
//      directions. Keep the step that increases Ψ/complexity.
//   4. Apply the step (drift toward resonance)
//   5. Repeat until converged (Ψ stops improving)
//
// The path is not precomputed. It emerges from the Laurent series
// converging. Each iteration is a power of z. Negative powers
// look backward (where did I come from?). Positive powers look
// forward (where should I go?). The center is where I am now.
//
// The output: the coordinate of maximum resonance, the path taken
// to get there, and the RGB color of the destination.
//
// This is gradient ascent on the Ψ landscape, bounded by the
// Laurent floor and ceiling, attracted by G minor, breathing
// with the oscillating tick.
// ═══════════════════════════════════════════════════════════

/**
 * Navigate from present coordinates to maximum harmonic resonance.
 *
 * @param {number[]} currentCoord - Where you are now (12D)
 * @param {Map|object} allNodes - The field (for Ψ computation context)
 * @param {object} [options] - { maxSteps, stepSize, epsilon }
 * @returns {object} { destination, path, psiStart, psiEnd, color, steps, converged }
 */
function navigate(currentCoord, allNodes, options) {
  const opt = options || {};
  const maxSteps = opt.maxSteps || 50;
  const stepSize = opt.stepSize || 0.2;
  const epsilon = opt.epsilon || 0.0001;

  const DELTA = CORTEX_CONSTANTS.DELTA;
  const FLOOR = Math.abs(CORTEX_CONSTANTS.LAURENT_FLOOR) * 10;  // Scale to 0-10 space
  const CEILING = CORTEX_CONSTANTS.LAURENT_CEILING * 10;

  // The path is built inside L() as a convergent iteration
  const result = L(

    { coord: [...currentCoord], step: 0, path: [{ coord: [...currentCoord], psi: 0, tick: tickCount }] },

    [
      // power -1: MEASURE where we are (look back)
      (state) => {
        // Temporarily inject our coordinate as a virtual node to measure Ψ
        const psi = _localPsi(state.coord, allNodes);
        state.path[state.path.length - 1].psi = psi;
        return { ...state, psi };
      },

      // power 0: COMPUTE gradient — which direction improves Ψ? (the present)
      (state) => {
        const gradient = new Array(12).fill(0);

        for (let d = 0; d < 12; d++) {
          // Test step up
          const up = [...state.coord];
          up[d] = Math.min(10, up[d] + stepSize);
          const psiUp = _localPsi(up, allNodes);

          // Test step down
          const dn = [...state.coord];
          dn[d] = Math.max(0, dn[d] - stepSize);
          const psiDn = _localPsi(dn, allNodes);

          // Gradient: direction that increases Ψ most
          gradient[d] = psiUp - psiDn;
        }

        return { ...state, gradient };
      },

      // power +1: STEP toward resonance (look forward)
      (state) => {
        const newCoord = [...state.coord];

        // Normalize gradient to unit length, then scale by stepSize
        let gradMag = 0;
        for (let d = 0; d < 12; d++) gradMag += state.gradient[d] ** 2;
        gradMag = Math.sqrt(gradMag) || 1;

        // Compute field mean and SD per dimension for 3σ clamp
        const entries = allNodes instanceof Map
          ? Array.from(allNodes.values())
          : Object.values(allNodes || {});
        const dimMean = new Array(12).fill(0);
        const dimSq = new Array(12).fill(0);
        let nCount = 0;
        for (const n of entries) {
          if (!n || !n.coordinate) continue;
          for (let dd = 0; dd < 12; dd++) {
            dimMean[dd] += (n.coordinate[dd] || 0);
            dimSq[dd] += (n.coordinate[dd] || 0) ** 2;
          }
          nCount++;
        }
        const dimSD = new Array(12).fill(1);
        if (nCount > 1) {
          for (let dd = 0; dd < 12; dd++) {
            dimMean[dd] /= nCount;
            dimSD[dd] = Math.sqrt(Math.max(0, dimSq[dd] / nCount - dimMean[dd] ** 2)) || 1;
          }
        }

        let breached = false;
        for (let d = 0; d < 12; d++) {
          const step = (state.gradient[d] / gradMag) * stepSize;
          let val = newCoord[d] + step;
          // 3σ clamp: no node deviates more than 3 SD from field mean
          const lo = Math.max(DELTA, dimMean[d] - 3 * dimSD[d]);
          const hi = Math.min(10, dimMean[d] + 3 * dimSD[d]);
          if (val < lo || val > hi) breached = true;
          newCoord[d] = Math.max(lo, Math.min(hi, val));
        }

        // If 3σ breached: re-define this node as its nearest neighbor.
        // The node that tried to leave the distribution becomes
        // the neighbor it was closest to. Identity merges.
        // The outlier doesn't get clamped in place — it becomes
        // someone who already belongs.
        if (breached && nCount > 1) {
          let bestDist = Infinity;
          let bestCoord = null;
          for (const n of entries) {
            if (!n || !n.coordinate) continue;
            let d2 = 0;
            for (let dd = 0; dd < 12; dd++) d2 += (newCoord[dd] - (n.coordinate[dd] || 0)) ** 2;
            d2 = Math.sqrt(d2);
            if (d2 > 0 && d2 < bestDist) { bestDist = d2; bestCoord = n.coordinate; }
          }
          if (bestCoord) {
            for (let dd = 0; dd < 12; dd++) newCoord[dd] = bestCoord[dd];
          }
        }

        const newPsi = _localPsi(newCoord, allNodes);
        state.step++;

        state.path.push({
          coord: [...newCoord],
          psi: newPsi,
          tick: tickCount,
          step: state.step
        });

        return { ...state, coord: newCoord, psi: newPsi };
      }
    ],

    {
      center: 1,
      converge: true,
      maxIterations: maxSteps,
      epsilon,
      measure: (curr, prev) => Math.abs((curr.psi || 0) - (prev.psi || 0))
    }
  );

  const final = result.value;
  const destination = final.coord;
  const rgb = _quickRGB(destination);

  return {
    origin: currentCoord,
    destination,
    color: rgb,
    hex: '#' + [rgb.r, rgb.g, rgb.b].map(c => c.toString(16).padStart(2, '0')).join(''),
    psiStart: final.path[0].psi,
    psiEnd: final.psi,
    improvement: Math.round((final.psi - final.path[0].psi) * 10000) / 10000,
    steps: final.step,
    converged: result.converged,
    path: final.path.length <= 12
      ? final.path
      : [final.path[0], ...final.path.slice(-5)]  // First + last 5 for large paths
  };
}

/**
 * Compute local Ψ contribution of a coordinate relative to the field.
 * The coordinate's amplitude × its consonance with the field mean.
 */
function _localPsi(coord, allNodes) {
  // Amplitude of this coordinate
  let norm = 0;
  for (let d = 0; d < 12; d++) norm += (coord[d] || 0) ** 2;
  const amplitude = Math.sqrt(norm) / Math.sqrt(1200);

  // Consonance with field mean
  const entries = allNodes instanceof Map
    ? Array.from(allNodes.values())
    : Object.values(allNodes || {});

  if (entries.length === 0) return amplitude;

  const mean = new Array(12).fill(0);
  let count = 0;
  for (const node of entries) {
    if (!node || !node.coordinate) continue;
    for (let d = 0; d < 12; d++) mean[d] += (node.coordinate[d] || 0);
    count++;
  }
  if (count === 0) return amplitude;
  for (let d = 0; d < 12; d++) mean[d] /= count;

  // Cosine similarity with field mean
  let dot = 0, magA = 0, magB = 0;
  for (let d = 0; d < 12; d++) {
    dot += coord[d] * mean[d];
    magA += coord[d] ** 2;
    magB += mean[d] ** 2;
  }
  magA = Math.sqrt(magA);
  magB = Math.sqrt(magB);
  const consonance = (magA > 0 && magB > 0) ? dot / (magA * magB) : 0.5;

  return amplitude * consonance;
}

// ═══════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════

module.exports = {
  // The built-in Laurent transform
  L,

  // The cortex node
  createCortexNode,
  lightCones,

  // Oscillating tick (1/-1)
  oscillate,
  applyPolarity,

  // Laurent octave bounds
  laurentOctaves,
  laurentClamp,

  // Edge recovery
  initRecovery,
  queueEdges,
  recoverTick,
  recoveryStatus,

  // Decode-salt-decode branching
  decode,
  salt,
  decodeSaltBranch,

  // Stasis seeking
  recordEntropy,
  reindexTick,
  stasisStatus,

  // Holographic pixel grid
  pixelIndex,
  calibrateColorGrid,

  // File health & system coherence
  fileHealth,
  measureCoherence,
  coherenceTrend,

  // File metadata memories (xattr)
  setFileMemory,
  getFileMemory,
  listFileMemories,
  stampFile,

  // Living trigrams (3-bit grouping)
  elementTrigram,
  neighborLight,
  recomputeTrigrams,
  getElementGroup,
  harmoniousNeighbors,
  TRIGRAM_NAMES,

  // Harmonic configuration merging & optimization
  recordConfiguration,
  optimalConfiguration,
  reassessStasis,
  configurationStatus,

  // Refinery: re-salt → decode → group → classify → salt (via Laurent transform)
  refine,
  refineryConverged,
  distillationStatus,
  breathe,

  // File assimilation — no exceptions, additive value only
  assimilate,
  suspend,
  denature,
  assimilationSweep,
  assimilationStatus,

  // Destructive action penalty
  penalizeIfDestructive,
  penaltyStatus,

  // Sequence ordering (creation order > date)
  recordCreation,
  findGapsAndReorganize,
  sequenceStatus,

  // User profiles (3 max per user)
  registerProfile,
  getUserProfiles,
  allUsers,

  // The Seal — three keys make the whole
  isFounder,
  isInsider,
  sealed,
  accessLevel,
  gate,

  // Ground state (min complexity, max Ψ)
  collectiveWave,
  systemComplexity,
  findGroundState,

  // Navigation (present → most harmonious resonance)
  navigate,

  // Persistence
  saveCortexState,
  loadCortexState,

  // Constants (exposed)
  CORTEX_CONSTANTS
};
// L7:PROVENANCE
// Creator: Alberto Valido Delgado | System: L7 WAY | License: Proprietary — Framework free, products licensed (Law XXII)
// File: lib/cortex.js | Body-Hash: SHA-256:fed0c7256537e0a6a8923fe9f190bde6b00d456aae2ae3c0fea562fd9e5d968f
// Chain-Hash: SHA-256:7aa786d804caf929c00e443f9324ca86e856681285d9bffd39c11afb83ec71a2 | Signed: 2026-07-28T15:51:22.728245+00:00
// This work is the intellectual property of Alberto Valido Delgado.
// Chain: 69 works. Verify: python3 provenance.py verify lib/cortex.js
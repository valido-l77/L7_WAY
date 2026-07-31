'use strict';

const DEFAULT_LAYERS = Object.freeze(['ABOVE', 'MIRROR', 'BELOW']);

function normalizeState(value, maxDepth) {
  const depth = Number.isInteger(value?.morphDepth) ? value.morphDepth : 0;
  const locked = value?.morphLocked === true;
  if (depth < 0 || depth > maxDepth) {
    throw new Error(`Invalid morph depth: ${depth}`);
  }
  if (locked && depth !== 0) {
    throw new Error('A locked morph cycle must have depth 0');
  }
  return { depth, locked };
}

class MorphCycle {
  constructor(options = {}) {
    this.layers = Object.freeze([...(options.layers || DEFAULT_LAYERS)]);
    this.maxDepth = this.layers.length;
    this.persist = options.persist || (() => {});
    const restored = normalizeState(options.initialState, this.maxDepth);
    this.depth = restored.depth;
    this.locked = restored.locked;
  }

  snapshot() {
    return Object.freeze({
      version: 1,
      morphDepth: this.depth,
      morphLocked: this.locked,
      state: this.locked ? 'crystallized' : this.depth === 0 ? 'ready' : 'dreaming',
      currentLayer: this.depth > 0 ? this.layers[this.depth - 1] : null,
      nextLayer: !this.locked && this.depth < this.maxDepth ? this.layers[this.depth] : null,
    });
  }

  next() {
    if (this.locked) {
      throw new Error(
        'MORPH LOCKED: Dreams have been crystallized into .salt. ' +
        'Approval required to start a new dream cycle. Call approveDreamCycle().'
      );
    }
    if (this.depth >= this.maxDepth) {
      throw new Error('Morph cycle is complete and must crystallize');
    }
    return Object.freeze({
      depth: this.depth + 1,
      layer: this.layers[this.depth],
      shouldCrystallize: this.depth + 1 === this.maxDepth,
    });
  }

  advance() {
    const transition = this.next();
    this._commit(transition.depth, false);
    return transition;
  }

  canCrystallize() {
    return !this.locked && this.depth === this.maxDepth;
  }

  assertCanCrystallize() {
    if (this.locked) {
      throw new Error('MORPH LOCKED: The current dream cycle is already crystallized');
    }
    if (this.depth !== this.maxDepth) {
      throw new Error(`Cannot crystallize before ${this.maxDepth} dream layers are complete`);
    }
    return true;
  }

  crystallize() {
    if (this.locked) return this.snapshot();
    this.assertCanCrystallize();
    this._commit(0, true);
    return this.snapshot();
  }

  approve() {
    if (!this.locked) {
      throw new Error('Morph cycle is already open');
    }
    this._commit(0, false);
    return this.snapshot();
  }

  releaseLayer() {
    if (!this.locked && this.depth > 0) {
      this._commit(this.depth - 1, false);
    }
    return this.snapshot();
  }

  _commit(depth, locked) {
    // Persistence is the durable boundary. Do not expose new in-memory state
    // unless the backing store accepted it.
    this.persist(depth, locked);
    this.depth = depth;
    this.locked = locked;
  }
}

module.exports = { DEFAULT_LAYERS, MorphCycle, normalizeState };

// L7:PROVENANCE
// Creator: Alberto Valido Delgado | System: L7 WAY | License: Proprietary — Framework free, products licensed (Law XXII)
// File: lib/morph-cycle.js | Body-Hash: SHA-256:dfcbfceb79660362cd83e1f35a3967c1d1e67e64ef96809d4fa78cae69a1eb87
// Chain-Hash: SHA-256:76f792b09c3cf7b2c4f799027a927d367c9bedf95dd6f0d8cfca519396a1a2ec | Signed: 2026-07-18T06:20:39.637474+00:00
// This work is the intellectual property of Alberto Valido Delgado.
// Chain: 40 works. Verify: python3 provenance.py verify lib/morph-cycle.js
// L7:PROVENANCE

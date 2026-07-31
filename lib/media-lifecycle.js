'use strict';

const { CONTRACT_VERSIONS } = require('./contracts');

const EXPECTED_LAYERS = Object.freeze(['ABOVE', 'MIRROR', 'BELOW']);

class DomainMediaLifecycle {
  constructor(options = {}) {
    this.domains = options.domains || null;
  }

  domainOperations() {
    // Lazy loading keeps pure planning and validation free of live filesystem
    // mutation. Production execution still defaults to the canonical domains.
    if (!this.domains) this.domains = require('./domains');
    return this.domains;
  }

  recoverCrystallization(domains, plan) {
    if (typeof domains.read !== 'function') return null;
    const artifacts = EXPECTED_LAYERS.map((name, index) => {
      const filename = `${plan.id}.${index + 1}-${name.toLowerCase()}.json`;
      const artifact = domains.read('salt', filename);
      if (
        !artifact
        || artifact.content?.plan_id !== plan.id
        || artifact.content?.plan_hash !== plan.provenance.plan_hash
        || artifact.content?.layer?.name !== name
      ) {
        return null;
      }
      return { filename, artifact, depth: index + 1, name };
    });
    if (artifacts.some(item => item === null)) return null;

    return {
      contract_version: CONTRACT_VERSIONS.mediaCrystallization,
      plan_id: plan.id,
      state: 'crystallized',
      target_domain: '.salt',
      cycle_locked: true,
      layer_receipts: artifacts.map(item => ({
        depth: item.depth,
        name: item.name,
        artifact: item.filename,
        checksum: item.artifact._checksum,
      })),
      salt_artifacts: artifacts.map(item => item.filename),
      created_at: new Date().toISOString(),
    };
  }

  async commit(plan, layers) {
    const domains = this.domainOperations();
    if (!Array.isArray(layers) || layers.length !== EXPECTED_LAYERS.length) {
      throw new Error('media lifecycle requires exactly three completed layers');
    }
    for (let index = 0; index < EXPECTED_LAYERS.length; index++) {
      if (layers[index]?.name !== EXPECTED_LAYERS[index] || layers[index]?.depth !== index + 1) {
        throw new Error(`media lifecycle layer ${index + 1} must be ${EXPECTED_LAYERS[index]}`);
      }
    }

    const before = domains.morphState;
    if (before?.morphLocked) {
      const recovered = this.recoverCrystallization(domains, plan);
      if (recovered) return recovered;
      throw new Error('MORPH LOCKED: explicit approval is required before another media cycle');
    }
    if (before?.morphDepth !== 0) {
      throw new Error(`morph domain already contains an incomplete cycle at depth ${before?.morphDepth}`);
    }

    const receipts = [];
    let crystallized = [];
    for (const layer of layers) {
      const filename = `${plan.id}.${layer.depth}-${layer.name.toLowerCase()}.json`;
      const artifact = await domains.write('morph', filename, {
        plan_id: plan.id,
        plan_hash: plan.provenance.plan_hash,
        identity_invariant: plan.request.identity,
        layer,
      }, {
        kind: 'morphic-media-layer',
        plan_id: plan.id,
        plan_hash: plan.provenance.plan_hash,
        layer_depth: layer.depth,
        layer_name: layer.name,
      });

      if (artifact?.metadata?._morphName !== layer.name) {
        throw new Error(`domain assigned ${artifact?.metadata?._morphName || 'unknown'} to ${layer.name}`);
      }
      receipts.push({
        depth: layer.depth,
        name: layer.name,
        artifact: filename,
        checksum: artifact._checksum,
      });
      if (Array.isArray(artifact.crystallized)) crystallized = artifact.crystallized;
    }

    const after = domains.morphState;
    if (!after?.morphLocked || after?.morphDepth !== 0 || crystallized.length !== 3) {
      throw new Error('media lifecycle did not finish in a locked SALT state');
    }

    return {
      contract_version: CONTRACT_VERSIONS.mediaCrystallization,
      plan_id: plan.id,
      state: 'crystallized',
      target_domain: '.salt',
      cycle_locked: true,
      layer_receipts: receipts,
      salt_artifacts: crystallized,
      created_at: new Date().toISOString(),
    };
  }
}

function createDomainMediaLifecycle(options = {}) {
  return new DomainMediaLifecycle(options);
}

module.exports = { EXPECTED_LAYERS, DomainMediaLifecycle, createDomainMediaLifecycle };

// L7:PROVENANCE
// Creator: Alberto Valido Delgado | System: L7 WAY | License: Proprietary — Framework free, products licensed (Law XXII)
// File: lib/media-lifecycle.js | Body-Hash: SHA-256:3b29d4ed4c0695a40b417f0edee56660d62a9a90561684ac9e28f6e93df64d9b
// Chain-Hash: SHA-256:82b14481c16538aa969602cbfd3482bdff21676f37d86148c8a9a51b6f878a59 | Signed: 2026-07-24T04:13:53.225043+00:00
// This work is the intellectual property of Alberto Valido Delgado.
// Chain: 50 works. Verify: python3 provenance.py verify lib/media-lifecycle.js
// L7:PROVENANCE
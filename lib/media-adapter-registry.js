'use strict';

const HEALTH_STATES = Object.freeze(['declared', 'configured', 'healthy', 'degraded', 'offline']);

function assertNonEmpty(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} must be a non-empty string`);
  return value.trim();
}

function normalizeDescriptor(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('adapter descriptor must be an object');
  }
  const capabilities = Array.from(new Set(input.capabilities || []));
  if (!capabilities.length || capabilities.some(item => typeof item !== 'string' || !item)) {
    throw new TypeError('adapter capabilities must contain at least one non-empty string');
  }
  if (typeof input.execute !== 'function') throw new TypeError('adapter execute must be a function');
  const health = input.health || 'configured';
  if (!HEALTH_STATES.includes(health)) throw new Error(`unsupported adapter health: ${health}`);
  return Object.freeze({
    name: assertNonEmpty(input.name, 'adapter name'),
    version: assertNonEmpty(input.version, 'adapter version'),
    provider: assertNonEmpty(input.provider, 'adapter provider'),
    capabilities: Object.freeze(capabilities),
    health,
    execute: input.execute,
  });
}

class MediaAdapterRegistry {
  constructor(descriptors = []) {
    this.adapters = new Map();
    for (const descriptor of descriptors) this.register(descriptor);
  }

  register(input) {
    const descriptor = normalizeDescriptor(input);
    if (this.adapters.has(descriptor.name)) throw new Error(`media adapter already registered: ${descriptor.name}`);
    this.adapters.set(descriptor.name, descriptor);
    return descriptor;
  }

  resolve(capability, preferredName) {
    if (preferredName) {
      const preferred = this.adapters.get(preferredName);
      if (!preferred) throw new Error(`media adapter is not registered: ${preferredName}`);
      if (!preferred.capabilities.includes(capability)) {
        throw new Error(`media adapter ${preferredName} does not support ${capability}`);
      }
      if (preferred.health === 'offline' || preferred.health === 'declared') {
        throw new Error(`media adapter ${preferredName} is ${preferred.health}`);
      }
      return preferred;
    }
    const match = Array.from(this.adapters.values()).find(descriptor =>
      descriptor.capabilities.includes(capability)
      && descriptor.health !== 'offline'
      && descriptor.health !== 'declared'
    );
    if (!match) throw new Error(`no configured adapter registered for ${capability}`);
    return match;
  }

  describe() {
    return Array.from(this.adapters.values()).map(({ execute: _execute, ...descriptor }) => descriptor);
  }
}

function registryFromHandlers(handlers, options = {}) {
  const provider = options.provider || 'avli-cloud';
  const version = options.version || '1.0.0';
  const prefix = options.prefix || 'avli';
  return new MediaAdapterRegistry(Object.entries(handlers).map(([capability, execute]) => ({
    name: `${prefix}.${capability}`,
    version,
    provider,
    capabilities: [capability],
    health: 'healthy',
    execute,
  })));
}

module.exports = {
  HEALTH_STATES,
  MediaAdapterRegistry,
  normalizeDescriptor,
  registryFromHandlers,
};
// L7:PROVENANCE
// Creator: Alberto Valido Delgado | System: L7 WAY | License: Proprietary — Framework free, products licensed (Law XXII)
// File: lib/media-adapter-registry.js | Body-Hash: SHA-256:7b9269a6aabc0ffad03f7675d2b6dc2894938852f1fbc4db8bf4a67b2375d137
// Chain-Hash: SHA-256:9097eedab5889f31b197beaaf468287558278ecb137246489b8d8f0bd3ec385f | Signed: 2026-07-28T15:51:22.864379+00:00
// This work is the intellectual property of Alberto Valido Delgado.
// Chain: 73 works. Verify: python3 provenance.py verify lib/media-adapter-registry.js
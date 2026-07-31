'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  HEALTH_STATES,
  MediaAdapterRegistry,
  registryFromHandlers,
} = require('../lib/media-adapter-registry');

test('adapter registry publishes capability and health metadata without functions', () => {
  const execute = async () => ({ bytes: Buffer.from('x'), mediaType: 'image/png' });
  const registry = new MediaAdapterRegistry([{
    name: 'local.field',
    version: '1.0.0',
    provider: 'l7-local',
    capabilities: ['image.generate'],
    health: 'healthy',
    execute,
  }]);

  assert.deepEqual(HEALTH_STATES, ['declared', 'configured', 'healthy', 'degraded', 'offline']);
  assert.equal(registry.resolve('image.generate').execute, execute);
  assert.deepEqual(registry.describe(), [{
    name: 'local.field',
    version: '1.0.0',
    provider: 'l7-local',
    capabilities: ['image.generate'],
    health: 'healthy',
  }]);
});

test('adapter registry refuses declared, offline, duplicate, and mismatched adapters', () => {
  const execute = async () => {};
  const registry = new MediaAdapterRegistry([{
    name: 'remote.declared', version: '1', provider: 'remote',
    capabilities: ['image.generate'], health: 'declared', execute,
  }]);
  assert.throws(() => registry.resolve('image.generate'), /no configured adapter/);
  assert.throws(() => registry.resolve('image.generate', 'remote.declared'), /is declared/);
  assert.throws(() => registry.register({
    name: 'remote.declared', version: '1', provider: 'remote',
    capabilities: ['video.generate'], execute,
  }), /already registered/);
  assert.throws(() => registry.resolve('video.generate', 'remote.declared'), /does not support/);
});

test('plain handler maps remain supported through registry adaptation', () => {
  const handler = async () => {};
  const registry = registryFromHandlers({ 'image.generate': handler }, {
    provider: 'test-provider', prefix: 'test', version: '2.0.0',
  });
  const adapter = registry.resolve('image.generate');
  assert.equal(adapter.name, 'test.image.generate');
  assert.equal(adapter.provider, 'test-provider');
  assert.equal(adapter.version, '2.0.0');
  assert.equal(adapter.execute, handler);
});

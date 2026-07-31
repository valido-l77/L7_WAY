'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');

const {
  CONTRACT_VERSIONS,
  LIFECYCLE_STATES,
  LIFECYCLE_TRANSITIONS,
  normalizeLifecycle,
  normalizeExecutionResult,
} = require('../lib/contracts');

const ROOT = path.join(__dirname, '..');
const schema = name => JSON.parse(fs.readFileSync(path.join(ROOT, 'schema', 'v1', name), 'utf8'));

test('runtime and published contract version identifiers agree', () => {
  assert.deepEqual(schema('contract-versions.json'), CONTRACT_VERSIONS);
});

test('canonical lifecycle has one explicit legacy mapping', () => {
  assert.deepEqual(LIFECYCLE_STATES, [
    'summoned', 'oath', 'formed', 'serving', 'mature', 'sunset', 'archived',
  ]);
  assert.equal(normalizeLifecycle('active'), 'serving');
  assert.equal(normalizeLifecycle('deprecated'), 'sunset');
  assert.equal(normalizeLifecycle('unknown'), null);
  assert.deepEqual(LIFECYCLE_TRANSITIONS.formed, ['serving']);
  assert.deepEqual(LIFECYCLE_TRANSITIONS.archived, []);
});

test('normalization emits canonical result fields and legacy aliases', () => {
  const timestamp = '2026-07-20T00:00:00.000Z';
  const result = normalizeExecutionResult(
    { ok: true, greeting: 'hello' },
    { timestamp, tool: 'greeter', entityId: 'tool.greeter' },
  );

  assert.deepEqual(result, {
    success: true,
    result: { greeting: 'hello' },
    error: null,
    meta: {
      contract_version: 'l7.result/1.0',
      timestamp,
      entity_id: 'tool.greeter',
      tool: 'greeter',
    },
    ok: true,
    greeting: 'hello',
  });
});

test('normalization fails closed on non-boolean success flags', () => {
  const result = normalizeExecutionResult(
    { success: 0, result: { unsafe: true } },
    { timestamp: '2026-07-20T00:00:00.000Z' },
  );

  assert.equal(result.success, false);
  assert.equal(result.ok, false);
  assert.match(result.error, /expected boolean/);
  assert.equal(result.meta.error_code, 'PROVIDER_FAILURE');
});

test('provider metadata cannot replace canonical result invariants', () => {
  const result = normalizeExecutionResult({
    ok: true,
    meta: {
      contract_version: 'foreign/9.9',
      timestamp: '2020-01-01T00:00:00.000Z',
      provider: 'example',
    },
  }, {
    timestamp: '2026-07-20T00:00:00.000Z',
    meta: { contract_version: 'also-foreign/1.0' },
  });

  assert.equal(result.meta.contract_version, CONTRACT_VERSIONS.result);
  assert.equal(result.meta.timestamp, '2026-07-20T00:00:00.000Z');
  assert.equal(result.meta.provider, 'example');
});

test('canonical result schema accepts normalized success and failure results', () => {
  const ajv = new Ajv({ strict: false, formats: { 'date-time': true, date: true } });
  const validate = ajv.compile(schema('result.schema.json'));
  const timestamp = '2026-07-20T00:00:00.000Z';

  assert.equal(validate(normalizeExecutionResult('ok', { timestamp })), true, JSON.stringify(validate.errors));
  assert.equal(validate(normalizeExecutionResult(
    { ok: false, error: 'denied' },
    { timestamp, errorCode: 'POLICY_DENIED' },
  )), true, JSON.stringify(validate.errors));

  assert.equal(validate({
    success: true,
    result: null,
    error: 'contradiction',
    ok: false,
    meta: { contract_version: CONTRACT_VERSIONS.result, timestamp },
  }), false, 'success/error and success/ok contradictions are rejected');
});

test('entity schema keeps public 7D declaration separate from internal projection', () => {
  const ajv = new Ajv({ strict: false, formats: { 'date-time': true, date: true } });
  const lingua = schema('common-lingua.schema.json');
  ajv.addSchema(lingua);
  const validate = ajv.compile(schema('entity.schema.json'));
  const entity = {
    contract_version: 'l7.entity/1.0',
    entity_id: 'tool.greeter',
    entity_type: 'tool',
    birth_date: '2026-07-20',
    owner: 'AVLI Cloud LLC',
    lifecycle: 'formed',
    lineage: [],
    l7_declaration: {
      capability: 'communicate',
      data: { pii: 'non_pii', source: 'internal', shape: 'record', freshness: 'live' },
      policyIntent: { mode: 'test', risk: 'low', requireApproval: false, compliance: 'standard' },
      presentation: { ui: 'card', output: 'json', density: 'compact' },
      orchestration: { flow: 'single', trigger: 'manual', retry: 'none' },
      timeVersioning: { toolVersion: 'v1', schemaVersion: 'v1', lifecycle: 'formed' },
      identitySecurity: { role: 'operator', auth: 'token', audit: 'on' }
    },
    projection: {
      version: 'l7.projection.12d/1.0',
      coordinate: [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
      astrocyte: 0.42,
      evidence: []
    }
  };

  assert.equal(validate(entity), true, JSON.stringify(validate.errors));
  entity.projection.coordinate[0] = 11;
  assert.equal(validate(entity), false);
});

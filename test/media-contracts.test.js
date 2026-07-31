'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');
const { CONTRACT_VERSIONS } = require('../lib/contracts');
const { createMorphicPlan } = require('../lib/morphic-media');
const { LocalContentStore } = require('../lib/media-storage');
const { MediaRunner } = require('../lib/media-runner');

const ROOT = path.join(__dirname, '..');
const schema = name => JSON.parse(fs.readFileSync(path.join(ROOT, 'schema', 'v1', name), 'utf8'));

function validator(name) {
  const ajv = new Ajv({ strict: false, formats: { 'date-time': true } });
  ajv.addSchema(schema('media-definitions.schema.json'));
  return ajv.compile(schema(name));
}

test('normalized media request, jobs, and plan satisfy their published schemas', () => {
  const plan = createMorphicPlan({
    brief: 'a copper observatory above the ocean',
    identity: 'one observatory supported by three arches',
    mode: 'video',
    duration: 12,
    seed: 42,
  });
  const validateRequest = validator('media-request.schema.json');
  const validateJob = validator('media-job.schema.json');
  const validatePlan = validator('media-plan.schema.json');

  assert.equal(validateRequest(plan.request), true, JSON.stringify(validateRequest.errors));
  for (const layer of plan.layers) {
    for (const job of layer.jobs) assert.equal(validateJob(job), true, JSON.stringify(validateJob.errors));
  }
  assert.equal(validatePlan(plan), true, JSON.stringify(validatePlan.errors));
});

test('media schemas reject unversioned records and password authorization', () => {
  const validateRequest = validator('media-request.schema.json');
  const validateRelease = validator('media-release.schema.json');
  const request = createMorphicPlan({ brief: 'test' }).request;
  delete request.contract_version;
  assert.equal(validateRequest(request), false);

  const release = {
    contract_version: CONTRACT_VERSIONS.mediaRelease,
    plan_id: 'morph-example',
    asset_hashes: ['a'.repeat(64)],
    decision: 'released',
    authorization: { method: 'password', verified: true },
    destination: null,
    created_at: '2026-07-21T00:00:00.000Z',
  };
  assert.equal(validateRelease(release), false);
});

test('runner emits schema-valid assets and model receipts', async t => {
  const os = require('os');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'l7-media-contract-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const runner = new MediaRunner({
    store: new LocalContentStore({ root }),
    executionMode: 'mock',
    lifecycle: false,
  });
  const run = await runner.run({ brief: 'contract test', mode: 'image', seed: 9 });
  const validateAsset = validator('media-asset.schema.json');
  const validateReceipt = validator('media-receipt.schema.json');
  const validateScorecard = validator('media-scorecard.schema.json');
  const validateSelection = validator('media-selection.schema.json');

  for (const layer of run.layers) {
    for (const artifact of layer.artifacts) {
      const asset = Object.fromEntries([
        'contract_version', 'asset_uri', 'content_hash', 'bytes', 'media_type',
        'backend', 'receipt_id', 'receipt_uri',
      ].map(key => [key, artifact[key]]));
      assert.equal(validateAsset(asset), true, JSON.stringify(validateAsset.errors));
      assert.equal(validateReceipt(artifact.model_receipt), true, JSON.stringify(validateReceipt.errors));
    }
    for (const scorecard of layer.scorecards) {
      assert.equal(validateScorecard(scorecard), true, JSON.stringify(validateScorecard.errors));
    }
    assert.equal(validateSelection(layer.selection), true, JSON.stringify(validateSelection.errors));
  }
});

test('scorecard, selection, crystallization, and release records validate independently', () => {
  const timestamp = '2026-07-21T00:00:00.000Z';
  const records = {
    'media-scorecard.schema.json': {
      contract_version: CONTRACT_VERSIONS.mediaScorecard,
      candidate_id: 'above.keyframes.c01',
      evaluator: { name: 'horizon-contract', version: '1.0.0' },
      components: { identity_fidelity: 0.9, prompt_fidelity: 0.8 },
      weighted_total: 0.868,
      eligible: true,
      evidence: { asset_hash: 'a'.repeat(64) },
      created_at: timestamp,
    },
    'media-selection.schema.json': {
      contract_version: CONTRACT_VERSIONS.mediaSelection,
      plan_id: 'morph-example',
      layer: 'ABOVE',
      selected_candidate_ids: ['above.keyframes.c01'],
      authority: 'horizon',
      reason: 'highest eligible score',
      overrides_ranking: false,
      created_at: timestamp,
    },
    'media-crystallization.schema.json': {
      contract_version: CONTRACT_VERSIONS.mediaCrystallization,
      plan_id: 'morph-example',
      layer_receipts: [{ depth: 1 }, { depth: 2 }, { depth: 3 }],
      salt_artifacts: ['above.json', 'mirror.json', 'below.json'],
      cycle_locked: true,
      created_at: timestamp,
    },
    'media-release.schema.json': {
      contract_version: CONTRACT_VERSIONS.mediaRelease,
      plan_id: 'morph-example',
      asset_hashes: ['a'.repeat(64)],
      decision: 'released',
      authorization: { method: 'biometric', verified: true, event_id: 'auth-1' },
      destination: 'avli://release/example',
      created_at: timestamp,
    },
  };

  for (const [name, record] of Object.entries(records)) {
    const validate = validator(name);
    assert.equal(validate(record), true, `${name}: ${JSON.stringify(validate.errors)}`);
  }
});

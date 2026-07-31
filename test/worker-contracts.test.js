'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');

const ROOT = path.resolve(__dirname, '..');
const readSchema = (name) => JSON.parse(
  fs.readFileSync(path.join(ROOT, 'schema', 'v1', name), 'utf8'),
);

function validators() {
  const ajv = new Ajv({
    strict: false,
    formats: {
      'date-time': true,
      uri: true,
    },
  });
  ajv.addSchema(readSchema('worker-definitions.schema.json'));
  return {
    capabilities: ajv.compile(readSchema('worker-capabilities.schema.json')),
    request: ajv.compile(readSchema('worker-job-request.schema.json')),
    job: ajv.compile(readSchema('worker-job.schema.json')),
  };
}

test('private worker discovery, request, and job records share one contract', () => {
  const validate = validators();
  const now = '2026-07-27T12:00:00.000Z';
  const hash = 'a'.repeat(64);

  assert.equal(validate.capabilities({
    contract_version: 'l7.worker.capabilities/1.0',
    worker_id: 'avli.mac-01',
    worker_version: '1.0.0',
    generated_at: now,
    capabilities: [{
      id: 'music.generate',
      modality: 'music',
      operations: ['generate', 'cancel'],
      privacy_classes: ['internal', 'restricted'],
      available: true,
      models: ['ACE-Step-1.5'],
      limits: {
        max_concurrency: 1,
        max_input_bytes: 1048576,
        timeout_seconds: 900,
      },
    }],
  }), true, JSON.stringify(validate.capabilities.errors));

  assert.equal(validate.request({
    contract_version: 'l7.worker.job-request/1.0',
    request_id: 'req:01JZTEST',
    tenant_id: 'tenant:avli',
    capability: 'music.generate',
    input: { prompt: 'instrumental study' },
    privacy_class: 'internal',
    deadline: now,
    callback: {
      url: 'https://gateway.internal.example/v1/callbacks/jobs',
      key_id: 'callback:primary',
    },
  }), true, JSON.stringify(validate.request.errors));

  assert.equal(validate.job({
    contract_version: 'l7.worker.job/1.0',
    job_id: 'job:01JZTEST',
    request_id: 'req:01JZTEST',
    tenant_id: 'tenant:avli',
    capability: 'music.generate',
    state: 'succeeded',
    created_at: now,
    updated_at: now,
    progress: 1,
    result: { duration_seconds: 30 },
    artifacts: [{
      sha256: hash,
      bytes: 480000,
      media_type: 'audio/wav',
      producer: 'avli.mac-01',
      model: 'ACE-Step-1.5',
      model_version: null,
      license_id: 'Apache-2.0',
      prompt_hash: hash,
      created_at: now,
    }],
    error: null,
  }), true, JSON.stringify(validate.job.errors));
});

test('worker contract rejects browser identity, insecure callbacks, and hashless artifacts', () => {
  const validate = validators();
  const now = '2026-07-27T12:00:00.000Z';

  const request = {
    contract_version: 'l7.worker.job-request/1.0',
    request_id: 'req:01JZTEST',
    tenant_id: 'tenant:avli',
    capability: 'music.generate',
    input: {},
    privacy_class: 'internal',
    deadline: now,
    callback: { url: 'http://public.example/callback', key_id: 'primary' },
    user_id: 'browser-controlled',
  };
  assert.equal(validate.request(request), false);

  const job = {
    contract_version: 'l7.worker.job/1.0',
    job_id: 'job:01JZTEST',
    request_id: 'req:01JZTEST',
    tenant_id: 'tenant:avli',
    capability: 'music.generate',
    state: 'succeeded',
    created_at: now,
    updated_at: now,
    progress: 1,
    artifacts: [{
      bytes: 1,
      media_type: 'audio/wav',
      producer: 'avli.mac-01',
      model: 'ACE-Step-1.5',
      license_id: 'Apache-2.0',
      prompt_hash: null,
      created_at: now,
    }],
    error: null,
  };
  assert.equal(validate.job(job), false);
});

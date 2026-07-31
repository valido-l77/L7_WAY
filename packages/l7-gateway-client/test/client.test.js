import test from 'node:test';
import assert from 'node:assert/strict';

import { L7ApiError, L7Client } from '../index.js';

function response(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

test('client submits only to the governed L7 route and unwraps jobs', async () => {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    return response(202, { success: true, result: { job: { job_id: 'job:one' } }, error: null, meta: {} });
  };
  const client = new L7Client('https://l7.example/', { fetch });
  const job = await client.submitJob({
    request_id: 'request:one', tenant_id: 'tenant:browser-forged', capability: 'text.echo', input: {}, privacy_class: 'internal', deadline: new Date().toISOString(),
  });
  assert.equal(job.job_id, 'job:one');
  assert.equal(calls[0].url, 'https://l7.example/v1/jobs');
  assert.equal(JSON.parse(calls[0].init.body).contract_version, 'l7.worker.job-request/1.0');
  assert.equal(JSON.parse(calls[0].init.body).tenant_id, undefined);
  assert.equal(calls[0].init.credentials, 'include');
});

test('client encodes job IDs, validates hashes, and surfaces canonical errors', async () => {
  const fetch = async url => {
    assert.match(url, /job%3Atenant%2Fone$/);
    return response(404, { success: false, result: null, error: 'Job not found', meta: { error_code: 'NOT_FOUND' } });
  };
  const client = new L7Client('https://l7.example', { fetch });
  await assert.rejects(client.getJob('job:tenant/one'), error => error instanceof L7ApiError && error.code === 'NOT_FOUND');
  assert.throws(() => client.artifactUrl('../secret'), /invalid/);
  assert.equal(client.artifactUrl('a'.repeat(64)), `https://l7.example/v1/artifacts/${'a'.repeat(64)}`);
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { CONTRACT_VERSIONS } = require('../lib/contracts');
const { JobCoordinator, JobJournal } = require('../lib/job-coordinator');

function request(id, deadlineMs = 60_000) {
  return {
    contract_version: CONTRACT_VERSIONS.workerJobRequest,
    request_id: `request:${id}`,
    tenant_id: 'tenant:test',
    capability: 'tool.echo',
    input: {},
    privacy_class: 'internal',
    deadline: new Date(Date.now() + deadlineMs).toISOString(),
  };
}

function coordinator(t, execute, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'l7-job-coordinator-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return new JobCoordinator({ execute, journalOptions: { root }, ...options });
}

test('cancellation becomes terminal even when execution ignores the abort signal', async t => {
  const jobs = coordinator(t, () => new Promise(() => {}));
  const submitted = jobs.submit(request('non-cooperative-cancel'));
  await new Promise(resolve => setImmediate(resolve));
  const cancelled = jobs.cancel(submitted.job_id);
  assert.equal(cancelled.state, 'cancelled');
  const settled = await jobs.wait(submitted.job_id);
  assert.equal(settled.state, 'cancelled');
  assert.equal(settled.result, null);
  assert.equal(jobs.active.size, 0);
});

test('deadline aborts execution and persists a timeout failure', async t => {
  const jobs = coordinator(t, (_request, context) => new Promise((resolve, reject) => {
    context.signal.addEventListener('abort', () => reject(context.signal.reason), { once: true });
  }));
  const submitted = jobs.submit(request('deadline', 30));
  const settled = await jobs.wait(submitted.job_id);
  assert.equal(settled.state, 'failed');
  assert.equal(settled.error.code, 'L7_TIMEOUT');
});

function sampleJournalJob(id, state, createdAt) {
  return {
    contract_version: CONTRACT_VERSIONS.workerJob,
    job_id: `job:${id}`,
    request_id: `request:${id}`,
    tenant_id: 'tenant:test',
    capability: 'tool.echo',
    state,
    created_at: createdAt,
    updated_at: createdAt,
    progress: state === 'running' ? 0.5 : 1,
    result: null,
    artifacts: [],
    error: null,
    request: request(id),
    request_hash: 'test',
  };
}

test('job journal write surfaces ENOSPC instead of corrupting the record', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'l7-job-enospc-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const journal = new JobJournal({
    root,
    writeFile() {
      const error = new Error('ENOSPC: no space left on device');
      error.code = 'ENOSPC';
      throw error;
    },
  });
  const record = sampleJournalJob('full-disk', 'queued', new Date().toISOString());
  assert.throws(() => journal.write(record), /ENOSPC|no space|L7_STORAGE_FULL/i);
  assert.equal(fs.readdirSync(root).filter(name => name.endsWith('.json')).length, 0);
});

test('job journal prunes terminal jobs older than retention while keeping in-flight jobs', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'l7-job-prune-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const journal = new JobJournal({ root });
  const old = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
  const recent = new Date().toISOString();
  journal.write(sampleJournalJob('old-success', 'succeeded', old));
  journal.write(sampleJournalJob('old-failed', 'failed', old));
  journal.write(sampleJournalJob('in-flight', 'running', old));
  journal.write(sampleJournalJob('queued', 'queued', old));
  journal.write(sampleJournalJob('fresh-success', 'succeeded', recent));
  const kept = journal.prune({ maxAgeMs: 24 * 3600 * 1000, keepInFlight: true });
  assert.equal(kept.inFlight, 2);
  assert.ok(kept.removed >= 1);
  assert.equal(journal.read('job:in-flight').state, 'running');
  assert.equal(journal.read('job:queued').state, 'queued');
  assert.equal(journal.read('job:fresh-success').state, 'succeeded');
  assert.equal(journal.read('job:old-success'), null);
  assert.equal(journal.read('job:old-failed'), null);
});

test('recovery finalizes cancelling jobs instead of resurrecting them', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'l7-job-recovery-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const journal = new JobJournal({ root });
  const record = {
    contract_version: CONTRACT_VERSIONS.workerJob,
    job_id: 'job:recover-cancel',
    request_id: 'request:recover-cancel',
    tenant_id: 'tenant:test',
    capability: 'tool.echo',
    state: 'cancelling',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    progress: 0.5,
    result: null,
    artifacts: [],
    error: null,
    request: request('recover-cancel'),
    request_hash: 'test',
  };
  journal.write(record);
  const jobs = new JobCoordinator({ execute: async () => ({}), journal, autoStart: false });
  assert.equal(jobs.get(record.job_id).state, 'cancelled');
  assert.equal(jobs.queue.length, 0);
});



/**
 * L7 State Manager - Persist and resume flow execution state
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { assertSafeName, resolveContainedFile, atomicWriteFileSync } = require('./safe-path');

const L7_DIR = process.env.L7_DIR || path.join(process.env.HOME, '.l7');
const STATE_DIR = path.join(L7_DIR, 'state');
const AUDIT_LOG = path.join(L7_DIR, 'audit.log');

// Ensure directories exist
if (!fs.existsSync(STATE_DIR)) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
}

/**
 * Generate a unique execution ID
 */
function generateId() {
  return crypto.randomBytes(6).toString('hex');
}

/**
 * Create a new execution state
 */
function create(flowName, inputs = {}) {
  const id = generateId();
  const state = {
    id,
    flow: flowName,
    status: 'pending',
    step: 0,
    inputs,
    results: {},
    started: new Date().toISOString(),
    updated: new Date().toISOString(),
    checkpoints: [],
    errors: []
  };

  save(state);
  return state;
}

/**
 * Save state to disk
 */
function save(state) {
  assertSafeName(state.flow, { label: 'Flow name' });
  assertSafeName(state.id, { label: 'Execution ID' });
  state.updated = new Date().toISOString();
  const filePath = resolveContainedFile(STATE_DIR, `${state.flow}-${state.id}.state`, { label: 'State filename' });
  atomicWriteFileSync(filePath, JSON.stringify(state, null, 2));
  return state;
}

/**
 * Load state from disk
 */
function load(flowName, id) {
  assertSafeName(flowName, { label: 'Flow name' });
  assertSafeName(id, { label: 'Execution ID' });
  const filePath = resolveContainedFile(STATE_DIR, `${flowName}-${id}.state`, { label: 'State filename' });
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/**
 * List all states for a flow (or all flows)
 */
function list(flowName = null) {
  if (!fs.existsSync(STATE_DIR)) return [];

  const files = fs.readdirSync(STATE_DIR, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.state'))
    .map(entry => entry.name);

  return files
    .map(f => {
      const filePath = resolveContainedFile(STATE_DIR, f, { label: 'State filename' });
      const content = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(content);
    })
    .filter(s => !flowName || s.flow === flowName)
    .sort((a, b) => new Date(b.updated) - new Date(a.updated));
}

/**
 * Update state status
 */
function setStatus(state, status) {
  state.status = status;
  if (status === 'completed' || status === 'failed') {
    state.finished = new Date().toISOString();
  }
  return save(state);
}

/**
 * Store a step result
 */
function setResult(state, name, value) {
  state.results[name] = value;
  return save(state);
}

/**
 * Advance to next step
 */
function advance(state) {
  state.step += 1;
  return save(state);
}

/**
 * Record a checkpoint (wait step)
 */
function checkpoint(state, message, stepIndex) {
  state.status = 'waiting';
  state.checkpoints.push({
    step: stepIndex,
    message,
    created: new Date().toISOString(),
    resolved: null,
    decision: null
  });
  return save(state);
}

/**
 * Resolve a checkpoint (approve/reject)
 */
function resolveCheckpoint(state, decision) {
  const pending = state.checkpoints.find(c => !c.resolved);
  if (pending) {
    pending.resolved = new Date().toISOString();
    pending.decision = decision; // 'approve' or 'reject'
  }

  if (decision === 'approve') {
    state.status = 'running';
    state.step += 1; // Advance past the checkpoint
  } else {
    state.status = 'rejected';
  }

  return save(state);
}

/**
 * Record an error
 */
function addError(state, error, stepIndex) {
  state.errors.push({
    step: stepIndex,
    error: error.message || String(error),
    time: new Date().toISOString()
  });
  return save(state);
}

/**
 * Delete a state file
 */
function remove(flowName, id) {
  assertSafeName(flowName, { label: 'Flow name' });
  assertSafeName(id, { label: 'Execution ID' });
  const filePath = resolveContainedFile(STATE_DIR, `${flowName}-${id}.state`, { label: 'State filename' });
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return true;
  }
  return false;
}

/**
 * Append to audit log
 */
function audit(entry) {
  const line = JSON.stringify({
    ...entry,
    when: new Date().toISOString()
  }) + '\n';

  fs.appendFileSync(AUDIT_LOG, line);
}

module.exports = {
  generateId,
  create,
  save,
  load,
  list,
  setStatus,
  setResult,
  advance,
  checkpoint,
  resolveCheckpoint,
  addError,
  remove,
  audit
};

// L7:PROVENANCE
// Creator: Alberto Valido Delgado | System: L7 WAY | License: Proprietary — Framework free, products licensed (Law XXII)
// File: lib/state.js | Body-Hash: SHA-256:86d98f096de037566d6afcab9f2bff12fb8c7c3386fde9a36251602e73793491
// Chain-Hash: SHA-256:5f3c58752fbd083c3b2ed6826e7ccb5618f39b3b2ffde9eaf4037bed36d6d50c | Signed: 2026-03-01T15:09:50.022874+00:00
// This work is the intellectual property of Alberto Valido Delgado.
// Chain: 31 works. Verify: python3 provenance.py verify lib/state.js
// L7:PROVENANCE

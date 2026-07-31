'use strict';

const CONTRACT_VERSIONS = Object.freeze({
  gateway: 'l7.gateway/1.0',
  entity: 'l7.entity/1.0',
  tool: 'l7.tool/1.0',
  flow: 'l7.flow/1.0',
  result: 'l7.result/1.0',
  audit: 'l7.audit/1.0',
  provenance: 'l7.provenance/1.0',
  projection12d: 'l7.projection.12d/1.0',
  workerCapabilities: 'l7.worker.capabilities/1.0',
  workerJobRequest: 'l7.worker.job-request/1.0',
  workerJob: 'l7.worker.job/1.0',
  morphicMedia: 'l7-morphic-media/1.0',
  mediaRequest: 'l7.media.request/1.0',
  mediaPlan: 'l7.media.plan/1.0',
  mediaJob: 'l7.media.job/1.0',
  mediaAsset: 'l7.media.asset/1.0',
  mediaReceipt: 'l7.media.receipt/1.0',
  mediaScorecard: 'l7.media.scorecard/1.0',
  mediaSelection: 'l7.media.selection/1.0',
  mediaCrystallization: 'l7.media.crystallization/1.0',
  mediaRelease: 'l7.media.release/1.0',
  imago: 'l7.imago/0.1',
});

const ENTITY_TYPES = Object.freeze(['tool', 'service', 'workflow', 'ui', 'project']);

const LIFECYCLE_STATES = Object.freeze([
  'summoned',
  'oath',
  'formed',
  'serving',
  'mature',
  'sunset',
  'archived',
]);

const LEGACY_LIFECYCLE_MAP = Object.freeze({
  preview: 'formed',
  active: 'serving',
  deprecated: 'sunset',
  archived: 'archived',
});

const LIFECYCLE_TRANSITIONS = Object.freeze({
  summoned: Object.freeze(['oath']),
  oath: Object.freeze(['formed']),
  formed: Object.freeze(['serving']),
  serving: Object.freeze(['mature', 'sunset']),
  mature: Object.freeze(['sunset']),
  sunset: Object.freeze(['archived']),
  archived: Object.freeze([]),
});

const ERROR_CODES = Object.freeze([
  'VALIDATION_ERROR',
  'AUTHENTICATION_REQUIRED',
  'AUTHORIZATION_DENIED',
  'POLICY_DENIED',
  'NOT_FOUND',
  'CONFLICT',
  'DEPENDENCY_FAILURE',
  'PROVIDER_FAILURE',
  'INTEGRITY_VIOLATION',
  'TIMEOUT',
  'CANCELLED',
  'INTERNAL_ERROR',
]);

const RESERVED_RESULT_KEYS = new Set(['success', 'result', 'error', 'meta', 'ok']);

function normalizeLifecycle(value) {
  if (LIFECYCLE_STATES.includes(value)) return value;
  return LEGACY_LIFECYCLE_MAP[value] || null;
}

function errorMessage(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Error) return value.message;
  if (typeof value === 'object' && typeof value.message === 'string') return value.message;
  return String(value);
}

function inferPayload(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object' || Array.isArray(value)) return value;
  if (Object.prototype.hasOwnProperty.call(value, 'result')) return value.result;
  if (Object.prototype.hasOwnProperty.call(value, 'data')) return value.data;

  const payload = Object.fromEntries(
    Object.entries(value).filter(([key]) => !RESERVED_RESULT_KEYS.has(key)),
  );
  return Object.keys(payload).length > 0 ? payload : null;
}

function readSuccessFlag(source) {
  if (!source) return { success: true, invalid: false };
  for (const key of ['success', 'ok']) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
    if (typeof source[key] === 'boolean') return { success: source[key], invalid: false };
    return { success: false, invalid: true, key };
  }
  return { success: true, invalid: false };
}

/**
 * Convert provider, MCP, or legacy L7 output into the public v1 result envelope.
 * `ok` and non-reserved top-level fields remain temporary compatibility aliases.
 */
function normalizeExecutionResult(value, context = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  const sourceMeta = source?.meta && typeof source.meta === 'object' && !Array.isArray(source.meta)
    ? source.meta
    : {};
  const contextMeta = context.meta && typeof context.meta === 'object' && !Array.isArray(context.meta)
    ? context.meta
    : {};
  const successFlag = readSuccessFlag(source);
  const success = successFlag.success;
  const result = inferPayload(value);
  const error = success
    ? null
    : errorMessage(source?.error) || (successFlag.invalid
      ? `Invalid ${successFlag.key} flag: expected boolean`
      : 'Execution failed');
  const timestamp = context.timestamp || sourceMeta.timestamp || new Date().toISOString();
  const meta = {
    ...sourceMeta,
    ...contextMeta,
    contract_version: CONTRACT_VERSIONS.result,
    timestamp,
  };

  if (context.executionTimeMs !== undefined) meta.execution_time_ms = context.executionTimeMs;
  if (context.entityId !== undefined) meta.entity_id = context.entityId;
  if (context.tool !== undefined) meta.tool = context.tool;
  if (context.errorCode !== undefined) meta.error_code = context.errorCode;
  else if (successFlag.invalid) meta.error_code = 'PROVIDER_FAILURE';

  const envelope = { success, result, error, meta, ok: success };
  if (source) {
    for (const [key, item] of Object.entries(source)) {
      if (!RESERVED_RESULT_KEYS.has(key)) envelope[key] = item;
    }
  }
  return envelope;
}

module.exports = {
  CONTRACT_VERSIONS,
  ENTITY_TYPES,
  LIFECYCLE_STATES,
  LEGACY_LIFECYCLE_MAP,
  LIFECYCLE_TRANSITIONS,
  ERROR_CODES,
  normalizeLifecycle,
  normalizeExecutionResult,
};
// L7:PROVENANCE
// Creator: Alberto Valido Delgado | System: L7 WAY | License: Proprietary — Framework free, products licensed (Law XXII)
// File: lib/contracts.js | Body-Hash: SHA-256:8d9259192554c8b1a6d54d91cb89b2e62d77a6a39b2cab98b31cd6fdb02cf591
// Chain-Hash: SHA-256:a027438ee9dc5c6ae95fdd8526a76909bd9c2305a8848732905d52ad519b4f2b | Signed: 2026-07-28T15:51:22.693564+00:00
// This work is the intellectual property of Alberto Valido Delgado.
// Chain: 68 works. Verify: python3 provenance.py verify lib/contracts.js
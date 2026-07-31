'use strict';

const { validatePlan } = require('./media-runner');

const LOCAL_EXECUTION_MODES = new Set(['mock', 'field', 'ssd1b']);
const MAX_AUTOMATIC_CANDIDATES_PER_LAYER = 3;

function classifyMediaRisk(plan, executionMode) {
  try {
    validatePlan(plan);
  } catch (error) {
    return {
      risk: 'unknown',
      automatic_cycle_approval: false,
      rule: 'media-risk-v1',
      reason: `invalid canonical plan: ${error.message}`,
    };
  }

  const jobs = plan.layers.flatMap(layer => layer.jobs || []);
  const local = LOCAL_EXECUTION_MODES.has(executionMode);
  const imageOnly = plan.request.mode === 'image'
    && jobs.length > 0
    && jobs.every(job => job.capability === 'image.generate');
  const bounded = Number.isInteger(plan.request.candidates)
    && plan.request.candidates <= MAX_AUTOMATIC_CANDIDATES_PER_LAYER;
  const automatic = local && imageOnly && bounded;

  return {
    risk: automatic ? 'low' : 'elevated',
    automatic_cycle_approval: automatic,
    rule: 'media-risk-v1',
    reason: automatic
      ? 'bounded local image generation with no release or external provider action'
      : 'motion, external execution, unbounded work, or a non-canonical plan requires explicit approval',
  };
}

module.exports = {
  LOCAL_EXECUTION_MODES,
  MAX_AUTOMATIC_CANDIDATES_PER_LAYER,
  classifyMediaRisk,
};
// L7:PROVENANCE
// Creator: Alberto Valido Delgado | System: L7 WAY | License: Proprietary — Framework free, products licensed (Law XXII)
// File: lib/media-risk-policy.js | Body-Hash: SHA-256:43a19502531b8bd5d032cdb1a30cbee315570dc746a0e13fea89e55bdd65b9aa
// Chain-Hash: SHA-256:dab4ca41b28e9b1c13a3bfaaaa623348c407befa4c3c8b75ebbd143e7c21ea00 | Signed: 2026-07-31T14:25:10.395721+00:00
// This work is the intellectual property of Alberto Valido Delgado.
// Chain: 67 works. Verify: python3 provenance.py verify lib/media-risk-policy.js
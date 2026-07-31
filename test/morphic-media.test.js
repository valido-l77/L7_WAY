'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createMorphicPlan, deriveComplexCoordinate, normalizeRequest, videoAnchors } = require('../lib/morphic-media');

const request = {
  brief: 'a luminous city above the ocean',
  mode: 'video',
  ratio: '16:9',
  duration: 12,
  seed: 777,
  astrocyte: 0.42,
};

test('creates exactly three ordered dream layers and a salt contract', () => {
  const plan = createMorphicPlan(request);
  assert.deepEqual(plan.layers.map(layer => layer.name), ['ABOVE', 'MIRROR', 'BELOW']);
  assert.equal(plan.crystallization.automatic_after_completed_layers, 3);
  assert.equal(plan.crystallization.target_domain, '.salt');
  assert.equal(plan.crystallization.locks_cycle, true);
  assert.equal(Object.values(plan.horizon.score).reduce((sum, value) => sum + value, 0), 1);
  assert.deepEqual(plan.release.requires, ['selected_asset', 'human_approval']);
});

test('planning is deterministic and content addressed', () => {
  const first = createMorphicPlan(request);
  const second = createMorphicPlan({ ...request });
  assert.equal(first.id, second.id);
  assert.equal(first.provenance.plan_hash, second.provenance.plan_hash);
});

test('mirror seed crosses the 42/21 complement boundary', () => {
  const plan = createMorphicPlan(request);
  assert.equal(plan.layers[1].complement.mirror_seed, (777 ^ 63) >>> 0);
  assert.equal(plan.layers[1].complement.boundary, 63);
});

test('video plan grounds a canonical image before motion and finishing', () => {
  const plan = createMorphicPlan(request);
  const below = plan.layers[2].jobs;
  assert.deepEqual(below.map(job => job.id), [
    'below.canonical.c01', 'below.canonical.c02', 'below.canonical.c03',
    'below.motion', 'below.finish',
  ]);
  assert.deepEqual(below[3].dependencies, [
    'below.canonical.c01', 'below.canonical.c02', 'below.canonical.c03',
  ]);
  assert.deepEqual(below[4].tool_chain, ['flux_tempo', 'flux_render', 'flux_splice']);
  assert.equal(below[3].input.anchors.length, 4);
});

test('image mode does not create video jobs or temporal score weight', () => {
  const plan = createMorphicPlan({ ...request, mode: 'image', candidates: 2 });
  assert.deepEqual(plan.layers[2].jobs.map(job => job.id), [
    'below.canonical.c01', 'below.canonical.c02',
  ]);
  assert.equal(plan.horizon.score.temporal_coherence, 0);
  assert.equal(Object.values(plan.horizon.score).reduce((sum, value) => sum + value, 0), 1);
});

test('candidate requests materialize into bounded addressable jobs', () => {
  const plan = createMorphicPlan({ ...request, mode: 'image', candidates: 8, seed: 7 });
  const imageJobs = plan.layers.flatMap(layer => layer.jobs)
    .filter(job => job.capability === 'image.generate');
  assert.equal(imageJobs.length, 24);
  assert.equal(new Set(imageJobs.map(job => job.id)).size, 24);
  assert.ok(imageJobs.every(job => job.input.candidates === 1));
  assert.equal(plan.layers[0].jobs[0].input.seed, 7);
  assert.equal(plan.layers[0].jobs[1].input.seed, 49);
  assert.ok(imageJobs.length <= plan.horizon.candidate_limit);
});

test('complex coordinate has ten manifested and ten becoming components', () => {
  const normalized = normalizeRequest(request);
  const coordinate = deriveComplexCoordinate(normalized);
  assert.equal(coordinate.real.length, 10);
  assert.equal(coordinate.imaginary.length, 10);
  assert.ok(coordinate.gamma > 1);
  assert.equal(Number((coordinate.nodal_axis.caput + coordinate.nodal_axis.cauda).toFixed(4)), 10);
});

test('spiral anchors keep causal time while adding a phase residual', () => {
  const anchors = videoAnchors(12);
  assert.deepEqual(anchors.map(anchor => anchor.second), [0, 4, 8, 12]);
  assert.notEqual(anchors[1].phase, anchors[1].spiral_phase);
});

test('rejects missing briefs and unsupported modes', () => {
  assert.throws(() => createMorphicPlan({ mode: 'image' }), /brief is required/);
  assert.throws(() => createMorphicPlan({ brief: 'x', mode: 'music' }), /image or video/);
});

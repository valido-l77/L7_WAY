'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createMorphicPlan } = require('../lib/morphic-media');
const { classifyMediaRisk } = require('../lib/media-risk-policy');

test('bounded local image generation is classified as low risk', () => {
  const plan = createMorphicPlan({ brief: 'safe local preview', mode: 'image', candidates: 3 });
  const decision = classifyMediaRisk(plan, 'ssd1b');
  assert.equal(decision.risk, 'low');
  assert.equal(decision.automatic_cycle_approval, true);
});

test('motion, external execution, and larger batches retain explicit approval', () => {
  const video = createMorphicPlan({ brief: 'motion preview', mode: 'video', candidates: 1 });
  const cloudImage = createMorphicPlan({ brief: 'cloud preview', mode: 'image', candidates: 1 });
  const largeImage = createMorphicPlan({ brief: 'large preview', mode: 'image', candidates: 4 });
  assert.equal(classifyMediaRisk(video, 'ssd1b').automatic_cycle_approval, false);
  assert.equal(classifyMediaRisk(cloudImage, 'cloud').automatic_cycle_approval, false);
  assert.equal(classifyMediaRisk(largeImage, 'ssd1b').automatic_cycle_approval, false);
});

test('non-canonical plans fail closed before automatic approval', () => {
  const plan = createMorphicPlan({ brief: 'tampered preview', mode: 'image', candidates: 1 });
  plan.layers[0].jobs[0].capability = 'video.generate';
  const decision = classifyMediaRisk(plan, 'ssd1b');
  assert.equal(decision.risk, 'unknown');
  assert.equal(decision.automatic_cycle_approval, false);
});

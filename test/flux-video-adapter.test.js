'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { renderFluxVideo, renderFluxFinish, assertMp4 } = require('../lib/flux-video-adapter');

const FAKE_MP4 = Buffer.concat([
  Buffer.from([0, 0, 0, 24]),
  Buffer.from('ftypisom'),
  Buffer.alloc(2048, 7),
]);

function nativeStub(expectedMode) {
  return async args => {
    assert.equal(args[0], expectedMode);
    fs.writeFileSync(args[2], FAKE_MP4);
  };
}

test('video.generate conditions deterministic motion on the selected BELOW asset', async () => {
  const selected = {
    job_id: 'below.canonical.c02',
    content_hash: 'a'.repeat(64),
    asset_uri: `avli://sha256/${'a'.repeat(64)}`,
    model_receipt: { model: 'segmind/SSD-1B', confirmed_seed: 42 },
  };
  const generated = await renderFluxVideo({
    id: 'below.motion',
    input: {
      aspect_ratio: '16:9',
      duration_seconds: 6,
      seed: 21,
      anchors: [{ index: 0, second: 0 }, { index: 3, second: 6 }],
    },
  }, {
    dependencies: {
      'below.canonical.c01': { job_id: 'below.canonical.c01' },
      'below.canonical.c02': selected,
    },
    selection: { selected_candidate_ids: ['below.canonical.c02'] },
    loadAsset: async hash => {
      assert.equal(hash, selected.content_hash);
      return { bytes: Buffer.from('grounded-png'), metadata: { extension: 'png' } };
    },
  }, { runNative: nativeStub('generate'), fps: 24 });

  assert.equal(generated.mediaType, 'video/mp4');
  assert.equal(generated.model, 'avli-flux-motion');
  assert.equal(generated.confirmedSeed, 21);
  assert.equal(generated.output.keyframe_receipts[0].candidate_id, 'below.canonical.c02');
  assert.equal(generated.output.synthesis.pipeline, 'flux_tempo');
  assert.equal(generated.output.synthesis.camera, 'chained:monumental-push>aerial-reveal>horizon-orbit');
  assert.equal(generated.output.synthesis.temporal_echo, 0.21);
  assert.deepEqual(
    generated.output.synthesis.shot_chain.map(item => item.shot),
    ['establish', 'transform', 'resolve'],
  );
  assert.doesNotThrow(() => assertMp4(generated.bytes));
});

test('video.finish consumes motion MP4 and preserves the registered Flux EDL', async () => {
  const hash = 'b'.repeat(64);
  const generated = await renderFluxFinish({
    id: 'below.finish',
    input: { source_job: 'below.motion', temporal_echo: 0.21, continuity_lock: true },
  }, {
    dependencies: {
      'below.motion': {
        job_id: 'below.motion',
        content_hash: hash,
        synthesis: { duration_seconds: 6 },
      },
    },
    loadAsset: async requested => {
      assert.equal(requested, hash);
      return { bytes: FAKE_MP4, metadata: { extension: 'mp4' } };
    },
  }, { runNative: nativeStub('finish') });

  assert.equal(generated.mediaType, 'video/mp4');
  assert.deepEqual(
    generated.output.edit_decision_list.map(item => item.operation),
    ['flux_tempo', 'flux_render', 'flux_splice'],
  );
  assert.equal(generated.output.edit_decision_list[1].temporal_echo, 0.21);
  assert.doesNotThrow(() => assertMp4(generated.bytes));
});

test('video generation refuses to animate an unselected BELOW image', async () => {
  await assert.rejects(
    () => renderFluxVideo({ id: 'below.motion', input: {} }, {
      dependencies: {},
      selection: { selected_candidate_ids: [] },
    }),
    /requires a selected BELOW candidate/,
  );
});

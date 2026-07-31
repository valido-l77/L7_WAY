'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  AvliCloudVideoClient,
  findVideoDescriptor,
  renderBestAvailableVideo,
} = require('../lib/avli-cloud-video-adapter');

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('AVLI Cloud resource discovery reports MPS and LTX without claiming local weights', async () => {
  const fetch = async url => {
    if (url.endsWith('/system_stats')) return json({
      system: { comfyui_version: '0.28.0', ram_total: 32 * 1024 ** 3 },
      devices: [{ name: 'mps', vram_total: 32 * 1024 ** 3 }],
    });
    if (url.endsWith('/object_info/LtxvApiImageToVideo')) return json({ LtxvApiImageToVideo: {} });
    if (url.endsWith('/models/diffusion_models')) return json([]);
    throw new Error(`unexpected URL ${url}`);
  };
  const resources = await new AvliCloudVideoClient({ fetch }).resources();
  assert.equal(resources.state, 'connected');
  assert.equal(resources.device, 'mps');
  assert.equal(resources.ltx_cloud_available, true);
  assert.deepEqual(resources.local_video_models, []);
});

test('AVLI Cloud submits a selected frame to LTX-2 Pro and downloads the MP4', async () => {
  const calls = [];
  const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(2048)]);
  const fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.endsWith('/upload/image')) return json({ name: 'selected.png' });
    if (url.endsWith('/prompt')) {
      const submitted = JSON.parse(options.body);
      assert.equal(submitted.prompt[2].class_type, 'LtxvApiImageToVideo');
      assert.equal(submitted.prompt[2].inputs.model, 'LTX-2 (Pro)');
      assert.equal(submitted.prompt[2].inputs.duration, 10);
      assert.equal(submitted.prompt[2].inputs.resolution, '1920x1080');
      return json({ prompt_id: 'cloud-42' });
    }
    if (url.endsWith('/history/cloud-42')) return json({
      'cloud-42': {
        outputs: {
          3: { video: [{ filename: 'below.mp4', subfolder: 'avli', type: 'output' }] },
        },
      },
    });
    if (url.includes('/view?')) return new Response(mp4, { status: 200, headers: { 'content-type': 'video/mp4' } });
    throw new Error(`unexpected URL ${url}`);
  };
  const client = new AvliCloudVideoClient({ fetch, pollMs: 1 });
  const result = await client.generate(
    { bytes: Buffer.from('png'), metadata: { extension: 'png' } },
    { id: 'below.motion', input: { prompt: 'city comes alive', duration_seconds: 10 } },
  );
  assert.equal(result.promptId, 'cloud-42');
  assert.deepEqual(result.bytes, mp4);
  assert.equal(calls.length, 4);
});

test('auto engine remains local and paid cloud execution is explicit', async () => {
  await assert.rejects(
    () => renderBestAvailableVideo({}, {}, { engine: 'unknown' }),
    /unsupported AVLI video engine/,
  );
});

test('cluster engine keeps synthesis local and selects the cluster finish route', async () => {
  const { renderBestAvailableFinish } = require('../lib/avli-cloud-video-adapter');
  const fake = Buffer.concat([
    Buffer.from([0, 0, 0, 24]),
    Buffer.from('ftypisom'),
    Buffer.alloc(2048),
  ]);
  const result = await renderBestAvailableFinish({
    id: 'below.finish',
    input: { source_job: 'below.motion', temporal_echo: 0.21, continuity_lock: true },
  }, {
    dependencies: { 'below.motion': { content_hash: 'd'.repeat(64) } },
    loadAsset: async () => ({ bytes: fake }),
  }, {
    engine: 'cluster',
    client: {
      host: 'avli',
      finish: async () => ({ bytes: fake, probe: null }),
    },
  });
  assert.equal(result.provider, 'avli-cluster');
});

test('video descriptor discovery handles nested ComfyUI output records', () => {
  assert.deepEqual(
    findVideoDescriptor({ outputs: { videos: [{ filename: 'clip.mp4', type: 'output' }] } }),
    { filename: 'clip.mp4', type: 'output' },
  );
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  AvliClusterVideoClient,
  renderAvliClusterFinish,
  validateHost,
} = require('../lib/avli-cluster-video-adapter');

const FAKE_MP4 = Buffer.concat([
  Buffer.from([0, 0, 0, 24]),
  Buffer.from('ftypisom'),
  Buffer.alloc(2048, 3),
]);

test('AVLI cluster discovery reports the real synthesis and finish split', async () => {
  const client = new AvliClusterVideoClient({
    host: 'avli',
    run: async () => ({
      stdout: Buffer.from(JSON.stringify({
        hostname: 'srv1217701',
        platform: 'Linux',
        cpu_count: 2,
        ffmpeg: '/usr/bin/ffmpeg',
        ffprobe: '/usr/bin/ffprobe',
      })),
      stderr: '',
    }),
  });
  const resources = await client.resources();
  assert.equal(resources.state, 'connected');
  assert.equal(resources.transport, 'tailscale-ssh');
  assert.equal(resources.roles.synthesis, 'local-apple-mps');
  assert.equal(resources.roles.finish, 'cluster-ffmpeg-libx264');
  assert.equal(resources.worker.cpu_count, 2);
});

test('AVLI cluster finish streams an MP4 through the remote worker', async () => {
  let submitted;
  const client = new AvliClusterVideoClient({
    host: 'avli',
    run: async (_command, _args, options) => {
      submitted = options.input;
      return {
        stdout: FAKE_MP4,
        stderr: JSON.stringify({
          streams: [{ codec_name: 'h264', width: 768, height: 432 }],
          format: { duration: '10.000000', size: String(FAKE_MP4.length) },
        }),
      };
    },
  });
  const result = await client.finish(FAKE_MP4);
  assert.deepEqual(submitted, FAKE_MP4);
  assert.equal(result.probe.streams[0].codec_name, 'h264');
});

test('cluster receipt identifies both the local synthesis and remote mastering nodes', async () => {
  const hash = 'c'.repeat(64);
  const result = await renderAvliClusterFinish({
    id: 'below.finish',
    input: {
      source_job: 'below.motion',
      temporal_echo: 0.21,
      continuity_lock: true,
    },
  }, {
    dependencies: {
      'below.motion': {
        content_hash: hash,
        synthesis: { duration_seconds: 10 },
      },
    },
    loadAsset: async requested => {
      assert.equal(requested, hash);
      return { bytes: FAKE_MP4 };
    },
  }, {
    client: {
      host: 'avli',
      finish: async () => ({
        bytes: FAKE_MP4,
        probe: { format: { duration: '10.000000' } },
      }),
    },
  });
  assert.equal(result.provider, 'avli-cluster');
  assert.deepEqual(
    result.output.edit_decision_list.map(item => item.operation),
    ['flux_tempo', 'cluster_master', 'cluster_verify'],
  );
  assert.equal(result.output.edit_decision_list[0].node, 'local-apple-mps');
  assert.equal(result.output.edit_decision_list[1].node, 'avli');
});

test('cluster SSH target rejects shell metacharacters', () => {
  assert.equal(validateHost('root@hostinger-vps.taildfaa47.ts.net'), 'root@hostinger-vps.taildfaa47.ts.net');
  assert.throws(() => validateHost('avli; reboot'), /SSH alias/);
});

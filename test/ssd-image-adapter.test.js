'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  DEFAULT_MODEL,
  dimensionsForRatio,
  renderSsdImage,
  ssd1bReadiness,
} = require('../lib/ssd-image-adapter');

const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  Buffer.alloc(12_000),
]);

test('SSD-1B adapter maps Studio ratios to bounded raster sizes', () => {
  assert.deepEqual(dimensionsForRatio('16:9'), { width: 768, height: 432 });
  assert.deepEqual(dimensionsForRatio('1:1'), { width: 768, height: 768 });
  assert.deepEqual(dimensionsForRatio('9:16'), { width: 432, height: 768 });
  assert.deepEqual(dimensionsForRatio('4:5'), { width: 608, height: 760 });
  assert.throws(() => dimensionsForRatio('2:1'), /does not support/);
});

test('SSD-1B readiness reports missing resources without starting a worker', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ssd1b-readiness-missing-'));
  const readiness = ssd1bReadiness({
    python: path.join(root, 'runtime', 'python3'),
    hfHome: path.join(root, 'cache'),
    platform: 'darwin',
    arch: 'arm64',
    precision: 'float16',
  });

  assert.equal(readiness.ready, false);
  assert.equal(readiness.probe_only, true);
  assert.equal(readiness.generation_started, false);
  assert.deepEqual(readiness.missing, ['runtime', 'model_cache']);
  assert.deepEqual(readiness.device, { type: 'mps', precision: 'float16' });
  assert.deepEqual(readiness.supported_ratios.map(item => item.ratio), ['16:9', '1:1', '9:16', '4:5']);
});

test('SSD-1B readiness recognizes an executable runtime and complete caches', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ssd1b-readiness-ready-'));
  const python = path.join(root, 'runtime', 'python3');
  const hfHome = path.join(root, 'cache');
  const modelSnapshot = path.join(hfHome, 'hub', 'models--segmind--SSD-1B', 'snapshots', 'model-revision');
  const vaeSnapshot = path.join(hfHome, 'hub', 'models--madebyollin--sdxl-vae-fp16-fix', 'snapshots', 'vae-revision');
  fs.mkdirSync(path.dirname(python), { recursive: true });
  fs.writeFileSync(python, '#!/bin/sh\n');
  fs.chmodSync(python, 0o755);
  fs.mkdirSync(modelSnapshot, { recursive: true });
  fs.mkdirSync(vaeSnapshot, { recursive: true });
  const modelBlob = path.join(root, 'model-index-blob.json');
  fs.writeFileSync(modelBlob, '{}');
  fs.symlinkSync(modelBlob, path.join(modelSnapshot, 'model_index.json'));
  fs.writeFileSync(path.join(vaeSnapshot, 'config.json'), '{}');

  const readiness = ssd1bReadiness({ python, hfHome });
  assert.equal(readiness.ready, true);
  assert.deepEqual(readiness.missing, []);
  assert.equal(readiness.runtime.ready, true);
  assert.equal(readiness.model_cache.model.ready, true);
  assert.equal(readiness.model_cache.vae.ready, true);
});

test('SSD-1B adapter normalizes worker output into a media artifact', async () => {
  let payload;
  const worker = {
    async generate(input) {
      payload = input;
      return {
        image_base64: png.toString('base64'),
        seed: input.seed,
        width: input.width,
        height: input.height,
        steps: input.steps,
        guidance_scale: input.guidance_scale,
        device: 'mps',
        precision: 'float32',
        model_revision: 'fp16',
      };
    },
  };
  const output = await renderSsdImage({
    input: {
      prompt: 'midnight ocean',
      negative_prompt: 'text',
      aspect_ratio: '16:9',
      seed: 42,
    },
  }, { signal: null }, { worker });
  assert.equal(output.model, DEFAULT_MODEL);
  assert.equal(output.provider, 'segmind-local');
  assert.equal(output.confirmedSeed, 42);
  assert.equal(output.mediaType, 'image/png');
  assert.equal(payload.width, 768);
  assert.match(payload.prompt, /high quality/);
  assert.equal(output.output.synthesis.precision, 'float32');
});

test('SSD-1B adapter rejects a degenerate decoder frame', async () => {
  const worker = {
    async generate() {
      return {
        image_base64: Buffer.concat([
          Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
          Buffer.alloc(100),
        ]).toString('base64'),
      };
    },
  };
  await assert.rejects(
    () => renderSsdImage({
      input: { prompt: 'test', aspect_ratio: '1:1', seed: 1 },
    }, {}, { worker }),
    /degenerate image/,
  );
});

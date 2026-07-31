'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { PNG_SIGNATURE, compileBrief, renderPixels, encodePng, dimensionsForRatio } = require('../lib/morphic-field-renderer');

test('brief compiles into symbolic operators without a model', () => {
  const program = compileBrief('a luminous copper city above the ocean at night');
  assert.deepEqual(program.operators, {
    city: true, ocean: true, suspended: true, luminous: true,
    ritual: false, copper: true, night: true,
  });
});

test('midnight activates the nocturnal scene operator', () => {
  assert.equal(compileBrief('a city suspended above the midnight ocean').operators.night, true);
});

test('renderer creates deterministic raster pixels and a valid PNG signature', () => {
  const input = { width: 160, height: 90, layer: 'ABOVE', brief: 'luminous copper city above ocean', identity: 'one city' };
  const first = renderPixels(input);
  const second = renderPixels(input);
  assert.equal(first.pixels.length, 160 * 90 * 4);
  assert.deepEqual(first.pixels, second.pixels);
  const png = encodePng(first.width, first.height, first.pixels);
  assert.deepEqual(png.subarray(0, 8), PNG_SIGNATURE);
  assert.ok(png.length > 1000);
});

test('three morph layers produce different pixel fields', () => {
  const base = { width: 96, height: 54, brief: 'ritual city above ocean', identity: 'copper city' };
  const hashes = ['ABOVE', 'MIRROR', 'BELOW'].map(layer =>
    require('crypto').createHash('sha256').update(renderPixels({ ...base, layer }).pixels).digest('hex')
  );
  assert.equal(new Set(hashes).size, 3);
});

test('seed and planned prompt variation affect rendered pixels', () => {
  const base = { width: 96, height: 54, layer: 'ABOVE', brief: 'copper city', identity: 'one city' };
  const first = renderPixels({ ...base, variation: JSON.stringify({ seed: 1 }) });
  const second = renderPixels({ ...base, variation: JSON.stringify({ seed: 2 }) });
  assert.notDeepEqual(first.pixels, second.pixels);
});

test('renderer rejects invalid or excessive dimensions and ratios', () => {
  assert.throws(() => dimensionsForRatio('1:100000'), /supported 4:1 limit/);
  assert.throws(
    () => renderPixels({ width: 960, height: 96000000, brief: 'test' }),
    /8.3 megapixel limit/,
  );
});

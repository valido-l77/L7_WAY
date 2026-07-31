'use strict';

/**
 * Morphic Field Synthesis (MFS)
 * Original, deterministic raster generation with no trained model or weights.
 * A brief compiles into symbolic operators, complex waves, and SDF geometry.
 */

const zlib = require('zlib');
const crypto = require('crypto');

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function smoothstep(a, b, value) {
  const t = clamp((value - a) / (b - a));
  return t * t * (3 - 2 * t);
}

function hash32(text) {
  return crypto.createHash('sha256').update(String(text)).digest().readUInt32BE(0);
}

function randomFactory(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function compileBrief(brief, identity = '', variation = '') {
  const source = `${brief} ${identity}`.toLowerCase();
  const tokens = source.match(/[a-z0-9]+/g) || [];
  const has = (...words) => words.some(word => tokens.includes(word));
  return {
    source,
    tokens,
    seed: hash32(`${source}|${variation}`),
    operators: {
      city: has('city', 'architecture', 'urban', 'tower'),
      ocean: has('ocean', 'sea', 'water', 'coast'),
      suspended: has('above', 'suspended', 'floating', 'sky'),
      luminous: has('luminous', 'light', 'glowing', 'radiant'),
      ritual: has('ritual', 'sacred', 'temple', 'ceremonial'),
      copper: has('copper', 'bronze', 'metallic'),
      night: has('night', 'midnight', 'dark', 'nocturnal'),
    },
  };
}

function palette(program, layer) {
  const copper = program.operators.copper;
  const base = copper ? [196, 102, 55] : [79, 185, 210];
  if (layer === 'MIRROR') return { sky: [28, 17, 50], low: [74, 27, 77], matter: [207 - base[0] / 3, 220 - base[1] / 3, 235 - base[2] / 3], light: [235, 225, 255] };
  if (layer === 'BELOW') return { sky: [6, 15, 34], low: [29, 31, 53], matter: base, light: [255, 202, 118] };
  return { sky: [7, 18, 43], low: [35, 19, 54], matter: base, light: [255, 218, 137] };
}

function mixColor(a, b, amount) {
  return a.map((value, i) => value * (1 - amount) + b[i] * amount);
}

function addLight(color, light, amount) {
  return color.map((value, i) => clamp(value + light[i] * amount, 0, 255));
}

function complexField(x, y, program, layerIndex) {
  let re = 0;
  let im = 0;
  const tokens = program.tokens.length ? program.tokens.slice(0, 12) : ['void'];
  for (let i = 0; i < tokens.length; i++) {
    const code = hash32(`${tokens[i]}:${i}`);
    const kx = 1.2 + (code & 15) * 0.19;
    const ky = 0.8 + ((code >>> 4) & 15) * 0.17;
    const phase = ((code >>> 8) & 255) / 255 * Math.PI * 2;
    const mirror = layerIndex === 1 ? -1 : 1;
    const theta = kx * x * Math.PI + mirror * ky * y * Math.PI + phase;
    const amplitude = 0.25 + ((code >>> 16) & 255) / 1024;
    re += Math.cos(theta) * amplitude;
    im += Math.sin(theta) * amplitude;
  }
  const scale = 1 / tokens.length;
  const magnitude = Math.sqrt(re * re + im * im) * scale;
  const phase = Math.atan2(im, re);
  return { magnitude, phase };
}

function buildCity(program, layer, width) {
  const random = randomFactory(program.seed ^ hash32(layer));
  const count = 18 + Math.floor(random() * 10);
  const buildings = [];
  let cursor = -0.48;
  for (let i = 0; i < count; i++) {
    const w = 0.018 + random() * 0.038;
    const centerBias = 1 - Math.abs(cursor) * 1.35;
    const height = 0.06 + random() * 0.16 + Math.max(0, centerBias) * 0.14;
    buildings.push({ x: cursor, w, height, crown: random(), windows: 2 + Math.floor(random() * 4), phase: random() * 9 });
    cursor += w * (1.4 + random() * 0.8);
    if (cursor > 0.48) break;
  }
  return buildings;
}

function citySample(x, y, city, baseY, layer, program) {
  let body = 0;
  let window = 0;
  let edge = 0;
  for (const building of city) {
    const localX = Math.abs(x - building.x);
    let top = baseY - building.height;
    if (program.operators.ritual && building.crown > 0.62) {
      top -= Math.max(0, 0.028 - localX) * 1.8;
    }
    const insideX = 1 - smoothstep(building.w, building.w + 0.004, localX);
    const insideY = smoothstep(top - 0.003, top + 0.003, y) * (1 - smoothstep(baseY, baseY + 0.004, y));
    const occupancy = insideX * insideY;
    body = Math.max(body, occupancy);
    const borderX = smoothstep(building.w - 0.005, building.w, localX) * occupancy;
    edge = Math.max(edge, borderX);
    if (occupancy > 0.2) {
      const wx = Math.sin((x - building.x) * 900 / building.windows + building.phase);
      const wy = Math.sin((y - top) * 380 + building.phase);
      window = Math.max(window, occupancy * smoothstep(0.72, 0.94, wx * wy));
    }
  }
  return { body, window, edge };
}

function renderPixels(input) {
  const width = Number(input.width || 960);
  const height = Number(input.height || 540);
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
    throw new Error('render dimensions must be positive safe integers');
  }
  if (width * height > 8_294_400) {
    throw new Error('render dimensions exceed the 8.3 megapixel limit');
  }
  const layer = input.layer || 'ABOVE';
  const layerIndex = { ABOVE: 0, MIRROR: 1, BELOW: 2 }[layer] ?? 0;
  const program = compileBrief(input.brief || '', input.identity || '', input.variation || '');
  const colors = palette(program, layer);
  const city = buildCity(program, layer, width);
  const pixels = Buffer.alloc(width * height * 4);
  const horizon = layer === 'MIRROR' ? 0.55 : layer === 'BELOW' ? 0.60 : 0.62;
  const cityBase = layer === 'MIRROR' ? 0.50 : layer === 'BELOW' ? 0.50 : 0.48;
  const moonX = layer === 'MIRROR' ? -0.58 : 0.58;
  const moonY = layer === 'MIRROR' ? 0.30 : 0.20;

  for (let py = 0; py < height; py++) {
    const v = py / (height - 1);
    const y = v * 2 - 1;
    for (let px = 0; px < width; px++) {
      const u = px / (width - 1);
      const x = u * 2 - 1;
      const field = complexField(x, y, program, layerIndex);
      const vertical = smoothstep(0, 1, v);
      let color = mixColor(colors.sky, colors.low, vertical * 0.82);

      // Complex becoming field: visible interference, not random noise.
      const filaments = Math.pow(clamp(1 - Math.abs(Math.sin(field.phase * 3 + field.magnitude * 18))), 14);
      color = addLight(color, colors.light, filaments * field.magnitude * 0.16);

      // A readable nocturnal light source makes "midnight" a scene, not only a palette.
      if (program.operators.ocean && program.operators.night && v < horizon) {
        const moonDistance = Math.sqrt((x - moonX) ** 2 + (v - moonY) ** 2);
        const moon = 1 - smoothstep(0.045, 0.055, moonDistance);
        const halo = Math.exp(-moonDistance * 11) * (1 - moon);
        color = addLight(color, [136, 164, 208], halo * 0.20);
        color = mixColor(color, [236, 230, 205], moon * 0.96);
      }

      // Ocean/horizon operator.
      if (program.operators.ocean && v > horizon) {
        const depth = smoothstep(horizon, 1, v);
        const broadWave = Math.sin(depth * 92 + x * 22 + Math.sin(x * 7) * 2 + field.phase * 0.35);
        const fineWave = Math.sin(depth * 224 - x * 41 + field.phase * 0.25);
        const crest = Math.pow(clamp(broadWave * 0.72 + fineWave * 0.28), 9) * (1 - depth * 0.42);
        const horizonLine = 1 - smoothstep(0.002, 0.012, Math.abs(v - horizon));
        const ocean = mixColor([2, 12, 31], [3, 39, 68], depth);
        color = mixColor(color, ocean, 0.93);
        color = addLight(color, [94, 151, 190], crest * 0.48 + horizonLine * 0.18);

        if (program.operators.night) {
          const reflectionWidth = 0.025 + depth * 0.30;
          const reflection = Math.exp(-(((x - moonX) / reflectionWidth) ** 2))
            * (0.18 + crest * 0.82)
            * (0.35 + depth * 0.65);
          color = addLight(color, [226, 212, 174], reflection * 0.50);
        }
      }

      // Suspended platform and three arches: one base, three openings.
      if (program.operators.city) {
        const sceneX = x * 0.58;
        const sampleY = layer === 'MIRROR' ? 1 - v : v;
        const cityShape = citySample(sceneX, sampleY, city, cityBase, layer, program);
        color = mixColor(color, colors.matter, cityShape.body * 0.78);
        color = addLight(color, colors.light, cityShape.edge * 0.28 + cityShape.window * (program.operators.luminous ? 0.9 : 0.46));

        const platformY = cityBase + 0.012;
        const platform = (1 - smoothstep(0.015, 0.025, Math.abs(sampleY - platformY))) * (1 - smoothstep(0.56, 0.61, Math.abs(sceneX)));
        const taper = smoothstep(platformY, platformY + 0.14, sampleY) * (1 - smoothstep(platformY + 0.14, platformY + 0.17, sampleY));
        let support = 0;
        for (const center of [-0.27, 0, 0.27]) {
          const archRadius = Math.sqrt(((sceneX - center) / 0.115) ** 2 + ((sampleY - platformY - 0.105) / 0.12) ** 2);
          const ring = 1 - smoothstep(0.78, 1.02, archRadius);
          const hollow = 1 - smoothstep(0.55, 0.72, archRadius);
          support = Math.max(support, taper * clamp(ring - hollow));
        }
        const structure = Math.max(platform, support);
        color = mixColor(color, colors.matter, structure * 0.86);
        color = addLight(color, colors.light, structure * filaments * 0.42);
      }

      // SALT-like collapse at BELOW: suppress field noise, strengthen invariants.
      if (layer === 'BELOW') {
        const coherence = 0.08 * (1 - field.magnitude);
        color = color.map(channel => channel * (0.94 + coherence));
      }

      const index = (py * width + px) * 4;
      pixels[index] = Math.round(clamp(color[0], 0, 255));
      pixels[index + 1] = Math.round(clamp(color[1], 0, 255));
      pixels[index + 2] = Math.round(clamp(color[2], 0, 255));
      pixels[index + 3] = 255;
    }
  }
  return { width, height, pixels, program };
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let value = n;
    for (let k = 0; k < 8; k++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[n] = value >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const name = Buffer.from(type);
  const body = Buffer.concat([name, data]);
  const output = Buffer.alloc(12 + data.length);
  output.writeUInt32BE(data.length, 0);
  name.copy(output, 4);
  data.copy(output, 8);
  output.writeUInt32BE(crc32(body), 8 + data.length);
  return output;
}

function encodePng(width, height, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) pixels.copy(rows, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(rows, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function dimensionsForRatio(ratio, maxWidth = 960) {
  const [rw, rh] = String(ratio || '16:9').split(':').map(Number);
  if (!Number.isFinite(rw) || !Number.isFinite(rh) || rw <= 0 || rh <= 0) {
    throw new Error(`invalid aspect ratio: ${ratio}`);
  }
  if (rh / rw > 4 || rw / rh > 4) {
    throw new Error(`aspect ratio exceeds the supported 4:1 limit: ${ratio}`);
  }
  const width = maxWidth;
  return { width, height: Math.max(1, Math.round(width * rh / rw)) };
}

async function renderMorphicFieldImage(job, context) {
  const layer = job.id.startsWith('mirror.') ? 'MIRROR' : job.id.startsWith('below.') ? 'BELOW' : 'ABOVE';
  const dimensions = dimensionsForRatio(job.input.aspect_ratio);
  const dependencyHashes = Object.values(context.dependencies || {})
    .map(dependency => dependency?.content_hash || '')
    .filter(Boolean)
    .sort()
    .join(':');
  const variation = JSON.stringify({
    seed: job.input.seed,
    candidates: job.input.candidates,
    negative_prompt: job.input.negative_prompt || '',
    dependency_hashes: dependencyHashes,
  });
  const rendered = renderPixels({
    ...dimensions,
    layer,
    brief: job.input.prompt,
    identity: context.plan.request.identity,
    variation,
  });
  return {
    bytes: encodePng(rendered.width, rendered.height, rendered.pixels),
    mediaType: 'image/png',
    extension: 'png',
    model: 'morphic-field-synthesis-v1',
    synthesis: { layer, operators: rendered.program.operators, dimensions },
  };
}

module.exports = {
  PNG_SIGNATURE,
  compileBrief,
  renderPixels,
  encodePng,
  dimensionsForRatio,
  renderMorphicFieldImage,
};

// L7:PROVENANCE
// Creator: Alberto Valido Delgado | System: L7 WAY | License: Proprietary — Framework free, products licensed (Law XXII)
// File: lib/morphic-field-renderer.js | Body-Hash: SHA-256:e64981e6fec50147b757ab798d422c2e9d9cf87f18b57d88becc5bda14b69728
// Chain-Hash: SHA-256:e7c78738f6704fda50c21cbaac70bcda1c814bdadbcc83fe35ace2fa6fdef7fc | Signed: 2026-07-20T00:35:47.869637+00:00
// This work is the intellectual property of Alberto Valido Delgado.
// Chain: 45 works. Verify: python3 provenance.py verify lib/morphic-field-renderer.js
// L7:PROVENANCE

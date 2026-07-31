'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { CONTRACT_VERSIONS } = require('./contracts');

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function cleanExtension(value) {
  const ext = String(value || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
  return ext || 'bin';
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function receiptIdentity(objectHash, receipt) {
  if (receipt === undefined || receipt === null) return null;
  return sha256(Buffer.from(stableStringify({ object_hash: objectHash, receipt })));
}

function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const digest = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', chunk => digest.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(digest.digest('hex')));
  });
}

class LocalContentStore {
  constructor(options = {}) {
    const l7Dir = process.env.L7_DIR || path.join(process.env.HOME || '', '.l7');
    this.root = path.resolve(options.root || process.env.AVLI_MEDIA_ROOT || path.join(l7Dir, 'media'));
    this.verified = new Map();
    fs.mkdirSync(path.join(this.root, 'objects'), { recursive: true });
  }

  async put(bytes, options = {}) {
    const body = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
    const hash = sha256(body);
    const extension = cleanExtension(options.extension);
    const directory = path.join(this.root, 'objects', hash.slice(0, 2));
    const objectPath = path.join(directory, `${hash}.${extension}`);
    const metadataPath = path.join(directory, `${hash}.metadata.json`);
    fs.mkdirSync(directory, { recursive: true });

    let created = false;
    try {
      fs.writeFileSync(objectPath, body, { flag: 'wx', mode: 0o444 });
      created = true;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }

    const metadata = {
      sha256: hash,
      bytes: body.length,
      media_type: options.mediaType || 'application/octet-stream',
      extension,
      created_at: new Date().toISOString(),
      receipt: options.receipt || null,
    };
    try {
      fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, { flag: 'wx', mode: 0o444 });
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
    if (created) {
      const stat = fs.statSync(objectPath);
      this.verified.set(hash, { size: stat.size, mtimeMs: stat.mtimeMs, ino: stat.ino });
    }

    const receiptId = receiptIdentity(hash, options.receipt);
    if (receiptId) {
      const receiptDirectory = path.join(this.root, 'receipts', hash.slice(0, 2), hash);
      const receiptPath = path.join(receiptDirectory, `${receiptId}.json`);
      fs.mkdirSync(receiptDirectory, { recursive: true });
      const receiptRecord = {
        receipt_id: receiptId,
        object_hash: hash,
        recorded_at: new Date().toISOString(),
        receipt: options.receipt,
      };
      try {
        fs.writeFileSync(receiptPath, `${JSON.stringify(receiptRecord, null, 2)}\n`, { flag: 'wx', mode: 0o444 });
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
      }
    }

    return {
      contract_version: CONTRACT_VERSIONS.mediaAsset,
      backend: 'local',
      asset_uri: `avli://sha256/${hash}`,
      content_hash: hash,
      bytes: body.length,
      media_type: metadata.media_type,
      object_path: objectPath,
      receipt_id: receiptId,
      receipt_uri: receiptId ? `avli-receipt://sha256/${hash}/${receiptId}` : null,
    };
  }

  get(hash) {
    const normalized = String(hash || '').toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(normalized)) {
      const error = new Error('invalid media asset hash');
      error.code = 'L7_INVALID_ASSET_HASH';
      throw error;
    }
    const directory = path.join(this.root, 'objects', normalized.slice(0, 2));
    const metadataPath = path.join(directory, `${normalized}.metadata.json`);
    let metadata;
    try {
      metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
    if (metadata.sha256 !== normalized) throw new Error(`media metadata hash mismatch: ${normalized}`);
    const extension = cleanExtension(metadata.extension);
    const objectPath = path.join(directory, `${normalized}.${extension}`);
    let bytes;
    try {
      bytes = fs.readFileSync(objectPath);
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
    if (sha256(bytes) !== normalized) throw new Error(`media object hash mismatch: ${normalized}`);
    return { bytes, metadata };
  }

  async open(hash, range = null) {
    const normalized = String(hash || '').toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(normalized)) {
      const error = new Error('invalid media asset hash');
      error.code = 'L7_INVALID_ASSET_HASH';
      throw error;
    }
    const directory = path.join(this.root, 'objects', normalized.slice(0, 2));
    const metadataPath = path.join(directory, `${normalized}.metadata.json`);
    let metadata;
    try {
      metadata = JSON.parse(await fs.promises.readFile(metadataPath, 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
    if (metadata.sha256 !== normalized) throw new Error(`media metadata hash mismatch: ${normalized}`);
    const objectPath = path.join(directory, `${normalized}.${cleanExtension(metadata.extension)}`);
    let stat;
    try {
      stat = await fs.promises.stat(objectPath);
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
    if (!stat.isFile() || stat.size !== metadata.bytes) {
      throw new Error(`media object size mismatch: ${normalized}`);
    }
    const cached = this.verified.get(normalized);
    const unchanged = cached
      && cached.size === stat.size
      && cached.mtimeMs === stat.mtimeMs
      && cached.ino === stat.ino;
    if (!unchanged) {
      if (await hashFile(objectPath) !== normalized) {
        this.verified.delete(normalized);
        throw new Error(`media object hash mismatch: ${normalized}`);
      }
      this.verified.set(normalized, { size: stat.size, mtimeMs: stat.mtimeMs, ino: stat.ino });
    }
    const start = range?.start ?? 0;
    const end = range?.end ?? stat.size - 1;
    return {
      metadata,
      size: stat.size,
      start,
      end,
      stream: fs.createReadStream(objectPath, { start, end }),
    };
  }
}

class VpsContentStore {
  constructor(options = {}) {
    this.baseUrl = String(options.baseUrl || process.env.AVLI_MEDIA_STORAGE_URL || '').replace(/\/$/, '');
    this.token = options.token || process.env.AVLI_MEDIA_STORAGE_TOKEN || '';
    this.fetch = options.fetch || globalThis.fetch;
    this.timeoutMs = Number.isSafeInteger(Number(options.timeoutMs)) && Number(options.timeoutMs) > 0
      ? Math.min(Number(options.timeoutMs), 10 * 60 * 1000)
      : 30000;
    if (!this.baseUrl) throw new Error('AVLI_MEDIA_STORAGE_URL is required for VPS storage');
    if (!this.token) throw new Error('AVLI_MEDIA_STORAGE_TOKEN is required for VPS storage');
    if (typeof this.fetch !== 'function') throw new Error('fetch is required for VPS storage');
    const url = new URL(this.baseUrl);
    const isLocal = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
    if (url.protocol !== 'https:' && !isLocal) throw new Error('VPS storage must use HTTPS');
  }

  async put(bytes, options = {}) {
    const body = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
    const hash = sha256(body);
    const extension = cleanExtension(options.extension);
    const receipt = options.receipt || null;
    const receiptJson = JSON.stringify(receipt || {});
    if (Buffer.byteLength(receiptJson) > 16 * 1024) throw new Error('VPS storage receipt exceeds 16384 bytes');
    const receiptId = receiptIdentity(hash, receipt);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response;
    try {
      response = await this.fetch(`${this.baseUrl}/objects/${hash}`, {
        method: 'PUT',
        headers: {
          authorization: `Bearer ${this.token}`,
          'content-type': options.mediaType || 'application/octet-stream',
          'x-avli-extension': extension,
          'x-avli-sha256': hash,
          'x-avli-receipt': Buffer.from(receiptJson).toString('base64url'),
        },
        body,
        redirect: 'error',
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) {
        const timeoutError = new Error(`VPS storage timed out after ${this.timeoutMs}ms`);
        timeoutError.code = 'L7_TIMEOUT';
        throw timeoutError;
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) throw new Error(`VPS storage rejected object ${hash}: HTTP ${response.status}`);
    let remote = {};
    try { remote = await response.json(); } catch { /* response body is optional */ }
    if (remote.content_hash && remote.content_hash !== hash) {
      throw new Error(`VPS storage returned a mismatched content hash for ${hash}`);
    }
    return {
      contract_version: CONTRACT_VERSIONS.mediaAsset,
      backend: 'vps',
      asset_uri: remote.asset_uri || `${this.baseUrl}/objects/${hash}`,
      content_hash: hash,
      bytes: body.length,
      media_type: options.mediaType || 'application/octet-stream',
      receipt_id: receiptId,
      receipt_uri: remote.receipt_uri || (receiptId ? `avli-receipt://sha256/${hash}/${receiptId}` : null),
    };
  }
}

function createMediaStore(options = {}) {
  // Privacy-first default: a configured URL alone can never activate egress.
  // VPS storage requires the explicit AVLI_MEDIA_STORAGE=vps switch.
  const backend = options.backend || process.env.AVLI_MEDIA_STORAGE || 'local';
  if (backend === 'local') return new LocalContentStore(options);
  if (backend === 'vps') return new VpsContentStore(options);
  throw new Error(`unsupported media storage backend: ${backend}`);
}

module.exports = {
  sha256,
  hashFile,
  stableStringify,
  receiptIdentity,
  LocalContentStore,
  VpsContentStore,
  createMediaStore,
};

// L7:PROVENANCE
// Creator: Alberto Valido Delgado | System: L7 WAY | License: Proprietary — Framework free, products licensed (Law XXII)
// File: lib/media-storage.js | Body-Hash: SHA-256:e466cd6fd1c142f6874ab53765121abea3a478d4c21df2b277e01d4ab938d1dc
// Chain-Hash: SHA-256:977de5918a58d1df6ae97384b101f8d6cc00da1e621b6230f8403225c72e8a1a | Signed: 2026-07-20T00:35:47.519979+00:00
// This work is the intellectual property of Alberto Valido Delgado.
// Chain: 43 works. Verify: python3 provenance.py verify lib/media-storage.js
// L7:PROVENANCE

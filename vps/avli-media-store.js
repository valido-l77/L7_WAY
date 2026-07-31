#!/usr/bin/env node
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function safeTokenEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

function json(res, status, value) {
  const body = Buffer.from(`${JSON.stringify(value)}\n`);
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': body.length });
  res.end(body);
}

function createMediaStoreServer(options = {}) {
  const root = path.resolve(options.root || process.env.AVLI_STORE_ROOT || '/var/lib/avli-media');
  const token = options.token || process.env.AVLI_STORE_TOKEN || '';
  const publicBase = String(options.publicBase || process.env.AVLI_STORE_PUBLIC_URL || '').replace(/\/$/, '');
  const maxBytes = Number(options.maxBytes || process.env.AVLI_STORE_MAX_BYTES || 2 * 1024 ** 3);
  if (!token) throw new Error('AVLI_STORE_TOKEN is required');
  fs.mkdirSync(path.join(root, 'objects'), { recursive: true });
  fs.mkdirSync(path.join(root, 'incoming'), { recursive: true });

  return http.createServer((req, res) => {
    const authorization = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!safeTokenEqual(authorization, token)) {
      json(res, 401, { error: 'unauthorized' });
      return;
    }

    const match = new URL(req.url, 'http://localhost').pathname.match(/^\/objects\/([a-f0-9]{64})$/);
    if (!match) {
      json(res, 404, { error: 'not found' });
      return;
    }
    const claimedHash = match[1];
    const directory = path.join(root, 'objects', claimedHash.slice(0, 2));

    if (req.method === 'PUT') {
      const headerHash = String(req.headers['x-avli-sha256'] || '');
      if (headerHash !== claimedHash) {
        json(res, 400, { error: 'hash header does not match object address' });
        return;
      }
      const length = Number(req.headers['content-length'] || 0);
      if (length > maxBytes) {
        json(res, 413, { error: 'object exceeds size limit' });
        return;
      }
      const extension = String(req.headers['x-avli-extension'] || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
      const temporary = path.join(root, 'incoming', `${crypto.randomUUID()}.upload`);
      const output = fs.createWriteStream(temporary, { flags: 'wx', mode: 0o600 });
      const hash = crypto.createHash('sha256');
      let bytes = 0;
      let settled = false;

      function fail(status, message) {
        if (settled) return;
        settled = true;
        output.destroy();
        try { fs.unlinkSync(temporary); } catch { /* temporary may not exist yet */ }
        json(res, status, { error: message });
      }

      req.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > maxBytes) {
          req.destroy();
          fail(413, 'object exceeds size limit');
          return;
        }
        hash.update(chunk);
      });
      req.on('error', () => fail(400, 'upload interrupted'));
      output.on('error', () => fail(500, 'storage write failed'));
      req.pipe(output);
      output.on('finish', () => {
        if (settled) return;
        const actualHash = hash.digest('hex');
        if (actualHash !== claimedHash) {
          fail(422, 'content hash verification failed');
          return;
        }
        fs.mkdirSync(directory, { recursive: true });
        const objectPath = path.join(directory, `${claimedHash}.${extension}`);
        try {
          fs.linkSync(temporary, objectPath);
          fs.chmodSync(objectPath, 0o444);
        } catch (error) {
          if (error.code !== 'EEXIST') {
            fail(500, 'storage commit failed');
            return;
          }
        }
        try { fs.unlinkSync(temporary); } catch { /* committed or already cleaned */ }

        const metadataPath = path.join(directory, `${claimedHash}.metadata.json`);
        const metadata = {
          sha256: claimedHash,
          bytes,
          extension,
          media_type: req.headers['content-type'] || 'application/octet-stream',
          receipt: req.headers['x-avli-receipt'] || null,
          stored_at: new Date().toISOString(),
        };
        try {
          fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, { flag: 'wx', mode: 0o444 });
        } catch (error) {
          if (error.code !== 'EEXIST') {
            fail(500, 'metadata commit failed');
            return;
          }
        }
        settled = true;
        json(res, 201, {
          asset_uri: publicBase ? `${publicBase}/objects/${claimedHash}` : `avli-vps://sha256/${claimedHash}`,
          content_hash: claimedHash,
          bytes,
          immutable: true,
        });
      });
      return;
    }

    if (req.method === 'GET' || req.method === 'HEAD') {
      let objectName;
      try {
        objectName = fs.readdirSync(directory).find(name => name.startsWith(`${claimedHash}.`) && !name.endsWith('.metadata.json'));
      } catch { /* handled as not found */ }
      if (!objectName) {
        json(res, 404, { error: 'object not found' });
        return;
      }
      const objectPath = path.join(directory, objectName);
      const stat = fs.statSync(objectPath);
      const metadataPath = path.join(directory, `${claimedHash}.metadata.json`);
      let mediaType = 'application/octet-stream';
      try { mediaType = JSON.parse(fs.readFileSync(metadataPath, 'utf8')).media_type || mediaType; } catch { /* optional */ }
      res.writeHead(200, {
        'content-type': mediaType,
        'content-length': stat.size,
        etag: `"sha256-${claimedHash}"`,
        'cache-control': 'private, immutable, max-age=31536000',
      });
      if (req.method === 'HEAD') res.end();
      else fs.createReadStream(objectPath).pipe(res);
      return;
    }

    json(res, 405, { error: 'method not allowed' });
  });
}

if (require.main === module) {
  const host = process.env.AVLI_STORE_BIND || '127.0.0.1';
  const port = Number(process.env.AVLI_STORE_PORT || 18842);
  const server = createMediaStoreServer();
  server.listen(port, host, () => process.stdout.write(`AVLI media store listening on http://${host}:${port}\n`));
}

module.exports = { createMediaStoreServer, safeTokenEqual };


// L7:PROVENANCE
// Creator: Alberto Valido Delgado | System: L7 WAY | License: Proprietary — Framework free, products licensed (Law XXII)
// File: vps/avli-media-store.js | Body-Hash: SHA-256:ae6213b15bf878843433b7417678b32e0f9a9c8036e1bfb3eaf192f04ecaadb2
// Chain-Hash: SHA-256:179af1d086e277acb93a3e00e01aa4bd13649643967032f2334eee6357b2884a | Signed: 2026-07-20T00:35:48.198436+00:00
// This work is the intellectual property of Alberto Valido Delgado.
// Chain: 47 works. Verify: python3 provenance.py verify vps/avli-media-store.js
// L7:PROVENANCE
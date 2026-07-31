'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function unsafePath(message) {
  const error = new Error(message);
  error.code = 'L7_UNSAFE_PATH';
  return error;
}

/**
 * Validate a logical L7 identifier before it is allowed to become a filename.
 * Display names may be richer; persistent identifiers are deliberately flat.
 */
function assertSafeName(value, options = {}) {
  const label = options.label || 'Name';
  const maxLength = options.maxLength || 200;

  if (typeof value !== 'string' || value.length === 0 || value !== value.trim()) {
    throw unsafePath(`${label} must be a non-empty, trimmed string`);
  }
  if (value.length > maxLength) {
    throw unsafePath(`${label} exceeds ${maxLength} characters`);
  }
  if (
    value === '.' ||
    value === '..' ||
    path.isAbsolute(value) ||
    value.includes('/') ||
    value.includes('\\') ||
    /[\0-\x1f\x7f]/.test(value)
  ) {
    throw unsafePath(`${label} must not contain path separators or control characters`);
  }

  return value;
}

/**
 * Resolve one flat filename beneath root and reject existing symbolic links.
 */
function resolveContainedFile(root, filename, options = {}) {
  assertSafeName(filename, { ...options, label: options.label || 'Filename', maxLength: 255 });

  const resolvedRoot = path.resolve(root);
  const target = path.resolve(resolvedRoot, filename);
  if (target === resolvedRoot || !target.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw unsafePath(`${options.label || 'Filename'} escapes its storage boundary`);
  }

  try {
    if (fs.lstatSync(target).isSymbolicLink()) {
      throw unsafePath(`${options.label || 'Filename'} cannot reference a symbolic link`);
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  return target;
}

function resolveNamedFile(root, name, extension, options = {}) {
  assertSafeName(name, options);
  if (typeof extension !== 'string' || !/^\.[A-Za-z0-9._-]+$/.test(extension)) {
    throw new Error(`Invalid filename extension: ${extension}`);
  }
  return resolveContainedFile(root, `${name}${extension}`, {
    ...options,
    label: options.label || 'Name',
  });
}

/**
 * Publish a complete file with one rename so readers never observe a partial
 * JSON document. The temporary file always lives in the destination directory.
 */
function atomicWriteFileSync(target, data, options = {}) {
  const suffix = crypto.randomBytes(6).toString('hex');
  const temporary = `${target}.${process.pid}.${suffix}.tmp`;
  try {
    fs.writeFileSync(temporary, data, { ...options, flag: 'wx' });
    fs.renameSync(temporary, target);
  } catch (error) {
    try { fs.unlinkSync(temporary); } catch (cleanupError) {
      if (cleanupError.code !== 'ENOENT') error.cleanupError = cleanupError;
    }
    throw error;
  }
}

module.exports = {
  assertSafeName,
  resolveContainedFile,
  resolveNamedFile,
  atomicWriteFileSync,
};
// L7:PROVENANCE
// Creator: Alberto Valido Delgado | System: L7 WAY | License: Proprietary — Framework free, products licensed (Law XXII)
// File: lib/safe-path.js | Body-Hash: SHA-256:e0bba491a4ade7a3e5ac14d7f02a5670b41b91e1f93237e4a4cbd80b888badcc
// Chain-Hash: SHA-256:4e11e032fd417daaba27634a275fc35f24041c86ac160654cc8875f3c3cd6cc7 | Signed: 2026-07-28T15:51:22.936600+00:00
// This work is the intellectual property of Alberto Valido Delgado.
// Chain: 75 works. Verify: python3 provenance.py verify lib/safe-path.js
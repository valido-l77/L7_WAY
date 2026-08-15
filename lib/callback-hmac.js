'use strict';

const crypto = require('crypto');

const SIGNATURE_HEADER = 'x-l7-callback-signature';
const KEY_ID_HEADER = 'x-l7-callback-key-id';

function callbackSecret(options = {}) {
  if (options.secret) return String(options.secret);
  return process.env.L7_CALLBACK_HMAC_SECRET || '';
}

function canonicalBody(body) {
  if (Buffer.isBuffer(body)) return body;
  if (typeof body === 'string') return Buffer.from(body, 'utf8');
  return Buffer.from(JSON.stringify(body), 'utf8');
}

function signCallback(body, secret = callbackSecret()) {
  if (!secret) {
    const error = new Error('L7_CALLBACK_HMAC_SECRET is required to sign callbacks');
    error.code = 'L7_VALIDATION_ERROR';
    throw error;
  }
  return crypto.createHmac('sha256', secret).update(canonicalBody(body)).digest('hex');
}

function signaturesEqual(provided, expected) {
  if (typeof provided !== 'string' || typeof expected !== 'string' || !provided || !expected) {
    return false;
  }
  const left = Buffer.from(provided, 'hex');
  const right = Buffer.from(expected, 'hex');
  if (left.length === 0 || left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function verifyCallback(body, signature, secret = callbackSecret()) {
  if (!secret) {
    const error = new Error('L7_CALLBACK_HMAC_SECRET is required to verify callbacks');
    error.code = 'AUTHENTICATION_REQUIRED';
    throw error;
  }
  return signaturesEqual(signature, signCallback(body, secret));
}

function callbackHeaders(body, options = {}) {
  const keyId = options.keyId || process.env.L7_CALLBACK_KEY_ID || 'callback:primary';
  return {
    [SIGNATURE_HEADER]: signCallback(body, options.secret),
    [KEY_ID_HEADER]: keyId,
    'content-type': 'application/json',
  };
}

module.exports = {
  KEY_ID_HEADER,
  SIGNATURE_HEADER,
  callbackHeaders,
  callbackSecret,
  signCallback,
  signaturesEqual,
  verifyCallback,
};

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

test('file metadata helpers invoke xattr without a shell command string', () => {
  const source = fs.readFileSync(path.join(ROOT, 'lib', 'cortex.js'), 'utf8');

  assert.match(source, /execFileSync\('xattr', \['-w'/);
  assert.match(source, /execFileSync\('xattr', \['-p'/);
  assert.match(source, /execFileSync\('xattr', \['-l'/);
  assert.doesNotMatch(source, /execSync\(`xattr/);
});

test('Sofia hardware and biometric helpers invoke programs with argument arrays', () => {
  const source = fs.readFileSync(path.join(ROOT, 'lib', 'sofia-gate.js'), 'utf8');

  assert.match(source, /execFileSync\(\s*'ioreg'/);
  assert.match(source, /execFileSync\('swift', \['-', String\(reason\)\]/);
  assert.doesNotMatch(source, /execSync\(`swift/);
});

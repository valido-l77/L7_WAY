'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'l7-forge-contract-'));
process.env.L7_DIR = ROOT;
const forge = require('../lib/forge');

test('new Forge citizens begin at the canonical summoned lifecycle', () => {
  const citizen = forge.transmute({
    type: 'tool',
    content: {
      name: 'contract_probe',
      does: 'analyze',
      server: 'test',
      needs: {},
      gives: { status: 'string' },
    },
  });

  assert.equal(citizen.lifecycle, 'summoned');
  assert.equal(citizen.status, 'summoned');
});

test('Forge transitions use the canonical lifecycle state machine', () => {
  const oath = forge.transition('contract_probe', 'oath');
  assert.equal(oath.lifecycle, 'oath');
  assert.equal(oath.status, 'oath');

  const invalid = forge.transition('contract_probe', 'mature');
  assert.match(invalid.error, /Cannot transition from oath to mature/);

  const formed = forge.transition('contract_probe', 'formed');
  const serving = forge.transition('contract_probe', 'active');
  assert.equal(formed.lifecycle, 'formed');
  assert.equal(serving.lifecycle, 'serving');
});

test('Forge rejects citizen names that escape the citizen boundary', () => {
  assert.throws(
    () => forge.transmute({
      type: 'tool',
      content: { name: '../escaped', does: 'analyze', server: 'test' },
    }),
    /Citizen name must not contain path separators/,
  );
  assert.equal(fs.existsSync(path.join(ROOT, 'escaped.citizen')), false);
  assert.throws(() => forge.getCitizen('../escaped'), /Citizen name/);
  assert.throws(() => forge.transition('../escaped', 'oath'), /Citizen name/);
});

test.after(() => fs.rmSync(ROOT, { recursive: true, force: true }));

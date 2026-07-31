'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { toPublicTool, validateRegistryEntry } = require('../lib/tool-registry');

test('legacy tool metadata becomes a schema-valid public registry entry', () => {
  const entry = toPublicTool('emailer', {
    name: 'emailer',
    does: 'communicate',
    description: 'Send one email',
    version: 'v2',
    needs: { to: 'email', subject: 'string' },
    optional: { urgent: 'boolean' },
    gives: { message_id: 'string' },
    pii: true,
    approval: true,
    audit: true,
  }, {
    coordinate: Array(12).fill(5),
    astrocyte: 0.42,
  });

  assert.equal(validateRegistryEntry(entry), true);
  assert.equal(entry.contract_version, 'l7.tool/1.0');
  assert.equal(entry.entity_id, 'tool:emailer');
  assert.deepEqual(entry.parameters.required, ['to', 'subject']);
  assert.equal(entry.parameters.properties.to.format, 'email');
  assert.equal(entry.l7.policyIntent.compliance, 'restricted');
  assert.equal(entry.internal_projection.version, 'l7.projection.12d/1.0');
  assert.equal(entry.coordinate, undefined);
});

test('invalid internal projections fail registry publication closed', () => {
  assert.throws(
    () => toPublicTool('broken', { name: 'broken', does: 'data' }, {
      coordinate: [1, 2, 3],
      astrocyte: 0.5,
    }),
    error => error.code === 'L7_INTEGRITY_VIOLATION',
  );
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');

test('generated OpenAPI and TypeScript declarations stay reproducible', () => {
  const output = path.join(root, 'generated', 'contracts', 'v1', 'openapi.json');
  const declarations = path.join(root, 'packages', 'l7-gateway-client', 'index.d.ts');
  const before = [fs.readFileSync(output, 'utf8'), fs.readFileSync(declarations, 'utf8')];
  const build = spawnSync(process.execPath, ['scripts/build-worker-contract-bundle.js'], { cwd: root });
  assert.equal(build.status, 0, build.stderr.toString());
  assert.deepEqual([fs.readFileSync(output, 'utf8'), fs.readFileSync(declarations, 'utf8')], before);
  const openapi = JSON.parse(before[0]);
  assert.equal(openapi.openapi, '3.1.0');
  assert.equal(openapi.components.schemas.Job.properties.contract_version.const, 'l7.worker.job/1.0');
  assert.equal(openapi.paths['/v1/jobs'].post.operationId, 'submitJob');
  assert.equal(openapi.components.schemas.GatewayJobRequest.properties.tenant_id, undefined);
  assert.equal(openapi.components.schemas.GatewayJobRequest.required.includes('tenant_id'), false);
  assert.equal(before[0].includes('#/definitions/'), false);
  const componentNames = new Set(Object.keys(openapi.components.schemas));
  const references = [...before[0].matchAll(/#\/components\/schemas\/([A-Za-z0-9]+)/g)].map(match => match[1]);
  assert.equal(references.every(name => componentNames.has(name)), true);
});

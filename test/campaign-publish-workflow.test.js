'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const WORKFLOW = path.join(
  process.env.HOME || '',
  'avli_cloud',
  'workflows',
  'campaign-publish.json',
);

test('campaign-publish n8n workflow has a distinct webhook and no audience secrets', () => {
  const raw = fs.readFileSync(WORKFLOW, 'utf8');
  const workflow = JSON.parse(raw);
  const blob = JSON.stringify(workflow);
  assert.match(blob, /campaign-publish/);
  assert.doesNotMatch(blob, /l7-founder-loop/);
  assert.doesNotMatch(raw, /sk-[A-Za-z0-9]+/);
  assert.doesNotMatch(raw, /Bearer [A-Za-z0-9._-]{12,}/);
  assert.doesNotMatch(raw, /https?:\/\/(hooks\.slack|discord\.com|api\.telegram)/i);
  const webhook = (workflow.nodes || []).find(node => /webhook/i.test(node.type || ''));
  assert.ok(webhook, 'expected an n8n webhook node');
  assert.equal(webhook.parameters.path, 'campaign-publish');
  assert.match(blob, /\$env\.(L7_API_TOKEN|L7_GATEWAY_URL)/);
  assert.match(blob, /\$env\.AUDIENCE_WEBHOOK_URL/);
});

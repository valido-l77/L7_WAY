'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createWorkspaceStore } = require('../lib/workspace-store');

function tempStore(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'l7-workspace-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return createWorkspaceStore({ root });
}

function teamWorkspace(overrides = {}) {
  return {
    workspace_id: 'workspace:team',
    plan: 'team',
    tenant_id: 'tenant:team',
    members: [
      { account_id: 'account:founder', role: 'admin', token_id: 'founder' },
      { account_id: 'account:editor', role: 'operator', token_id: 'editor' },
    ],
    artifact_sha256: [],
    ...overrides,
  };
}

test('campaign workspace persists one admin and refuses a public member list view', t => {
  const store = tempStore(t);
  store.save({
    workspace_id: 'workspace:campaign',
    plan: 'campaign',
    tenant_id: 'tenant:local',
    members: [{ account_id: 'account:local', role: 'admin', token_id: 'local' }],
    artifact_sha256: [],
  });

  const loaded = store.load('workspace:campaign');
  assert.equal(loaded.plan, 'campaign');
  assert.equal(loaded.members.length, 1);
  assert.equal(loaded.members[0].role, 'admin');

  const view = store.publicView(loaded, { accountId: 'account:local', role: 'admin' });
  assert.equal(view.plan, 'campaign');
  assert.equal(view.role, 'admin');
  assert.equal('members' in view, false);
});

test('campaign workspace rejects a second member', t => {
  const store = tempStore(t);
  assert.throws(
    () => store.save({
      workspace_id: 'workspace:campaign',
      plan: 'campaign',
      tenant_id: 'tenant:local',
      members: [
        { account_id: 'account:local', role: 'admin', token_id: 'local' },
        { account_id: 'account:other', role: 'operator', token_id: 'other' },
      ],
      artifact_sha256: [],
    }),
    /one admin|campaign/i,
  );
});

test('team workspace allows operator and admin accounts that share an artifact library', t => {
  const store = tempStore(t);
  store.save(teamWorkspace());
  const sha = 'a'.repeat(64);
  store.attachArtifact('workspace:team', sha);

  const loaded = store.load('workspace:team');
  assert.equal(loaded.plan, 'team');
  assert.equal(loaded.members.length, 2);
  assert.ok(loaded.artifact_sha256.includes(sha));

  const operator = store.membershipForTokenId('editor');
  assert.equal(operator.account_id, 'account:editor');
  assert.equal(operator.role, 'operator');
  assert.equal(operator.workspace_id, 'workspace:team');
  assert.ok(store.listArtifacts('workspace:team').some(item => item.sha256 === sha));
});

test('workspace directory is created private (0700)', t => {
  const store = tempStore(t);
  store.save(teamWorkspace({ workspace_id: 'workspace:private-dir' }));
  const mode = fs.statSync(store.root).mode & 0o777;
  assert.equal(mode, 0o700);
});

test('library rows expose hash, media type, and created time without members', t => {
  const store = tempStore(t);
  store.save(teamWorkspace());
  const sha = 'a'.repeat(64);
  store.attachArtifact('workspace:team', sha);
  const rows = store.listArtifacts('workspace:team');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].sha256, sha);
  assert.equal(typeof rows[0].media_type, 'string');
  assert.ok('created_at' in rows[0]);
  assert.equal('members' in rows[0], false);
});

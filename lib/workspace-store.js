'use strict';

const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');
const { atomicWriteFileSync, resolveNamedFile } = require('./safe-path');
const workspaceSchema = require('../schema/v1/workspace.schema.json');

const validateWorkspace = new Ajv({
  allErrors: true,
  strict: true,
  validateFormats: false,
}).compile(workspaceSchema);

function defaultRoot() {
  const l7Dir = process.env.L7_DIR || path.join(process.env.HOME || '', '.l7');
  return path.join(l7Dir, 'state', 'workspaces');
}

function storageFull(error) {
  if (error.code === 'ENOSPC') {
    error.code = 'L7_STORAGE_FULL';
    if (!/no space|ENOSPC/i.test(error.message || '')) {
      error.message = `no space left on device: ${error.message || 'ENOSPC'}`;
    }
  }
  return error;
}

function validationError(message) {
  const error = new Error(message);
  error.code = 'L7_VALIDATION_ERROR';
  return error;
}

function assertCampaignShape(record) {
  if (record.plan !== 'campaign') return;
  if (record.members.length !== 1 || record.members[0].role !== 'admin') {
    throw validationError('Campaign workspace has exactly one admin');
  }
}

function assertTeamShape(record) {
  if (record.plan !== 'team' && record.plan !== 'organization') return;
  if (record.members.length < 2) {
    throw validationError('Team workspace requires two or more named accounts');
  }
}

function publicView(record, principal = {}) {
  return {
    workspace_id: record.workspace_id,
    plan: record.plan,
    role: principal.role || null,
    account_id: principal.accountId || principal.account_id || null,
    artifact_count: (record.artifact_sha256 || []).length,
  };
}

function campaignIdentity(kind, tenantId) {
  const id = tenantId || 'tenant:local';
  return {
    accountId: kind === 'local' ? 'account:local' : `account:${id}`,
    role: 'admin',
    workspaceId: `workspace:${id}`,
    tenantId: id,
  };
}

function syntheticCampaign(kind, tenantId) {
  const identity = campaignIdentity(kind, tenantId);
  return {
    workspace_id: identity.workspaceId,
    plan: 'campaign',
    tenant_id: identity.tenantId,
    members: [{
      account_id: identity.accountId,
      role: 'admin',
      token_id: kind === 'local' ? 'local' : identity.tenantId,
    }],
    artifact_sha256: [],
  };
}

function createWorkspaceStore(options = {}) {
  const root = path.resolve(options.root || defaultRoot());
  const writeFile = options.writeFile || atomicWriteFileSync;

  function ensureRoot() {
    fs.mkdirSync(root, { recursive: true });
    fs.chmodSync(root, 0o700);
  }

  function pathFor(workspaceId) {
    return resolveNamedFile(root, workspaceId, '.json', { label: 'Workspace ID', maxLength: 128 });
  }

  function write(record) {
    ensureRoot();
    try {
      writeFile(pathFor(record.workspace_id), `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
      return record;
    } catch (error) {
      throw storageFull(error);
    }
  }

  function load(workspaceId) {
    try {
      return JSON.parse(fs.readFileSync(pathFor(workspaceId), 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  }

  function list() {
    if (!fs.existsSync(root)) return [];
    return fs.readdirSync(root, { withFileTypes: true })
      .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
      .map(entry => load(entry.name.slice(0, -5)))
      .filter(Boolean);
  }

  function save(record) {
    if (!validateWorkspace(record)) {
      const details = (validateWorkspace.errors || []).map(item => item.message).join('; ');
      throw validationError(`Invalid workspace: ${details}`);
    }
    assertCampaignShape(record);
    assertTeamShape(record);
    const normalized = {
      ...record,
      artifact_sha256: [...new Set(record.artifact_sha256 || [])],
    };
    return write(normalized);
  }

  function membershipForTokenId(tokenId) {
    if (!tokenId) return null;
    for (const workspace of list()) {
      const member = (workspace.members || []).find(item => item.token_id === tokenId);
      if (!member) continue;
      return {
        workspace_id: workspace.workspace_id,
        plan: workspace.plan,
        tenant_id: workspace.tenant_id || workspace.workspace_id,
        account_id: member.account_id,
        role: member.role,
        token_id: member.token_id,
      };
    }
    return null;
  }

  function attachArtifact(workspaceId, sha256) {
    if (!/^[a-f0-9]{64}$/.test(sha256 || '')) {
      throw validationError('Artifact hash must be a SHA-256 hex digest');
    }
    const existing = load(workspaceId);
    if (!existing) {
      throw validationError(`Workspace not found: ${workspaceId}`);
    }
    if (!existing.artifact_sha256.includes(sha256)) {
      existing.artifact_sha256.push(sha256);
    }
    return save(existing);
  }

  function listArtifacts(workspaceId, describe) {
    const existing = load(workspaceId);
    return (existing?.artifact_sha256 || []).map(sha256 => {
      const extra = typeof describe === 'function' ? describe(sha256) || {} : {};
      return {
        sha256,
        media_type: extra.media_type || 'application/octet-stream',
        created_at: extra.created_at || null,
      };
    });
  }

  return {
    root,
    load,
    save,
    list,
    publicView,
    membershipForTokenId,
    attachArtifact,
    listArtifacts,
  };
}

module.exports = {
  createWorkspaceStore,
  defaultRoot,
  publicView,
  campaignIdentity,
  syntheticCampaign,
};

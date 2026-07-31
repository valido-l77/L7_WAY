'use strict';

const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');
const { CONTRACT_VERSIONS, normalizeLifecycle } = require('./contracts');

const schemaRoot = path.join(__dirname, '..', 'schema', 'v1');
const commonLinguaSchema = JSON.parse(fs.readFileSync(
  path.join(schemaRoot, 'common-lingua.schema.json'),
  'utf8',
));
const registryEntrySchema = JSON.parse(fs.readFileSync(
  path.join(schemaRoot, 'tool-registry-entry.schema.json'),
  'utf8',
));
const ajv = new Ajv({ allErrors: true, strict: true });
ajv.addSchema(commonLinguaSchema);
const validateRegistryEntry = ajv.compile(registryEntrySchema);

const CAPABILITIES = new Set(['communicate', 'data', 'analyze', 'automate', 'render', 'search']);

function capability(tool) {
  if (CAPABILITIES.has(tool.does)) return tool.does;
  if (tool.does === 'fetch') return 'data';
  return 'data';
}

function jsonSchemaFor(definition) {
  const source = typeof definition === 'string' ? { type: definition } : definition || {};
  const type = source.type || 'string';
  const schema = {};

  if (type === 'email') Object.assign(schema, { type: 'string', format: 'email' });
  else if (type === 'date') Object.assign(schema, { type: 'string', format: 'date' });
  else if (type === 'phone') Object.assign(schema, { type: 'string', pattern: '^\\+?[0-9 ()-]+$' });
  else if (['string', 'number', 'boolean', 'array', 'object'].includes(type)) schema.type = type;
  else schema.type = 'string';

  if (source.description) schema.description = String(source.description);
  if (source.default !== undefined) schema.default = source.default;
  if (Array.isArray(source.enum)) schema.enum = source.enum;
  return schema;
}

function objectSchema(required = {}, optional = {}) {
  const properties = {};
  for (const [name, definition] of Object.entries(required || {})) {
    properties[name] = jsonSchemaFor(definition);
  }
  for (const [name, definition] of Object.entries(optional || {})) {
    properties[name] = jsonSchemaFor(definition);
  }
  return {
    type: 'object',
    properties,
    required: Object.keys(required || {}),
    additionalProperties: false,
  };
}

function deriveDeclaration(tool) {
  const version = /^v[0-9]+$/.test(tool.version || '') ? tool.version : 'v1';
  const output = tool.output === 'html'
    ? 'html'
    : ['file', 'binary'].includes(tool.output)
    ? 'file'
    : tool.output === 'text'
    ? 'markdown'
    : 'json';
  const lifecycle = normalizeLifecycle(tool.lifecycle || tool.status)
    || (tool.deprecated ? 'sunset' : 'serving');

  return {
    capability: capability(tool),
    data: {
      pii: tool.pii ? 'pii' : 'non_pii',
      source: tool.source === 'internal' ? 'internal' : tool.source === 'mixed' ? 'mixed' : 'external',
      shape: output === 'file' ? 'file' : tool.runs === 'batch' ? 'list' : 'record',
      freshness: tool.freshness === 'cached' ? 'cached' : tool.freshness === 'snapshot' ? 'snapshot' : 'live',
    },
    policyIntent: {
      mode: process.env.L7_MODE === 'mock' ? 'test' : 'live',
      risk: tool.pii ? 'high' : tool.approval ? 'medium' : 'low',
      requireApproval: tool.approval === true,
      compliance: tool.pii ? 'restricted' : 'standard',
    },
    presentation: { ui: 'card', output, density: 'standard' },
    orchestration: {
      flow: tool.runs === 'batch' ? 'parallel' : tool.runs === 'stream' ? 'sequence' : 'single',
      trigger: 'manual',
      retry: 'none',
    },
    timeVersioning: { toolVersion: version, schemaVersion: 'v1', lifecycle },
    identitySecurity: {
      role: 'operator',
      auth: 'token',
      audit: tool.audit === false ? 'off' : 'on',
    },
  };
}

function toPublicTool(name, tool, projection) {
  const version = /^v[0-9]+$/.test(tool.version || '') ? tool.version : 'v1';
  const entry = {
    contract_version: CONTRACT_VERSIONS.tool,
    tool: name,
    version,
    description: tool.description || tool.tagline || `L7 tool ${name}`,
    parameters: objectSchema(tool.needs, tool.optional),
    returns: objectSchema(tool.gives),
    entity_id: tool.entity_id || `tool:${name}`,
    l7: deriveDeclaration(tool),
    internal_projection: {
      version: CONTRACT_VERSIONS.projection12d,
      coordinate: projection.coordinate,
      astrocyte: projection.astrocyte,
    },
  };

  if (!validateRegistryEntry(entry)) {
    const error = new Error(`Invalid public registry entry for ${name}: ${ajv.errorsText(validateRegistryEntry.errors)}`);
    error.code = 'L7_INTEGRITY_VIOLATION';
    throw error;
  }
  return entry;
}

module.exports = { deriveDeclaration, objectSchema, toPublicTool, validateRegistryEntry };
// L7:PROVENANCE
// Creator: Alberto Valido Delgado | System: L7 WAY | License: Proprietary — Framework free, products licensed (Law XXII)
// File: lib/tool-registry.js | Body-Hash: SHA-256:381fbc60f92da23d1a886231b368f40817fcfdce5da165a1843da5382af3660e
// Chain-Hash: SHA-256:7c6dea1d3efb676a284e4b8873f0f659f7dceaf5e6ea7a75ae0c00d159328659 | Signed: 2026-07-28T15:51:22.970962+00:00
// This work is the intellectual property of Alberto Valido Delgado.
// Chain: 76 works. Verify: python3 provenance.py verify lib/tool-registry.js
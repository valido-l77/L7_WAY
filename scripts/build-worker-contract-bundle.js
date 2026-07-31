#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const schemaRoot = path.join(root, 'schema', 'v1');
const definitionsDocument = JSON.parse(fs.readFileSync(path.join(schemaRoot, 'worker-definitions.schema.json')));
const versions = JSON.parse(fs.readFileSync(path.join(schemaRoot, 'contract-versions.json')));
const definitions = definitionsDocument.definitions;
const outputRoot = path.join(root, 'generated', 'contracts', 'v1');
const gatewayJobRequest = JSON.parse(JSON.stringify(definitions.jobRequest));
gatewayJobRequest.required = gatewayJobRequest.required.filter(name => name !== 'tenant_id');
delete gatewayJobRequest.properties.tenant_id;

function schemaName(name) {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function rewriteReferences(value) {
  if (Array.isArray(value)) return value.map(rewriteReferences);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => {
    if (key === '$ref' && typeof item === 'string' && item.startsWith('#/definitions/')) {
      return [key, `#/components/schemas/${schemaName(item.slice('#/definitions/'.length))}`];
    }
    return [key, rewriteReferences(item)];
  }));
}

function component(name) {
  return { $ref: `#/components/schemas/${name}` };
}

const openapi = {
  openapi: '3.1.0',
  info: {
    title: 'L7 Capability Gateway',
    version: versions.gateway.split('/')[1],
    description: 'Public, governed L7 job API. AVLI worker endpoints remain private.',
  },
  paths: {
    '/v1/capabilities': {
      get: {
        operationId: 'listCapabilities',
        responses: { 200: { description: 'Capability discovery', content: { 'application/json': { schema: component('CapabilitiesEnvelope') } } } },
      },
    },
    '/v1/jobs': {
      get: {
        operationId: 'listJobs',
        responses: { 200: { description: 'Tenant-scoped jobs', content: { 'application/json': { schema: component('JobListEnvelope') } } } },
      },
      post: {
        operationId: 'submitJob',
        requestBody: { required: true, content: { 'application/json': { schema: component('GatewayJobRequest') } } },
        responses: { 202: { description: 'Accepted job', content: { 'application/json': { schema: component('JobEnvelope') } } } },
      },
    },
    '/v1/jobs/{jobId}': {
      parameters: [{ name: 'jobId', in: 'path', required: true, schema: { type: 'string' } }],
      get: {
        operationId: 'getJob',
        responses: { 200: { description: 'Job status', content: { 'application/json': { schema: component('JobEnvelope') } } } },
      },
    },
    '/v1/jobs/{jobId}/cancel': {
      parameters: [{ name: 'jobId', in: 'path', required: true, schema: { type: 'string' } }],
      post: {
        operationId: 'cancelJob',
        responses: { 200: { description: 'Cancelled job', content: { 'application/json': { schema: component('JobEnvelope') } } } },
      },
    },
    '/v1/artifacts/{sha256}': {
      parameters: [{ name: 'sha256', in: 'path', required: true, schema: definitions.sha256 }],
      get: { operationId: 'downloadArtifact', responses: { 200: { description: 'Content-addressed artifact' } } },
    },
  },
  components: {
    schemas: {
      ...Object.fromEntries(Object.entries(definitions).map(([name, schema]) => [
        schemaName(name), rewriteReferences(schema),
      ])),
      GatewayJobRequest: rewriteReferences(gatewayJobRequest),
      Error: rewriteReferences(definitions.job.properties.error.oneOf[1]),
      ResultMeta: {
        type: 'object',
        required: ['contract_version', 'timestamp'],
        properties: {
          contract_version: { const: versions.result },
          timestamp: { type: 'string', format: 'date-time' },
          error_code: { type: 'string' },
          job_id: { type: 'string' },
        },
        additionalProperties: true,
      },
      CapabilitiesEnvelope: {
        type: 'object', required: ['success', 'result', 'error', 'meta'],
        properties: { success: { const: true }, result: component('Capabilities'), error: { type: 'null' }, meta: component('ResultMeta') },
      },
      JobEnvelope: {
        type: 'object', required: ['success', 'result', 'error', 'meta'],
        properties: { success: { const: true }, result: { type: 'object', required: ['job'], properties: { job: component('Job') } }, error: { type: 'null' }, meta: component('ResultMeta') },
      },
      JobListEnvelope: {
        type: 'object', required: ['success', 'result', 'error', 'meta'],
        properties: { success: { const: true }, result: { type: 'object', required: ['jobs'], properties: { jobs: { type: 'array', items: component('Job') } } }, error: { type: 'null' }, meta: component('ResultMeta') },
      },
    },
  },
};

const modalities = definitions.capability.properties.modality.enum.map(value => JSON.stringify(value)).join(' | ');
const privacyClasses = definitions.jobRequest.properties.privacy_class.enum.map(value => JSON.stringify(value)).join(' | ');
const jobStates = definitions.job.properties.state.enum.map(value => JSON.stringify(value)).join(' | ');
const errorCodes = definitions.job.properties.error.oneOf[1].properties.code.enum.map(value => JSON.stringify(value)).join(' | ');
const declarations = `// Generated by scripts/build-worker-contract-bundle.js. Do not edit.\n` +
`export type Modality = ${modalities};\n` +
`export type PrivacyClass = ${privacyClasses};\n` +
`export type JobState = ${jobStates};\n` +
`export type ErrorCode = ${errorCodes};\n` +
`export interface Capability { id: string; modality: Modality; operations: string[]; privacy_classes: PrivacyClass[]; available: boolean; models: string[]; limits: { max_concurrency: number; max_input_bytes: number; timeout_seconds: number } }\n` +
`export interface Capabilities { contract_version: '${versions.workerCapabilities}'; worker_id: string; worker_version: string; generated_at: string; capabilities: Capability[] }\n` +
`export interface JobRequest { contract_version?: '${versions.workerJobRequest}'; request_id?: string; capability: string; input: Record<string, unknown>; privacy_class: PrivacyClass; deadline: string; metadata?: Record<string, unknown> }\n` +
`export interface Artifact { sha256: string; bytes: number; media_type: string; producer: string; model: string; model_version?: string | null; license_id: string; prompt_hash: string | null; created_at: string; delivery_url?: string }\n` +
`export interface Job { contract_version: '${versions.workerJob}'; job_id: string; request_id: string; tenant_id: string; capability: string; state: JobState; created_at: string; updated_at: string; progress: number; result?: unknown; artifacts: Artifact[]; error: { code: ErrorCode; message: string } | null }\n` +
`export interface ClientOptions { fetch?: typeof globalThis.fetch; credentials?: RequestCredentials; headers?: Record<string, string> }\n` +
`export class L7ApiError extends Error { status: number; code: ErrorCode | string; details: unknown; }\n` +
`export class L7Client { constructor(baseUrl: string, options?: ClientOptions); capabilities(): Promise<Capabilities>; listJobs(): Promise<Job[]>; submitJob(request: JobRequest): Promise<Job>; getJob(jobId: string): Promise<Job>; cancelJob(jobId: string): Promise<Job>; artifactUrl(sha256: string): string; }\n`;

fs.mkdirSync(outputRoot, { recursive: true });
fs.writeFileSync(path.join(outputRoot, 'openapi.json'), `${JSON.stringify(openapi, null, 2)}\n`);
fs.writeFileSync(path.join(root, 'packages', 'l7-gateway-client', 'index.d.ts'), declarations);

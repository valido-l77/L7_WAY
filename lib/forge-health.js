'use strict';

const http = require('http');
const https = require('https');

const FORGE_CAPABILITIES = Object.freeze([
  {
    id: 'tool.rag-pipeline',
    tool: 'rag_pipeline',
    modality: 'text',
    operations: ['query', 'execute', 'cancel'],
  },
  {
    id: 'tool.financial-ratios',
    tool: 'financial_ratios',
    modality: 'automation',
    operations: ['execute', 'cancel'],
  },
  {
    id: 'tool.dcf-valuation',
    tool: 'dcf_valuation',
    modality: 'automation',
    operations: ['execute', 'cancel'],
  },
]);

function forgeBaseUrl() {
  return String(process.env.L7_FORGE_URL || 'http://127.0.0.1:7378').replace(/\/$/, '');
}

function requestJson(urlString, timeoutMs) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const transport = url.protocol === 'https:' ? https : http;
    const req = transport.request({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port,
      path: `${url.pathname}${url.search}`,
      method: 'GET',
      timeout: timeoutMs,
    }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        try {
          resolve({ status: res.statusCode, body: JSON.parse(text) });
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on('timeout', () => {
      req.destroy();
      const error = new Error('forge health timed out');
      error.code = 'L7_TIMEOUT';
      reject(error);
    });
    req.on('error', reject);
    req.end();
  });
}

async function readForgeHealth(options = {}) {
  const timeoutMs = Number(options.timeoutMs) || 250;
  try {
    const response = await requestJson(`${forgeBaseUrl()}/health`, timeoutMs);
    return {
      available: response.status === 200 && response.body?.ok !== false,
      tools: Number(response.body?.tools) || 0,
      url: forgeBaseUrl(),
    };
  } catch {
    return { available: false, tools: 0, url: forgeBaseUrl() };
  }
}

function forgeCapabilityDocuments(health, options = {}) {
  const maxBytes = Number(options.maxInputBytes) || 1024 * 1024;
  const timeoutSeconds = Number(options.timeoutSeconds) || 30;
  return FORGE_CAPABILITIES.map(item => ({
    id: item.id,
    modality: item.modality,
    operations: item.operations,
    privacy_classes: ['public', 'internal'],
    available: Boolean(health?.available),
    models: ['skill-runtime-forge'],
    limits: {
      max_concurrency: 2,
      max_input_bytes: maxBytes,
      timeout_seconds: timeoutSeconds,
    },
  }));
}

module.exports = {
  FORGE_CAPABILITIES,
  forgeBaseUrl,
  forgeCapabilityDocuments,
  readForgeHealth,
};




/**
 * L7 Flow Executor - Run flows step by step
 *
 * Usage:
 *   node executor.js run <flow> [--input key=value]
 *   node executor.js resume <flow> <id>
 *   node executor.js approve <flow> <id>
 *   node executor.js reject <flow> <id>
 *   node executor.js status <flow> <id>
 *   node executor.js list [flow]
 *   node executor.js --dry-run <flow>
 */

const fs = require('fs');
const path = require('path');
const { parseFile, interpolate, interpolateValue, evaluateCondition, resolveVar } = require('./parser');
const state = require('./state');
const gateway = require('./gateway');
const { resolveNamedFile } = require('./safe-path');

const L7_DIR = process.env.L7_DIR || path.join(process.env.HOME, '.l7');
const TOOLS_DIR = path.join(L7_DIR, 'tools');
const FLOWS_DIR = path.join(L7_DIR, 'flows');

/**
 * Load a flow by name
 */
function loadFlow(name) {
  const flowPath = resolveNamedFile(FLOWS_DIR, name, '.flow', { label: 'Flow name' });
  if (!fs.existsSync(flowPath)) {
    throw new Error(`Flow not found: ${name}`);
  }
  return parseFile(flowPath);
}

/**
 * Load a tool by name
 */
function loadTool(name) {
  const toolPath = resolveNamedFile(TOOLS_DIR, name, '.tool', { label: 'Tool name' });
  if (!fs.existsSync(toolPath)) {
    return null;
  }
  return parseFile(toolPath);
}

/**
 * Build execution context from state
 */
function buildContext(execState, inputs = {}) {
  return {
    ...inputs,
    ...execState.inputs,
    ...execState.results,
    item: null, // Set during each loops
    results: execState.results
  };
}

/**
 * Check if rules allow execution
 */
function checkRules(rules, context) {
  if (!rules || rules.length === 0) return { allowed: true };

  for (const rule of rules) {
    // Time window: only: 9am-6pm
    if (rule.only) {
      const timeMatch = rule.only.match(/^(\d+)(am|pm)?-(\d+)(am|pm)?$/i);
      if (timeMatch) {
        const [, startH, startP, endH, endP] = timeMatch;
        let start = parseInt(startH);
        let end = parseInt(endH);
        if (startP?.toLowerCase() === 'pm' && start < 12) start += 12;
        if (endP?.toLowerCase() === 'pm' && end < 12) end += 12;

        const now = new Date();
        const hour = now.getHours();
        if (hour < start || hour >= end) {
          return { allowed: false, reason: `Outside time window: ${rule.only}` };
        }
      }

      // Weekdays only
      if (rule.only.toLowerCase() === 'weekdays') {
        const day = new Date().getDay();
        if (day === 0 || day === 6) {
          return { allowed: false, reason: 'Weekends not allowed' };
        }
      }
    }

    // Skip rule: skip items with truthy field
    if (rule.skip && context.item) {
      const val = resolveVar(rule.skip, context.item);
      if (val) {
        return { allowed: false, reason: `Skipped: ${rule.skip} is truthy`, skip: true };
      }
    }

    // Require rule: skip items with falsy field
    if (rule.require && context.item) {
      const val = resolveVar(rule.require, context.item);
      if (!val) {
        return { allowed: false, reason: `Skipped: ${rule.require} is falsy`, skip: true };
      }
    }
  }

  return { allowed: true };
}

function getFailureStrategy(step, rules) {
  return step.on_fail || rules.find(r => r.on_fail)?.on_fail || 'halt';
}

function retryLimitForStep(step, rules) {
  const explicitRetry = Number.isInteger(step.retry) ? step.retry : null;
  if (explicitRetry !== null) return explicitRetry;
  return getFailureStrategy(step, rules) === 'retry' ? 1 : 0;
}

function throttleDelayMs(throttle) {
  if (!throttle) return 0;
  const match = String(throttle).match(/^([0-9]+)\/(second|minute|hour)$/);
  if (!match) return 0;

  const count = Number(match[1]);
  if (!Number.isFinite(count) || count <= 0) return 0;

  const unitMs = {
    second: 1000,
    minute: 60 * 1000,
    hour: 60 * 60 * 1000,
  }[match[2]];

  return Math.ceil(unitMs / count);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute a single tool call via MCP gateway
 */
async function executeTool(toolName, params, context) {
  const tool = loadTool(toolName);

  // Log the call (pending)
  state.audit({
    who: { entity_id: 'executor', role: 'system' },
    what: { tool: toolName, params, intent: 'execute' },
    result: 'pending'
  });

  // Display what we're doing
  console.log(`  → do: ${toolName}`);
  if (params && Object.keys(params).length > 0) {
    for (const [k, v] of Object.entries(params)) {
      console.log(`       ${k}: ${v}`);
    }
  }

  try {
    // Execute via gateway (respects L7_MODE env: http, spawn, or mock)
    const result = await gateway.execute(toolName, params);

    // Log success
    state.audit({
      who: { entity_id: 'executor', role: 'system' },
      what: { tool: toolName, result: 'success', response: result }
    });

    console.log(`  ✓ ${toolName}: ${result.ok ? 'ok' : 'failed'}`);
    return result;

  } catch (err) {
    // Log failure
    state.audit({
      who: { entity_id: 'executor', role: 'system' },
      what: { tool: toolName, result: 'error', error: err.message }
    });

    throw err;
  }
}

async function executeToolWithRetry(toolName, params, context, step, rules) {
  const limit = retryLimitForStep(step, rules);
  let attempt = 0;

  while (true) {
    try {
      return await executeTool(toolName, params, context);
    } catch (err) {
      if (attempt >= limit) throw err;
      attempt++;
      console.log(`  → retry ${attempt}/${limit}: ${toolName} after ${err.message}`);
    }
  }
}

/**
 * Execute a do step
 */
async function executeDoStep(step, execState, context, rules, dryRun) {
  const toolName = step.do;

  // Check condition (only if NOT an each loop, or if condition doesn't reference $item)
  const isItemCondition = step.if && step.if.includes('$item');
  if (step.if && !step.each && !evaluateCondition(step.if, context)) {
    console.log(`  → skip: ${toolName} (condition: ${step.if})`);
    return null;
  }

  // Handle each loop
  if (step.each) {
    const items = resolveVar(step.each, context);
    if (!Array.isArray(items)) {
      console.log(`  → skip: ${toolName} (${step.each} is not array)`);
      return null;
    }

    const results = [];
    let okCount = 0;
    let failCount = 0;
    const delayMs = throttleDelayMs(step.throttle);
    let nextRunAt = Date.now();

    for (const item of items) {
      // Create item context
      const itemContext = { ...context, item };

      // Check rules for this item
      const ruleCheck = checkRules(rules, itemContext);
      if (!ruleCheck.allowed) {
        if (ruleCheck.skip) {
          console.log(`  → skip item: ${ruleCheck.reason}`);
          continue;
        }
      }

      // Check step condition for this item
      if (step.if && !evaluateCondition(step.if, itemContext)) {
        console.log(`  → skip item: condition false`);
        continue;
      }

      // Interpolate params
      const params = {};
      if (step.with) {
        for (const [k, v] of Object.entries(step.with)) {
          params[k] = interpolateValue(v, itemContext);
        }
      }

      if (dryRun) {
        console.log(`  → [dry-run] ${toolName}(${JSON.stringify(params)})`);
        results.push({ ok: true, item });
        okCount++;
      } else {
        try {
          if (delayMs > 0) {
            const now = Date.now();
            if (now < nextRunAt) await sleep(nextRunAt - now);
            nextRunAt = Math.max(Date.now(), nextRunAt) + delayMs;
          }

          const result = await executeToolWithRetry(toolName, params, itemContext, step, rules);
          results.push({ ...result, item });
          if (result.ok) okCount++;
          else failCount++;
        } catch (err) {
          console.log(`  → error: ${err.message}`);
          results.push({ ok: false, error: err.message, item });
          failCount++;

          // Check failure strategy
          const failureStrategy = getFailureStrategy(step, rules);
          if (failureStrategy === 'halt' || failureStrategy === 'retry') {
            throw err;
          }
        }
      }
    }

    return {
      results,
      ok_count: okCount,
      fail_count: failCount,
      total: items.length
    };
  }

  // Single execution
  const params = {};
  if (step.with) {
    for (const [k, v] of Object.entries(step.with)) {
      params[k] = interpolateValue(v, context);
    }
  }

  if (dryRun) {
    console.log(`  → [dry-run] ${toolName}(${JSON.stringify(params)})`);
    return { ok: true };
  }

  return await executeToolWithRetry(toolName, params, context, step, rules);
}

/**
 * Execute a wait step (checkpoint)
 */
async function executeWaitStep(step, execState, context, stepIndex) {
  // Check condition
  if (step.if && !evaluateCondition(step.if, context)) {
    console.log(`  → skip wait: condition false`);
    return { skipped: true };
  }

  const message = interpolate(step.wait, context);
  console.log(`\n  ⏸ CHECKPOINT: ${message}`);
  console.log(`    To approve: node executor.js approve ${execState.flow} ${execState.id}`);
  console.log(`    To reject:  node executor.js reject ${execState.flow} ${execState.id}\n`);

  state.checkpoint(execState, message, stepIndex);

  return { waiting: true, message };
}

/**
 * Execute a flow
 */
async function executeFlow(flowName, inputs = {}, options = {}) {
  const { dryRun = false, resume = null } = options;

  const flow = loadFlow(flowName);
  console.log(`\n▶ Flow: ${flow.name}`);
  if (flow.description) console.log(`  ${flow.description}`);
  console.log('');

  // Create or resume state
  let execState;
  if (resume) {
    execState = state.load(flowName, resume);
    if (!execState) {
      throw new Error(`No state found for ${flowName}/${resume}`);
    }
    if (execState.status === 'waiting') {
      throw new Error(`Flow is waiting for checkpoint approval`);
    }
    console.log(`  Resuming from step ${execState.step + 1}`);
  } else {
    execState = state.create(flowName, inputs);
    console.log(`  Execution ID: ${execState.id}`);
  }

  state.setStatus(execState, 'running');

  const context = buildContext(execState, inputs);
  const rules = flow.rules || [];

  // Check global rules
  const globalCheck = checkRules(rules, context);
  if (!globalCheck.allowed && !globalCheck.skip) {
    console.log(`  ✗ Blocked by rules: ${globalCheck.reason}`);
    state.setStatus(execState, 'blocked');
    return execState;
  }

  // Execute steps
  for (let i = execState.step; i < flow.steps.length; i++) {
    const step = flow.steps[i];
    execState.step = i;

    console.log(`\n[Step ${i + 1}/${flow.steps.length}]`);

    try {
      if (step.do) {
        // Do step
        const result = await executeDoStep(step, execState, context, rules, dryRun);

        if (result && step.as) {
          state.setResult(execState, step.as, result);
          context[step.as] = result;
        }
      } else if (step.wait) {
        // Wait step (checkpoint)
        if (dryRun) {
          const message = interpolate(step.wait, context);
          console.log(`  → [dry-run] wait: "${message}"`);
        } else {
          const result = await executeWaitStep(step, execState, context, i);
          if (result.waiting) {
            return execState; // Pause execution
          }
        }
      }

      state.advance(execState);
    } catch (err) {
      console.log(`  ✗ Error: ${err.message}`);
      state.addError(execState, err, i);

      // Check failure strategy
      const failStrategy = getFailureStrategy(step, rules);
      if (failStrategy === 'halt' || failStrategy === 'retry') {
        state.setStatus(execState, 'failed');
        return execState;
      }
      // continue to next step
    }
  }

  state.setStatus(execState, 'completed');
  console.log(`\n✓ Flow completed`);

  return execState;
}

/**
 * Approve a waiting checkpoint
 */
function approve(flowName, id) {
  const execState = state.load(flowName, id);
  if (!execState) {
    throw new Error(`No state found for ${flowName}/${id}`);
  }
  if (execState.status !== 'waiting') {
    throw new Error(`Flow is not waiting (status: ${execState.status})`);
  }

  state.resolveCheckpoint(execState, 'approve');
  console.log(`✓ Checkpoint approved for ${flowName}/${id}`);
  console.log(`  Resume with: node executor.js resume ${flowName} ${id}`);

  return execState;
}

/**
 * Reject a waiting checkpoint
 */
function reject(flowName, id) {
  const execState = state.load(flowName, id);
  if (!execState) {
    throw new Error(`No state found for ${flowName}/${id}`);
  }
  if (execState.status !== 'waiting') {
    throw new Error(`Flow is not waiting (status: ${execState.status})`);
  }

  state.resolveCheckpoint(execState, 'reject');
  console.log(`✗ Checkpoint rejected for ${flowName}/${id}`);

  return execState;
}

/**
 * Show execution status
 */
function showStatus(flowName, id) {
  const execState = state.load(flowName, id);
  if (!execState) {
    throw new Error(`No state found for ${flowName}/${id}`);
  }

  console.log(`\nFlow: ${execState.flow}`);
  console.log(`ID: ${execState.id}`);
  console.log(`Status: ${execState.status}`);
  console.log(`Step: ${execState.step + 1}`);
  console.log(`Started: ${execState.started}`);
  console.log(`Updated: ${execState.updated}`);

  if (execState.checkpoints.length > 0) {
    console.log(`\nCheckpoints:`);
    for (const cp of execState.checkpoints) {
      const status = cp.resolved ? `${cp.decision} at ${cp.resolved}` : 'pending';
      console.log(`  - Step ${cp.step + 1}: ${cp.message} [${status}]`);
    }
  }

  if (execState.errors.length > 0) {
    console.log(`\nErrors:`);
    for (const err of execState.errors) {
      console.log(`  - Step ${err.step + 1}: ${err.error}`);
    }
  }

  if (Object.keys(execState.results).length > 0) {
    console.log(`\nResults:`);
    for (const [k, v] of Object.entries(execState.results)) {
      const summary = typeof v === 'object' ? JSON.stringify(v).slice(0, 60) + '...' : v;
      console.log(`  ${k}: ${summary}`);
    }
  }

  return execState;
}

/**
 * List executions
 */
function listExecutions(flowName = null) {
  const states = state.list(flowName);

  if (states.length === 0) {
    console.log('No executions found');
    return;
  }

  console.log(`\n${states.length} execution(s):\n`);
  for (const s of states) {
    const age = Math.round((Date.now() - new Date(s.updated)) / 1000 / 60);
    console.log(`  ${s.flow}/${s.id}  [${s.status}]  step ${s.step + 1}  (${age}m ago)`);
  }
}

// CLI
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '--help') {
    console.log(`
L7 Flow Executor

Usage:
  node executor.js run <flow> [--input key=value] [--dry-run]
  node executor.js resume <flow> <id>
  node executor.js approve <flow> <id>
  node executor.js reject <flow> <id>
  node executor.js status <flow> <id>
  node executor.js list [flow]

Examples:
  node executor.js run yearbook --input county=Wake --input message="Hi!"
  node executor.js --dry-run yearbook
  node executor.js approve yearbook abc123
`);
    return;
  }

  try {
    switch (command) {
      case 'run':
      case '--dry-run': {
        const dryRun = command === '--dry-run' || args.includes('--dry-run');
        const flowName = dryRun && command === '--dry-run' ? args[1] : args[1];

        if (!flowName) {
          console.error('Error: flow name required');
          process.exit(1);
        }

        // Parse inputs
        const inputs = {};
        for (const arg of args.slice(2)) {
          if (arg.startsWith('--input')) continue;
          if (arg.includes('=')) {
            const [k, v] = arg.split('=');
            inputs[k] = v;
          }
        }
        // Also handle --input key=value format
        for (let i = 2; i < args.length; i++) {
          if (args[i] === '--input' && args[i + 1]) {
            const [k, v] = args[i + 1].split('=');
            inputs[k] = v;
            i++;
          }
        }

        await executeFlow(flowName, inputs, { dryRun });
        break;
      }

      case 'resume': {
        const [, flowName, id] = args;
        if (!flowName || !id) {
          console.error('Error: flow name and id required');
          process.exit(1);
        }
        await executeFlow(flowName, {}, { resume: id });
        break;
      }

      case 'approve': {
        const [, flowName, id] = args;
        if (!flowName || !id) {
          console.error('Error: flow name and id required');
          process.exit(1);
        }
        approve(flowName, id);
        break;
      }

      case 'reject': {
        const [, flowName, id] = args;
        if (!flowName || !id) {
          console.error('Error: flow name and id required');
          process.exit(1);
        }
        reject(flowName, id);
        break;
      }

      case 'status': {
        const [, flowName, id] = args;
        if (!flowName || !id) {
          console.error('Error: flow name and id required');
          process.exit(1);
        }
        showStatus(flowName, id);
        break;
      }

      case 'list': {
        const flowName = args[1];
        listExecutions(flowName);
        break;
      }

      default:
        console.error(`Unknown command: ${command}`);
        process.exit(1);
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

module.exports = {
  loadFlow,
  loadTool,
  executeFlow,
  approve,
  reject,
  showStatus,
  listExecutions
};

if (require.main === module) {
  main();
}

// L7:PROVENANCE
// Creator: Alberto Valido Delgado | System: L7 WAY | License: Proprietary — Framework free, products licensed (Law XXII)
// File: lib/executor.js | Body-Hash: SHA-256:d58005869fae7569eb6a2e48fc67dc7d913db312d7d8d3401c2b75842cfe1050
// Chain-Hash: SHA-256:0c971ad29e2f8753181916e01860ee03031101f35dc67dc1916dde5e8fb0f3a5 | Signed: 2026-03-01T15:09:50.016901+00:00
// This work is the intellectual property of Alberto Valido Delgado.
// Chain: 18 works. Verify: python3 provenance.py verify lib/executor.js
// L7:PROVENANCE

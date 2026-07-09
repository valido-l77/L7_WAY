

/**
 * L7 Parser - Parse and validate .flow and .tool files
 *
 * Usage:
 *   node parser.js validate <file>     - Validate a .flow or .tool file
 *   node parser.js parse <file>        - Parse and output JSON
 *   node parser.js list tools          - List all tools
 *   node parser.js list flows          - List all flows
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const Ajv = require('ajv');

const L7_DIR = process.env.L7_DIR || path.join(process.env.HOME, '.l7');
const SCHEMA_DIR = path.join(__dirname, '..', 'schema');

// Load schemas
const flowSchema = JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, 'flow.schema.json'), 'utf8'));
const toolSchema = JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, 'tool.schema.json'), 'utf8'));

const ajv = new Ajv({ allErrors: true, strict: false });
const validateFlow = ajv.compile(flowSchema);
const validateTool = ajv.compile(toolSchema);

/**
 * Parse a YAML file (handles both .flow, .tool, and legacy .l7)
 */
function parseFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const ext = path.extname(filePath);

  // For .l7 files, use custom YAML-like parser
  if (ext === '.l7') {
    return parseLegacyL7(content);
  }

  // For .flow and .tool, use standard YAML
  return yaml.load(content);
}

/**
 * Parse legacy .l7 format (key: value with nested sections)
 */
function parseLegacyL7(content) {
  const result = {};
  const lines = content.split('\n');
  let currentSection = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Check for section header (word followed by colon, nothing after)
    if (/^[a-zA-Z_]+:$/.test(trimmed)) {
      currentSection = trimmed.slice(0, -1).toLowerCase();
      result[currentSection] = {};
      continue;
    }

    // Check for key: value
    const match = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*)$/);
    if (match) {
      const [, key, value] = match;
      const target = currentSection ? result[currentSection] : result;

      // Parse value
      if (value === 'yes' || value === 'true') {
        target[key] = true;
      } else if (value === 'no' || value === 'false') {
        target[key] = false;
      } else if (/^[0-9]+$/.test(value)) {
        target[key] = parseInt(value, 10);
      } else if (value.includes(',')) {
        target[key] = value.split(',').map(v => v.trim());
      } else {
        target[key] = value;
      }
    }
  }

  return result;
}

/**
 * Validate a parsed object against its schema
 */
function validate(obj, type) {
  const validator = type === 'flow' ? validateFlow : validateTool;
  const valid = validator(obj);

  if (!valid) {
    return {
      valid: false,
      errors: validator.errors.map(err => ({
        path: err.instancePath || '/',
        message: err.message,
        params: err.params
      }))
    };
  }

  return { valid: true, errors: [] };
}

/**
 * Detect file type from extension or content
 */
function detectType(filePath, obj) {
  const ext = path.extname(filePath);
  if (ext === '.flow') return 'flow';
  if (ext === '.tool') return 'tool';
  if (ext === '.l7') {
    // Legacy format - detect from content
    if (obj.steps) return 'flow';
    if (obj.server || obj.does) return 'tool';
    return 'tool'; // Default for legacy
  }
  return null;
}

/**
 * List all files of a given type
 */
function listFiles(type) {
  const ext = type === 'flow' ? '.flow' : '.tool';
  const dir = path.join(L7_DIR, type === 'flow' ? 'flows' : 'tools');

  if (!fs.existsSync(dir)) {
    // Also check root for legacy .l7 files
    const legacyDir = L7_DIR;
    if (fs.existsSync(legacyDir)) {
      return fs.readdirSync(legacyDir)
        .filter(f => f.endsWith('.l7'))
        .map(f => ({
          name: path.basename(f, '.l7'),
          path: path.join(legacyDir, f),
          legacy: true
        }));
    }
    return [];
  }

  return fs.readdirSync(dir)
    .filter(f => f.endsWith(ext))
    .map(f => ({
      name: path.basename(f, ext),
      path: path.join(dir, f),
      legacy: false
    }));
}

/**
 * Variable interpolation - replace $var and {{ expr }} in strings
 */
function interpolate(template, context) {
  if (typeof template !== 'string') return template;

  // Replace {{ expr }} with evaluated value (for display)
  let result = template.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_, expr) => {
    return evaluateExpr(expr.trim(), context);
  });

  // Replace $var with value
  result = result.replace(/\$([a-zA-Z_][a-zA-Z0-9_.]*)/g, (_, varPath) => {
    return resolveVar(varPath, context);
  });

  return result;
}

/**
 * Resolve a variable path like "people.count" from context
 */
function resolveVar(varPath, context) {
  const parts = varPath.split('.');
  let value = context;

  for (const part of parts) {
    if (value == null) return '';
    value = value[part];
  }

  return value ?? '';
}

/**
 * Evaluate a simple expression (for {{ }} templates)
 */
function evaluateExpr(expr, context) {
  // Handle $var syntax (e.g., $item.consent)
  if (expr.startsWith('$')) {
    const varPath = expr.slice(1);
    return resolveVar(varPath, context);
  }

  // Handle simple property access
  if (/^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(expr)) {
    return resolveVar(expr, context);
  }

  // Handle comparison: "value > 0"
  const comparison = expr.match(/^([a-zA-Z_][a-zA-Z0-9_.]*)\s*(>|<|>=|<=|==|!=)\s*(.+)$/);
  if (comparison) {
    const [, varPath, op, right] = comparison;
    const left = resolveVar(varPath, context);
    const rightVal = isNaN(right) ? right : Number(right);

    switch (op) {
      case '>': return left > rightVal;
      case '<': return left < rightVal;
      case '>=': return left >= rightVal;
      case '<=': return left <= rightVal;
      case '==': return left == rightVal;
      case '!=': return left != rightVal;
    }
  }

  // Handle "not X" or "not $X"
  if (expr.startsWith('not ')) {
    let varPath = expr.slice(4).trim();
    if (varPath.startsWith('$')) {
      varPath = varPath.slice(1);
    }
    return !resolveVar(varPath, context);
  }

  return expr;
}

/**
 * Check if a condition is truthy
 */
function evaluateCondition(condition, context) {
  if (!condition) return true;

  const result = evaluateExpr(condition, context);
  return Boolean(result);
}

// CLI interface
function main() {
  const [,, command, arg] = process.argv;

  if (!command) {
    console.log('Usage:');
    console.log('  node parser.js validate <file>  - Validate a .flow or .tool file');
    console.log('  node parser.js parse <file>     - Parse and output JSON');
    console.log('  node parser.js list tools       - List all tools');
    console.log('  node parser.js list flows       - List all flows');
    process.exit(0);
  }

  switch (command) {
    case 'validate': {
      if (!arg) {
        console.error('Error: No file specified');
        process.exit(1);
      }
      const filePath = path.resolve(arg);
      const obj = parseFile(filePath);
      const type = detectType(filePath, obj);
      const result = validate(obj, type);

      if (result.valid) {
        console.log(`✓ Valid ${type}: ${path.basename(filePath)}`);
      } else {
        console.log(`✗ Invalid ${type}: ${path.basename(filePath)}`);
        for (const err of result.errors) {
          console.log(`  - ${err.path}: ${err.message}`);
        }
        process.exit(1);
      }
      break;
    }

    case 'parse': {
      if (!arg) {
        console.error('Error: No file specified');
        process.exit(1);
      }
      const filePath = path.resolve(arg);
      const obj = parseFile(filePath);
      console.log(JSON.stringify(obj, null, 2));
      break;
    }

    case 'list': {
      const type = arg === 'flows' ? 'flow' : 'tool';
      const files = listFiles(type);

      if (files.length === 0) {
        console.log(`No ${type}s found`);
      } else {
        console.log(`${files.length} ${type}(s):`);
        for (const f of files) {
          const badge = f.legacy ? ' (legacy)' : '';
          console.log(`  - ${f.name}${badge}`);
        }
      }
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      process.exit(1);
  }
}

// Export for use as module
module.exports = {
  parseFile,
  parseLegacyL7,
  validate,
  detectType,
  listFiles,
  interpolate,
  resolveVar,
  evaluateExpr,
  evaluateCondition,
  main
};

// Run CLI if called directly
if (require.main === module) {
  main();
}

// L7:PROVENANCE
// Creator: Alberto Valido Delgado | System: L7 WAY | License: Proprietary — Framework free, products licensed (Law XXII)
// File: lib/parser.js | Body-Hash: SHA-256:76fe6a77bfc2f2a3caa18b621472b31eb36b4be0d4df10c5afc38b8ccc88a69d
// Chain-Hash: SHA-256:9b65f6d213fe3857c0835a39605ef7025e732ec2fa48ac5f47bb2cca4fe8600c | Signed: 2026-03-01T15:09:50.021194+00:00
// This work is the intellectual property of Alberto Valido Delgado.
// Chain: 27 works. Verify: python3 provenance.py verify lib/parser.js
// L7:PROVENANCE
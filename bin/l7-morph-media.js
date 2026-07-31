#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { createMorphicPlan } = require('../lib/morphic-media');

function usage() {
  process.stderr.write('Usage: l7-morph-media <request.json | ->\n');
}

try {
  const source = process.argv[2];
  if (!source) {
    usage();
    process.exitCode = 2;
  } else {
    const raw = source === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(source, 'utf8');
    process.stdout.write(`${JSON.stringify(createMorphicPlan(JSON.parse(raw)), null, 2)}\n`);
  }
} catch (error) {
  process.stderr.write(`l7-morph-media: ${error.message}\n`);
  process.exitCode = 1;
}


// L7:PROVENANCE
// Creator: Alberto Valido Delgado | System: L7 WAY | License: Proprietary — Framework free, products licensed (Law XXII)
// File: bin/l7-morph-media.js | Body-Hash: SHA-256:2083556c879efe4ee388831f6b1be25ecfe264ecb0aa998eef2834a4fb75ca68
// Chain-Hash: SHA-256:8075790245d9a402616d4c7fbfe40f9bb1a667023f827e7c6637fbe4cce352a6 | Signed: 2026-07-20T00:35:48.366906+00:00
// This work is the intellectual property of Alberto Valido Delgado.
// Chain: 48 works. Verify: python3 provenance.py verify bin/l7-morph-media.js
// L7:PROVENANCE
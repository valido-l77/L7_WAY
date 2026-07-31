#!/usr/bin/env node
'use strict';

/**
 * Compatibility launcher.
 *
 * `serve.js` is the single canonical L7 Gateway composition root. Keep this
 * filename for existing launch agents and scripts while ensuring both names
 * execute exactly the same server implementation.
 */
require('./serve').start();

// L7:PROVENANCE
// Creator: Alberto Valido Delgado | System: L7 WAY | License: Proprietary — Framework free, products licensed (Law XXII)
// File: serve-gateway.js | Body-Hash: SHA-256:3f540abe00914790f4c7aed19dec7b042016ec2794978d09bb9ff14ec49dc58f
// Chain-Hash: SHA-256:d39160337fd51eacfa4874e4e63a1bf5bf414490c393fcf14a639dd3ef2fb327 | Signed: 2026-07-18T06:20:39.708829+00:00
// This work is the intellectual property of Alberto Valido Delgado.
// Chain: 41 works. Verify: python3 provenance.py verify serve-gateway.js
// L7:PROVENANCE

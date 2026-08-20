'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const LANDING = path.join(__dirname, '..', 'src', 'l7-way-landing.html');

test('L7 offers use the public Studio and Team calls to action', () => {
  const html = fs.readFileSync(LANDING, 'utf8');
  const campaign = html.match(
    /<article class="plan-card campaign">([\s\S]*?)<\/article>/,
  );
  const team = html.match(
    /<article class="plan-card team">([\s\S]*?)<\/article>/,
  );

  assert.ok(campaign, 'expected Campaign plan card');
  assert.match(campaign[1], /href="\/studio">Open Studio</);
  assert.ok(team, 'expected Team plan card');
  assert.match(team[1], />Talk to us</);
  assert.doesNotMatch(team[1], /View API/);
  assert.doesNotMatch(html, /Start in Studio/);
});

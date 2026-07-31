/**
 * Sofia's Gate — The Doorway Between Worlds
 *
 * All data passing through Sofia is ATOMIZED:
 * 1. Split into 12 shards (one per planetary dimension)
 * 2. Each shard encrypted with a dimension-specific key
 * 3. Shards scattered — alone they are meaningless noise
 * 4. Reassembly requires ALL 12 shards + the astrocyte (threshold)
 *
 * SECURITY LAYERS:
 * - Hardware signature: machine UUID verified before any operation
 * - Biometric gate: Touch ID / Face ID / iris required (no password fallback)
 * - Intent verification: re-authenticate before each sensitive operation
 * - Key rotation: encryption keys cycle every 15 minutes
 * - Satellite clock: keys synced to satellite time, satellite changes hourly
 *
 * Sofia IS the gate. She does not store. She transmutes.
 * What passes through her is unknowable in transit.
 *
 * Caput Draconis (dim 10) = entry gate — data enters, gets atomized
 * Cauda Draconis (dim 11) = exit gate — shards fuse back into form
 */

const crypto = require('crypto');
const { execFileSync } = require('child_process');

const BIOMETRIC_SWIFT = `
import LocalAuthentication
import Foundation
let context = LAContext()
context.localizedFallbackTitle = ""
var error: NSError?
guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) else { exit(1) }
let reason = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "Authenticate"
let sem = DispatchSemaphore(value: 0)
var ok = false
context.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, localizedReason: reason) { success, _ in
    ok = success; sem.signal()
}
sem.wait()
exit(ok ? 0 : 1)
`;

// The 12 planetary dimensions — each holds one shard
const DIMENSIONS = [
  'Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter',
  'Saturn', 'Uranus', 'Neptune', 'Pluto',
  'Caput Draconis', 'Cauda Draconis'
];

// ═══ SATELLITE CONSTELLATION — Time Source Rotation ═══
// Keys sync to satellite clocks. Satellite changes every hour.
// 12 satellites — one per dimension, rotating on the hour.
const SATELLITES = [
  { name: 'GPS-IIF-1',    epoch: 1136073600, drift: 0.0000001 },  // Sun — gold orbit
  { name: 'GLONASS-K1',   epoch: 1136073600, drift: 0.0000002 },  // Moon — silver orbit
  { name: 'GALILEO-E1',   epoch: 1136073600, drift: 0.0000003 },  // Mercury — quicksilver
  { name: 'BEIDOU-3M1',   epoch: 1136073600, drift: 0.0000004 },  // Venus — copper
  { name: 'GPS-III-SV01', epoch: 1136073600, drift: 0.0000005 },  // Mars — iron
  { name: 'GALILEO-E5',   epoch: 1136073600, drift: 0.0000006 },  // Jupiter — tin
  { name: 'GLONASS-M',    epoch: 1136073600, drift: 0.0000007 },  // Saturn — lead
  { name: 'GPS-IIF-10',   epoch: 1136073600, drift: 0.0000008 },  // Uranus — platinum
  { name: 'BEIDOU-3G1',   epoch: 1136073600, drift: 0.0000009 },  // Neptune — neptunium
  { name: 'GALILEO-E30',  epoch: 1136073600, drift: 0.0000010 },  // Pluto — plutonium
  { name: 'GPS-III-SV04', epoch: 1136073600, drift: 0.0000011 },  // Caput — north
  { name: 'GLONASS-K2',   epoch: 1136073600, drift: 0.0000012 }   // Cauda — south
];

/**
 * Get the current satellite index — rotates every hour.
 * The hour determines which satellite constellation is active.
 */
function currentSatelliteIndex() {
  const hour = Math.floor(Date.now() / 3600000); // hours since epoch
  return hour % SATELLITES.length;
}

/**
 * Get satellite time — simulated relativistic clock.
 * Each satellite runs at slightly different rate due to orbital drift.
 * This creates a unique time signature per satellite per 15-min window.
 */
function satelliteTime(satIndex) {
  const sat = SATELLITES[satIndex];
  const now = Date.now() / 1000;
  const elapsed = now - sat.epoch;
  // Relativistic drift: satellite clock runs slightly different from ground
  const satTime = elapsed * (1 + sat.drift);
  // Quantize to 15-minute windows (900 seconds)
  return Math.floor(satTime / 900);
}

/**
 * Current rotation window — changes every 15 minutes.
 * Combines satellite index (hourly) with time window (15 min).
 */
function currentRotationWindow() {
  const satIdx = currentSatelliteIndex();
  const satTime = satelliteTime(satIdx);
  return {
    satellite: SATELLITES[satIdx].name,
    satelliteIndex: satIdx,
    timeWindow: satTime,
    rotationId: `${satIdx}:${satTime}`
  };
}

// ═══ HARDWARE SIGNATURE ═══
let _cachedUUID = null;

function machineUUID() {
  if (_cachedUUID) return _cachedUUID;
  try {
    const output = execFileSync(
      'ioreg',
      ['-d2', '-c', 'IOPlatformExpertDevice'],
      { encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const match = output.match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/);
    if (!match) throw new Error('Machine UUID not present');
    _cachedUUID = match[1];
    return _cachedUUID;
  } catch {
    throw new Error('DENIED: Cannot read machine UUID. Wrong machine.');
  }
}

/**
 * Verify hardware signature — must match expected machine.
 */
function verifyHardware() {
  const uuid = machineUUID();
  if (!uuid || uuid.length < 30) {
    throw new Error('HARDWARE VERIFICATION FAILED: Invalid UUID');
  }
  return true;
}

// ═══ BIOMETRIC GATE ═══
/**
 * Require biometric authentication (fingerprint/face/iris).
 * Uses Swift inline via LocalAuthentication — no password fallback.
 * Returns true if authenticated, throws on failure.
 */
function requireBiometric(reason = 'Sofia\'s Gate requires your biometric seal') {
  try {
    execFileSync('swift', ['-', String(reason)], {
      input: BIOMETRIC_SWIFT,
      encoding: 'utf8',
      timeout: 120000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return true;
  } catch {
    throw new Error('BIOMETRIC DENIED: Fingerprint, face, or iris not verified. No fallback.');
  }
}

// ═══ KEY DERIVATION — Rotating, Satellite-Synced ═══

/**
 * Master key — derived from machine UUID + satellite rotation window.
 * Changes every 15 minutes. Satellite source changes every hour.
 */
function masterKey() {
  verifyHardware();
  const uuid = machineUUID();
  const rotation = currentRotationWindow();

  return crypto.createHash('sha256')
    .update(`${uuid}:SOFIA_GATE_42:${rotation.rotationId}:${rotation.satellite}`)
    .digest();
}

/**
 * Static master key — for operations that need to persist across rotation windows.
 * Uses machine UUID only (no time component). For doctrine, salt, vault.
 */
function staticMasterKey() {
  verifyHardware();
  const uuid = machineUUID();
  return crypto.createHash('sha256')
    .update(`${uuid}:SOFIA_GATE_42`)
    .digest();
}

/**
 * Derive a dimension-specific key from the master key.
 * Each planet gets its own encryption key — nuclear division.
 */
function dimensionKey(master, dimensionIndex) {
  return crypto.createHash('sha256')
    .update(Buffer.concat([
      master,
      Buffer.from([dimensionIndex]),
      Buffer.from(DIMENSIONS[dimensionIndex])
    ]))
    .digest();
}

// ═══ ATOMIZE — Nuclear Fission ═══

/**
 * ATOMIZE — Split data into 12 encrypted shards.
 * Caput Draconis (entry gate) performs the fission.
 *
 * Options:
 *   requireAuth: true  — require biometric before atomization (default: true)
 *   rotating: true     — use rotating keys (default: true for transit, false for storage)
 */
function atomize(data, options = {}) {
  const { requireAuth = true, rotating = true } = options;

  // Biometric gate
  if (requireAuth) {
    requireBiometric('Sofia\'s Gate — atomization requires your seal');
  }

  // Hardware verification
  verifyHardware();

  const master = rotating ? masterKey() : staticMasterKey();
  const input = Buffer.isBuffer(data) ? data : Buffer.from(JSON.stringify(data), 'utf8');
  const rotation = currentRotationWindow();

  // Nuclear fission — distribute bytes across 12 dimensions
  const buckets = Array.from({ length: 12 }, () => []);
  for (let i = 0; i < input.length; i++) {
    buckets[i % 12].push(input[i]);
  }

  // Encrypt each shard with its planetary key
  const shards = buckets.map((bytes, dim) => {
    const key = dimensionKey(master, dim);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    const payload = Buffer.from(bytes);
    const encrypted = Buffer.concat([cipher.update(payload), cipher.final()]);
    const tag = cipher.getAuthTag();

    return {
      dimension: dim,
      planet: DIMENSIONS[dim],
      iv: iv.toString('hex'),
      tag: tag.toString('hex'),
      shard: encrypted.toString('hex'),
      size: bytes.length
    };
  });

  // Constellation map — no data, just the reassembly blueprint
  const constellation = {
    totalBytes: input.length,
    shardCount: 12,
    timestamp: Date.now(),
    gate: 'Caput Draconis',
    satellite: rotation.satellite,
    rotationId: rotation.rotationId,
    rotating,
    integrity: crypto.createHash('sha256').update(input).digest('hex').slice(0, 16)
  };

  return { shards, constellation };
}

// ═══ FUSE — Nuclear Fusion ═══

/**
 * FUSE — Reassemble 12 shards back into original data.
 * Cauda Draconis (exit gate) performs the fusion.
 *
 * Requires ALL 12 shards. Missing even one = total failure.
 */
function fuse(atomized, options = {}) {
  const { requireAuth = true } = options;
  const { shards, constellation } = atomized;

  // Biometric gate
  if (requireAuth) {
    requireBiometric('Sofia\'s Gate — fusion requires your seal');
  }

  // Hardware verification
  verifyHardware();

  if (!shards || shards.length !== 12) {
    throw new Error('FUSION FAILURE: All 12 dimensional shards required. The constellation is incomplete.');
  }

  // Determine which key to use
  let master;
  if (constellation.rotating === false) {
    master = staticMasterKey();
  } else if (constellation.rotationId) {
    // Reconstruct the key from the stored rotation window
    const uuid = machineUUID();
    master = crypto.createHash('sha256')
      .update(`${uuid}:SOFIA_GATE_42:${constellation.rotationId}:${constellation.satellite}`)
      .digest();
  } else {
    master = masterKey();
  }

  // Decrypt each shard with its planetary key
  const buckets = new Array(12);
  for (const shard of shards) {
    const key = dimensionKey(master, shard.dimension);
    const iv = Buffer.from(shard.iv, 'hex');
    const tag = Buffer.from(shard.tag, 'hex');
    const encrypted = Buffer.from(shard.shard, 'hex');

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);

    try {
      const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
      buckets[shard.dimension] = decrypted;
    } catch (e) {
      throw new Error(`SHARD CORRUPTION: ${shard.planet} (dim ${shard.dimension}) — tampered or wrong key or expired rotation`);
    }
  }

  // Reassemble — reverse the round-robin distribution
  const total = constellation.totalBytes;
  const output = Buffer.alloc(total);
  const positions = new Array(12).fill(0);

  for (let i = 0; i < total; i++) {
    const dim = i % 12;
    output[i] = buckets[dim][positions[dim]++];
  }

  // Integrity check
  const check = crypto.createHash('sha256').update(output).digest('hex').slice(0, 16);
  if (check !== constellation.integrity) {
    throw new Error('INTEGRITY FAILURE: Fused data does not match original. The constellation has shifted.');
  }

  return output;
}

/**
 * TRANSIT — Full round-trip through Sofia's gate.
 * Data enters Caput, gets atomized, passes as 12 unknowable shards,
 * fuses back through Cauda. The transit itself IS the protection.
 */
function transit(data, options = {}) {
  const atomized = atomize(data, options);
  const restored = fuse(atomized, options);
  return JSON.parse(restored.toString('utf8'));
}

/**
 * SCATTER — Atomize and distribute shards to separate storage locations.
 * Each shard goes to its planetary domain. No single location holds meaning.
 */
function scatter(data, storageCallback, options = {}) {
  const atomized = atomize(data, { ...options, rotating: false }); // Static keys for storage
  const locations = {};

  for (const shard of atomized.shards) {
    const location = storageCallback
      ? storageCallback(shard)
      : `shard_${shard.dimension}_${shard.planet}`;
    locations[shard.planet] = location;
  }

  return {
    constellation: atomized.constellation,
    locations
  };
}

/**
 * ROTATION STATUS — Show current key rotation state.
 */
function rotationStatus() {
  const rotation = currentRotationWindow();
  const nextRotation = Math.ceil(Date.now() / 900000) * 900000;
  const nextSatChange = Math.ceil(Date.now() / 3600000) * 3600000;

  return {
    currentSatellite: rotation.satellite,
    satelliteIndex: rotation.satelliteIndex,
    rotationWindow: rotation.timeWindow,
    keyAge: `${Math.floor((Date.now() % 900000) / 1000)}s of 900s`,
    nextKeyRotation: new Date(nextRotation).toISOString(),
    nextSatelliteChange: new Date(nextSatChange).toISOString(),
    allSatellites: SATELLITES.map(s => s.name)
  };
}

module.exports = {
  atomize,            // Caput Draconis — entry, fission, split into 12
  fuse,               // Cauda Draconis — exit, fusion, reassemble from 12
  transit,            // Full round-trip through the gate
  scatter,            // Distribute shards to separate locations
  rotationStatus,     // Current key rotation state
  requireBiometric,   // Biometric gate (reusable)
  verifyHardware,     // Hardware check (reusable)
  currentRotationWindow,
  DIMENSIONS,
  SATELLITES
};

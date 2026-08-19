'use strict';

const zlib = require('zlib');

function crc32(buffer) {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  if (typeof zlib.crc32 === 'function') return zlib.crc32(bytes) >>> 0;
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      const take = crc & 1;
      crc >>>= 1;
      if (take) crc ^= 0xedb88320;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function safeZipName(name) {
  const cleaned = String(name || 'file')
    .replace(/\\/g, '/')
    .split('/')
    .filter(part => part && part !== '.' && part !== '..')
    .join('/');
  return cleaned.slice(0, 180) || 'file';
}

function dosDateTime(date = new Date()) {
  const year = Math.max(date.getFullYear(), 1980);
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { dosTime, dosDate };
}

function u16(value) {
  const buf = Buffer.alloc(2);
  buf.writeUInt16LE(value >>> 0, 0);
  return buf;
}

function u32(value) {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(value >>> 0, 0);
  return buf;
}

function buildStoreZip(files, options = {}) {
  const now = options.date || new Date();
  const { dosTime, dosDate } = dosDateTime(now);
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const file of files || []) {
    const name = safeZipName(file.name);
    const nameBytes = Buffer.from(name, 'utf8');
    const data = Buffer.isBuffer(file.bytes) ? file.bytes : Buffer.from(file.bytes || '');
    const checksum = crc32(data);
    const local = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      u16(20),
      u16(0),
      u16(0),
      u16(dosTime),
      u16(dosDate),
      u32(checksum),
      u32(data.length),
      u32(data.length),
      u16(nameBytes.length),
      u16(0),
      nameBytes,
      data,
    ]);
    const central = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x01, 0x02]),
      u16(20),
      u16(20),
      u16(0),
      u16(0),
      u16(dosTime),
      u16(dosDate),
      u32(checksum),
      u32(data.length),
      u32(data.length),
      u16(nameBytes.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      nameBytes,
    ]);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }

  const centralDir = Buffer.concat(centrals);
  const end = Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x05, 0x06]),
    u16(0),
    u16(0),
    u16(centrals.length),
    u16(centrals.length),
    u32(centralDir.length),
    u32(offset),
    u16(0),
  ]);
  return Buffer.concat([...locals, centralDir, end]);
}

function workspaceShortId(workspaceId) {
  return String(workspaceId || 'local')
    .replace(/^workspace:/i, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 12)
    .toLowerCase() || 'local';
}

function packFilename(workspaceId, index, extension) {
  const short = workspaceShortId(workspaceId);
  const n = String(Number(index) || 1).padStart(2, '0');
  const ext = String(extension || 'bin').replace(/[^a-z0-9]/gi, '') || 'bin';
  return `campaign-${short}-draft-${n}.${ext}`;
}

module.exports = {
  crc32,
  buildStoreZip,
  workspaceShortId,
  packFilename,
};

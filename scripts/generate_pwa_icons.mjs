#!/usr/bin/env node
/* Generates the PWA icon set for Labour Manager as PNGs — no dependencies.
 *
 *   client/public/icons/icon-192.png           (any purpose)
 *   client/public/icons/icon-512.png           (any purpose)
 *   client/public/icons/icon-maskable-192.png  (maskable — full-bleed, safe-zone content)
 *   client/public/icons/icon-maskable-512.png  (maskable — full-bleed, safe-zone content)
 *
 * Design: indigo rounded tile (white hard hat mark) for "any"; a full-square
 * indigo field with the mark shrunk into the Android safe zone for "maskable".
 * Edges are antialiased with 2x2 supersampling.
 */
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'client', 'public', 'icons');
fs.mkdirSync(outDir, { recursive: true });

/* ---------------- minimal PNG encoder (RGBA, 8-bit, filter 0) ---------------- */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
};
const encodePNG = (width, height, rgba) => {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // colour type: RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
};

/* ---------------- hard-hat mark ---------------- */
const BG = [79, 70, 229];   // indigo #4f46e5
const FG = [255, 255, 255]; // white

// signed distance of a rounded square (half-size h, corner radius r) centred at origin
const inRoundedSquare = (x, y, h, r) => {
  const qx = Math.abs(x) - (h - r);
  const qy = Math.abs(y) - (h - r);
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) <= 0;
};

// white hard hat: dome (upper half-disc) sitting on a brim bar, with a small
// centre ridge on top — design space 512, centred at (256, 246)
const inHat = (x, y, domeR, brimY1, brimY2, brimHalf) => {
  const dx = x - 256;
  const dy = y - 246;
  if (dx * dx + dy * dy <= domeR * domeR && dy <= 0) return true; // dome
  // centre ridge on top of the dome
  const ridgeHalf = domeR * 0.14;
  const ridgeTop = 246 - domeR - domeR * 0.2;
  if (Math.abs(dx) <= ridgeHalf && y >= ridgeTop && y <= 246 - domeR + domeR * 0.05) return true;
  // brim bar the dome sits on
  if (dy >= brimY1 - 246 && dy <= brimY2 - 246 && Math.abs(dx) <= brimHalf) return true;
  return false;
};

function draw(size, { maskable = false } = {}) {
  const px = Buffer.alloc(size * size * 4);
  const scale = 512 / size;
  const half = 256;
  const corner = 82 * (size / 512);
  // maskable content shrinks into the safe zone (centre circle r ~ 204/512)
  const domeR = (maskable ? 96 : 124) * (size / 512);
  const brimY1 = 246 * (size / 512);
  const brimY2 = brimY1 + (maskable ? 34 : 50) * (size / 512);
  const brimHalf = (maskable ? 150 : 182) * (size / 512);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let fg = 0, bg = 0;
      for (const [sx, sy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
        const dx = (x + sx) * scale, dy = (y + sy) * scale; // design coords (0..512)
        const hat = inHat(dx, dy, domeR, brimY1, brimY2, brimHalf);
        const field = maskable || inRoundedSquare(dx - half, dy - half, half, corner);
        if (hat) fg++;
        else if (field) bg++;
      }
      const i = (y * size + x) * 4;
      const total = fg + bg;
      if (total === 0) {
        px[i] = px[i + 1] = px[i + 2] = px[i + 3] = 0; // transparent corner (any variant)
      } else {
        px[i]     = Math.round((FG[0] * fg + BG[0] * bg) / total);
        px[i + 1] = Math.round((FG[1] * fg + BG[1] * bg) / total);
        px[i + 2] = Math.round((FG[2] * fg + BG[2] * bg) / total);
        px[i + 3] = 255;
      }
    }
  }
  return encodePNG(size, size, px);
}

for (const [name, opts] of [
  ['icon-192.png', { size: 192 }],
  ['icon-512.png', { size: 512 }],
  ['icon-maskable-192.png', { size: 192, maskable: true }],
  ['icon-maskable-512.png', { size: 512, maskable: true }],
]) {
  const png = draw(opts.size, opts);
  fs.writeFileSync(path.join(outDir, name), png);
  console.log(`wrote client/public/icons/${name} (${png.length} bytes)`);
}

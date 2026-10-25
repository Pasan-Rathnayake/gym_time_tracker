// Generates the PWA PNG icons into public/ with no dependencies.
// Run with: npm run icons
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const ORANGE = [232, 90, 16];
const DARK = [18, 19, 22];
const LIGHT = [241, 239, 234];

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

function png(size, draw) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b] = draw(x / size, y / size);
      const i = y * (size * 3 + 1) + 1 + x * 3;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** A dumbbell on a dark tile, scaled by `s` (1 = full bleed, smaller for maskable safe zone). */
function icon(s, rounded) {
  const rects = [
    [0.18, 0.34, 0.27, 0.66], // left outer plate
    [0.28, 0.27, 0.37, 0.73], // left inner plate
    [0.37, 0.46, 0.63, 0.54], // bar
    [0.63, 0.27, 0.72, 0.73], // right inner plate
    [0.73, 0.34, 0.82, 0.66], // right outer plate
  ];
  return (u, v) => {
    if (rounded) {
      const r = 0.2;
      const cx = Math.min(Math.max(u, r), 1 - r);
      const cy = Math.min(Math.max(v, r), 1 - r);
      if ((u - cx) ** 2 + (v - cy) ** 2 > r * r) return DARK;
    }
    const x = 0.5 + (u - 0.5) / s;
    const y = 0.5 + (v - 0.5) / s;
    for (const [i, [x0, y0, x1, y1]] of rects.entries()) {
      if (x >= x0 && x <= x1 && y >= y0 && y <= y1) return i === 2 ? LIGHT : ORANGE;
    }
    return DARK;
  };
}

writeFileSync('public/pwa-192.png', png(192, icon(1, false)));
writeFileSync('public/pwa-512.png', png(512, icon(1, false)));
writeFileSync('public/pwa-maskable-512.png', png(512, icon(0.72, false)));
writeFileSync('public/apple-touch-icon.png', png(180, icon(0.85, false)));
console.log('icons written to public/');

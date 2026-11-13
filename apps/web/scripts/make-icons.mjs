// Renders the app icons from the artwork in apps/web/icon-art/storytell-icon.png. Run after
// replacing the artwork:
//   node apps/web/scripts/make-icons.mjs
//
// The artwork comes as a rounded square on black corners, with a light rim. A phone rounds an
// icon itself, so the icons are full-bleed: the artwork's inside, cut out with a soft-edged
// rounded square inset past the rim, on its own background colour to the edges.
// - icon-192, icon-512, apple-touch-icon (180), favicon-32: that full-bleed square.
// - icon-maskable-512: the same, shrunk so everything sits inside the centre circle (80%) that
//   Android may crop to, on the background colour.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const webDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const art = path.join(webDir, 'icon-art', 'storytell-icon.png');
const iconsDir = path.join(webDir, 'public', 'icons');

/** The artwork's background just inside its rim, sampled from it. */
const BACKGROUND = '#180e2c';
/** How far in from the artwork's edge the cut runs (past the rim), its corner radius, and its softness, as parts of the side. */
const INSET = 0.025;
const RADIUS = 0.25;
const FEATHER = 0.012;
/** The maskable icon's artwork scale: its farthest point (the quill's tip) then lands inside the 80% circle. */
const MASKABLE_SCALE = 0.74;

const { width: side } = await sharp(art).metadata();
const inset = Math.round(side * INSET);
const inner = side - 2 * inset;
const radius = Math.round(side * RADIUS);
// The cut: a white rounded square, soft at the edge, on nothing; it keeps the artwork only where it is white.
const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${side}" height="${side}">` +
        `<filter id="soft"><feGaussianBlur stdDeviation="${side * FEATHER}"/></filter>` +
        `<rect x="${inset}" y="${inset}" width="${inner}" height="${inner}" rx="${radius}" fill="#fff" filter="url(#soft)"/></svg>`,
);
const cut = await sharp(art)
    .ensureAlpha()
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();
const plain = (size) => sharp({ create: { width: size, height: size, channels: 4, background: BACKGROUND } });
const fullBleed = await plain(side).composite([{ input: cut }]).png().toBuffer();

// A 256-colour palette, finely dithered: a fifth of the size (512px: 475 KB to ~85 KB), the same to the eye.
const write = (buffer, size, name) =>
    sharp(buffer).resize(size, size).png({ palette: true, quality: 100, effort: 10, dither: 1 }).toFile(path.join(iconsDir, name));
await write(fullBleed, 512, 'icon-512.png');
await write(fullBleed, 192, 'icon-192.png');
await write(fullBleed, 180, 'apple-touch-icon.png');
await write(fullBleed, 32, 'favicon-32.png');

const shrunk = Math.round(side * MASKABLE_SCALE);
const maskable = await plain(side)
    .composite([{ input: await sharp(fullBleed).resize(shrunk, shrunk).toBuffer(), gravity: 'centre' }])
    .png()
    .toBuffer();
await write(maskable, 512, 'icon-maskable-512.png');

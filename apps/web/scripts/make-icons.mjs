// Renders the PWA icons from public/icons/icon.svg. Run after editing the SVG:
//   node apps/web/scripts/make-icons.mjs
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const iconsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
const svg = path.join(iconsDir, 'icon.svg');

// The art is full-bleed with the book inside the centre 80%, so icon-512 also serves as the
// maskable icon (see app/manifest.ts).
for (const size of [192, 512]) {
    await sharp(svg).resize(size, size).png().toFile(path.join(iconsDir, `icon-${size}.png`));
}
await sharp(svg).resize(180, 180).png().toFile(path.join(iconsDir, 'apple-touch-icon.png'));

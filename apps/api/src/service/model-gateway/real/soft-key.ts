/**
 * The soft cut-out (.scratch/soft-cutout/spec.md): for a picture drawn on one flat, tinted colour that
 * the figure itself does not use. The figure's shape is read from the colour alone, with no model, and
 * each pixel along its edge is unmixed into figure colour and background colour. The edge comes out
 * smooth, fine fur is kept, and none of the background's tint is left on it.
 */

/** The share of the picture's outer ring that must be one colour for the background to count as flat. */
const FLAT_SHARE = 0.9;
const FLAT_REACH = 14;
/**
 * How far apart the background's strongest and weakest channel must be. A white, grey or black
 * background has no tint to tell it from white fur, grey shading or a black outline.
 */
const LEAST_TINT = 24;
/** The picture width the pixel distances below were measured on; a wider picture scales them. */
const MEASURED_WIDTH = 832;

export interface Picture {
    /** The picture's colours, three bytes a pixel. */
    rgb: Buffer;
    width: number;
    height: number;
}

/**
 * The picture as a cut-out: four bytes a pixel, see-through where the background was. Answers
 * `null` where the background is not one flat, tinted colour: there is nothing to key on.
 */
export function softCutout({ rgb, width, height }: Picture): Buffer | null {
    const count = width * height;
    const bg = keyColour({ rgb, width, height });
    if (!bg) return null;
    const off = (pixel: number) => Math.max(Math.abs(rgb[pixel * 3] - bg[0]), Math.abs(rgb[pixel * 3 + 1] - bg[1]), Math.abs(rgb[pixel * 3 + 2] - bg[2]));
    const neutral = Math.max(...bg) - Math.min(...bg);
    return keyed({ rgb, width, height }, bg, off, neutral, count);
}

/**
 * The background colour a soft cut-out keys on: the median of the picture's outer ring, where nine
 * tenths of the ring is that colour and it is tinted. `null` otherwise: the picture is not fit.
 */
export function keyColour({ rgb, width, height }: Picture): number[] | null {
    const margin = Math.max(2, Math.round(Math.min(width, height) * 0.015));
    const ring: number[] = [];
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (x < margin || y < margin || x >= width - margin || y >= height - margin) ring.push(y * width + x);
        }
    }
    const median = (channel: number) => {
        const values = ring.map((pixel) => rgb[pixel * 3 + channel]).sort((a, b) => a - b);
        return values[values.length >> 1];
    };
    const bg = [median(0), median(1), median(2)];
    const off = (pixel: number) => Math.max(Math.abs(rgb[pixel * 3] - bg[0]), Math.abs(rgb[pixel * 3 + 1] - bg[1]), Math.abs(rgb[pixel * 3 + 2] - bg[2]));
    const flat = ring.filter((pixel) => off(pixel) <= FLAT_REACH).length / ring.length >= FLAT_SHARE;
    const neutral = Math.max(...bg) - Math.min(...bg);
    return flat && neutral >= LEAST_TINT ? bg : null;
}

function keyed({ rgb, width, height }: Picture, bg: number[], off: (pixel: number) => number, neutral: number, count: number): Buffer {
    const scale = Math.max(1, Math.min(3, Math.round(width / MEASURED_WIDTH)));
    /** Pixels in from the rough edge that are surely figure, and out from it where fine fur may still be. */
    const inside = 4 * scale;
    const outside = 7 * scale;
    // How far a pixel may be from the background colour and still spread the background. It stays below the
    // distance of the nearest neutral grey, or the spread leaks along the grey line where white turns black.
    const reach = Math.max(8, Math.min(30, Math.floor(neutral / 2) - 4));

    const neighbours = (pixel: number) => {
        const x = pixel % width;
        return [x > 0 ? pixel - 1 : -1, x < width - 1 ? pixel + 1 : -1, pixel - width, pixel + width];
    };
    const queue = new Int32Array(count);
    let head = 0;
    let tail = 0;

    // The rough shape: everything but the background colour reached from the border, and but any pixel
    // almost exactly that colour (a closed gap).
    const solid = new Uint8Array(count).fill(1);
    for (let pixel = 0; pixel < count; pixel++) {
        const x = pixel % width;
        const y = (pixel / width) | 0;
        if ((x === 0 || y === 0 || x === width - 1 || y === height - 1) && off(pixel) <= reach) {
            solid[pixel] = 0;
            queue[tail++] = pixel;
        }
    }
    while (head < tail) {
        const pixel = queue[head++];
        for (const next of neighbours(pixel)) {
            if (next < 0 || next >= count || !solid[next] || off(next) > reach) continue;
            solid[next] = 0;
            queue[tail++] = next;
        }
    }
    const sure = Math.min(12, reach - 4);
    for (let pixel = 0; pixel < count; pixel++) if (solid[pixel] && off(pixel) <= sure) solid[pixel] = 0;

    // The background's own tint: its colour with the grey taken out. A pixel that carries the same tint is
    // background seen through a gap or mixed into an edge; a grey, white or black pixel never carries it.
    const bgMean = (bg[0] + bg[1] + bg[2]) / 3;
    const tint = bg.map((value) => value - bgMean);
    const tintLength = Math.hypot(tint[0], tint[1], tint[2]) || 1;
    const tintUnit = tint.map((value) => value / tintLength);
    /** How much of the background's tint a colour carries, and whether its own tint points the same way. */
    const tintOf = (red: number, green: number, blue: number) => {
        const mean = (red + green + blue) / 3;
        const along = (red - mean) * tintUnit[0] + (green - mean) * tintUnit[1] + (blue - mean) * tintUnit[2];
        const length = Math.hypot(red - mean, green - mean, blue - mean);
        return { along, same: length >= 10 && along / length > 0.9 };
    };
    // Background in a closed gap, a little darker or lighter than the flat colour. It carries most of the
    // tint's strength, or half of it while no brighter than the background (the background in shadow):
    // a pale strand of shaded hair carries about half the tint and is much brighter, so it stays.
    const strongTint = (pixel: number) => {
        if (off(pixel) > 45) return false;
        const red = rgb[pixel * 3];
        const green = rgb[pixel * 3 + 1];
        const blue = rgb[pixel * 3 + 2];
        const own = tintOf(red, green, blue);
        if (!own.same) return false;
        if (own.along >= 0.75 * tintLength) return true;
        const brightness = (red + green + blue) / 3;
        return own.along >= 0.5 * tintLength && brightness <= bgMean + 12 && brightness >= bgMean - 40;
    };
    // It must touch background already found: clearing every tinted pixel puts holes through shaded fur.
    head = 0;
    tail = 0;
    for (let pixel = 0; pixel < count; pixel++) if (!solid[pixel]) queue[tail++] = pixel;
    while (head < tail) {
        const pixel = queue[head++];
        for (const next of neighbours(pixel)) {
            if (next < 0 || next >= count || !solid[next] || !strongTint(next)) continue;
            solid[next] = 0;
            queue[tail++] = next;
        }
    }

    // How far each pixel is from the rough shape's edge, inside and outside, as far as the band goes.
    const depth = new Int16Array(count).fill(-1);
    head = 0;
    tail = 0;
    for (let pixel = 0; pixel < count; pixel++) {
        for (const next of neighbours(pixel)) {
            if (next >= 0 && next < count && solid[next] !== solid[pixel]) {
                depth[pixel] = 0;
                queue[tail++] = pixel;
                break;
            }
        }
    }
    const deepest = Math.max(inside, outside);
    while (head < tail) {
        const pixel = queue[head++];
        if (depth[pixel] >= deepest) continue;
        for (const next of neighbours(pixel)) {
            if (next < 0 || next >= count || depth[next] >= 0 || solid[next] !== solid[pixel]) continue;
            depth[next] = depth[pixel] + 1;
            queue[tail++] = next;
        }
    }
    const inBand = (pixel: number) => depth[pixel] >= 0 && (solid[pixel] ? depth[pixel] < inside : depth[pixel] < outside);
    const core = (pixel: number) => solid[pixel] === 1 && !inBand(pixel);

    // The nearest surely-figure colour for every band pixel, spread outward from the core.
    const source = new Int32Array(count).fill(-1);
    head = 0;
    tail = 0;
    for (let pixel = 0; pixel < count; pixel++) {
        if (core(pixel)) {
            source[pixel] = pixel;
            queue[tail++] = pixel;
        }
    }
    while (head < tail) {
        const pixel = queue[head++];
        for (const next of neighbours(pixel)) {
            if (next < 0 || next >= count || source[next] >= 0 || !inBand(next)) continue;
            source[next] = source[pixel];
            queue[tail++] = next;
        }
    }

    const clamp = (value: number) => Math.min(255, Math.max(0, Math.round(value)));
    const out = Buffer.alloc(count * 4);
    for (let pixel = 0; pixel < count; pixel++) {
        let alpha: number;
        const colour = [rgb[pixel * 3], rgb[pixel * 3 + 1], rgb[pixel * 3 + 2]];
        if (core(pixel)) alpha = 1;
        else if (!inBand(pixel) || source[pixel] < 0) alpha = 0;
        else {
            const from = source[pixel];
            const figure = [rgb[from * 3], rgb[from * 3 + 1], rgb[from * 3 + 2]];
            let dot = 0;
            let length = 0;
            for (let channel = 0; channel < 3; channel++) {
                dot += (colour[channel] - bg[channel]) * (figure[channel] - bg[channel]);
                length += (figure[channel] - bg[channel]) ** 2;
            }
            const mixed = length < 900 ? (solid[pixel] ? 1 : 0) : Math.min(1, Math.max(0, dot / length));
            // Off the line between the two colours (an outline, a darker strand): it is drawing, not a mix.
            const offBackground = off(pixel);
            const drawn = offBackground > 45 ? Math.min(1, (offBackground - 20) / 50) : 0;
            alpha = Math.max(mixed, drawn);
            // The background's own colour, or a darker or lighter shade of it, stays see-through: beside
            // black fur its darker shade would otherwise read as a little black and leave a haze.
            if (!solid[pixel] && (offBackground <= reach || strongTint(pixel))) alpha = 0;
            if (alpha < 0.06) alpha = 0;
            // Take the background's share back out of the colour.
            if (alpha > 0.25 && alpha < 1) {
                for (let channel = 0; channel < 3; channel++) colour[channel] = clamp((colour[channel] - (1 - alpha) * bg[channel]) / alpha);
            }
            if (alpha > 0) {
                // What is left of the background's tint comes down to the figure colour's own tint.
                const figureTint = tintOf(figure[0], figure[1], figure[2]).along;
                const spill = tintOf(colour[0], colour[1], colour[2]).along - Math.max(0, figureTint);
                if (spill > 0) for (let channel = 0; channel < 3; channel++) colour[channel] = clamp(colour[channel] - spill * tintUnit[channel]);
                // Taking too much background out turns a pixel the opposite tint: bring it back to no tint
                // at all, or to the figure colour's own if that is already the opposite way.
                const floor = Math.min(0, figureTint);
                const now = tintOf(colour[0], colour[1], colour[2]).along;
                if (now < floor) for (let channel = 0; channel < 3; channel++) colour[channel] = clamp(colour[channel] + (floor - now) * tintUnit[channel]);
            }
        }
        out[pixel * 4] = colour[0];
        out[pixel * 4 + 1] = colour[1];
        out[pixel * 4 + 2] = colour[2];
        out[pixel * 4 + 3] = Math.round(alpha * 255);
    }

    // Pinholes: a see-through spot of a few pixels closed in by the figure is filled with the picture's colour.
    // The whole spot is walked before it is judged, so a large area is never taken for many small ones.
    const pinhole = 12 * scale * scale;
    const walked = new Uint8Array(count);
    for (let pixel = 0; pixel < count; pixel++) {
        if (walked[pixel] || out[pixel * 4 + 3] >= 128) continue;
        let open = false;
        head = 0;
        tail = 0;
        queue[tail++] = pixel;
        walked[pixel] = 1;
        while (head < tail) {
            const member = queue[head++];
            const x = member % width;
            const y = (member / width) | 0;
            if (x === 0 || y === 0 || x === width - 1 || y === height - 1) open = true;
            for (const next of neighbours(member)) {
                if (next < 0 || next >= count || walked[next] || out[next * 4 + 3] >= 128) continue;
                walked[next] = 1;
                queue[tail++] = next;
            }
        }
        if (open || tail > pinhole) continue;
        for (let index = 0; index < tail; index++) {
            const member = queue[index];
            out[member * 4] = rgb[member * 3];
            out[member * 4 + 1] = rgb[member * 3 + 1];
            out[member * 4 + 2] = rgb[member * 3 + 2];
            out[member * 4 + 3] = 255;
        }
    }

    // Stray specks: a visible piece of a few dozen pixels joined to nothing goes.
    const speck = 60 * scale * scale;
    walked.fill(0);
    for (let pixel = 0; pixel < count; pixel++) {
        if (walked[pixel] || out[pixel * 4 + 3] === 0) continue;
        head = 0;
        tail = 0;
        queue[tail++] = pixel;
        walked[pixel] = 1;
        while (head < tail) {
            for (const next of neighbours(queue[head++])) {
                if (next < 0 || next >= count || walked[next] || out[next * 4 + 3] === 0) continue;
                walked[next] = 1;
                queue[tail++] = next;
            }
        }
        if (tail >= speck) continue;
        for (let index = 0; index < tail; index++) out[queue[index] * 4 + 3] = 0;
    }
    return out;
}

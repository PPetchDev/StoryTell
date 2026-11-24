/**
 * A stand-in for the enlargement model: every pixel of a tile becomes four of the same colour.
 * Loaded by the cut-out's own process as a file, so it holds only syntax Node runs as it is.
 */
export default async function doubled(input: Float32Array, width: number, height: number): Promise<Float32Array> {
    const plane = width * height;
    const out = new Float32Array(3 * plane * 4);
    for (let channel = 0; channel < 3; channel++) {
        for (let y = 0; y < height * 2; y++) {
            for (let x = 0; x < width * 2; x++) out[channel * plane * 4 + y * width * 2 + x] = input[channel * plane + (y >> 1) * width + (x >> 1)];
        }
    }
    return out;
}

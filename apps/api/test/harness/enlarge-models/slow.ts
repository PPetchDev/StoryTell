import doubled from './doubled.ts';

/** How long one tile holds its thread. */
export const SLOW_TILE_MS = 2_000;

/**
 * A stand-in that is slow the way the real model is: each tile is worked out in one piece that
 * never lets go of its thread, as onnxruntime's `run` does not.
 */
export default async function slow(input: Float32Array, width: number, height: number): Promise<Float32Array> {
    const until = Date.now() + SLOW_TILE_MS;
    while (Date.now() < until);
    return doubled(input, width, height);
}

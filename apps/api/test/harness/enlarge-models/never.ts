/** A stand-in that must not be reached: any tile given to it is an error. */
export default async function never(): Promise<Float32Array> {
    throw new Error('A tile was enlarged.');
}

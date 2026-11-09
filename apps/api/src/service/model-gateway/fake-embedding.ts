/** How many numbers a fake vector has. Unlike bge-m3's 1,024: nothing may assume the size. */
export const FAKE_EMBEDDING_DIMENSIONS = 512;

/**
 * The words a fake vector is made of: each Latin (or other non-Thai) word of 3 or more
 * letters, lower-cased, and each pair of neighbouring characters in a run of Thai, which has
 * no spaces between words. Each counts once, however often it appears.
 */
export function fakeEmbeddingFeatures(text: string): Set<string> {
    const features = new Set<string>();
    for (const [run] of text.toLowerCase().matchAll(/[฀-๿]+|[\p{L}\p{N}]+/gu)) {
        if (/^[฀-๿]/.test(run)) {
            const chars = [...run];
            if (chars.length === 1) features.add(run);
            for (let at = 0; at + 1 < chars.length; at++) features.add(chars[at] + chars[at + 1]);
        } else if ([...run].length >= 3) {
            features.add(run);
        }
    }
    return features;
}

/**
 * The fake gateway's vector for a text (Spec: Documents, "Fake gateway"): its features hashed
 * into a fixed-size vector and scaled to unit length. The same text always gives the same
 * vector, and texts that share words score high by dot product, so tests can rely on what is
 * retrieved. A text with no features gets the first axis.
 */
export function fakeEmbedding(text: string): number[] {
    const vector = new Array<number>(FAKE_EMBEDDING_DIMENSIONS).fill(0);
    for (const feature of fakeEmbeddingFeatures(text)) vector[fnv1a(feature) % FAKE_EMBEDDING_DIMENSIONS] += 1;
    const length = Math.hypot(...vector);
    if (length === 0) {
        vector[0] = 1;
        return vector;
    }
    return vector.map((value) => value / length);
}

/** FNV-1a over the UTF-16 code units: small, stable and well spread. */
function fnv1a(text: string): number {
    let hash = 0x811c9dc5;
    for (let at = 0; at < text.length; at++) {
        hash ^= text.charCodeAt(at);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
}

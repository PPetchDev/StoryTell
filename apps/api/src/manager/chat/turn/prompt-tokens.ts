/** A rough token count: about four characters per token of English prose. */
export function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
}

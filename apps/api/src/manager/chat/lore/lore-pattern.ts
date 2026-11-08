/**
 * Spec (.scratch/lore-triggers/spec.md: "Matching"): a Lore pattern is the source of a regular
 * expression, without slashes or flags, compiled case-insensitive, Unicode and multi-line, so `^`
 * and `$` match at line ends and `^@Mira:` finds Mira's lines in an AI Message's `@Name:` text.
 */
export const LORE_PATTERN_FLAGS = 'imu';

/** The compiled pattern, or why it does not compile ("Unterminated group"). */
export function compileLorePattern(source: string): RegExp | { reason: string } {
    try {
        return new RegExp(source, LORE_PATTERN_FLAGS);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // V8 says "Invalid regular expression: /(/imu: Unterminated group"; the part after the source is the reason.
        const reason = message.slice(message.lastIndexOf(': ') + 2).trim();
        return { reason: reason || message };
    }
}

/** Patterns as stored: trimmed, blanks dropped. */
export function cleanPatterns(patterns: string[]): string[] {
    return patterns.map((pattern) => pattern.trim()).filter((pattern) => pattern !== '');
}

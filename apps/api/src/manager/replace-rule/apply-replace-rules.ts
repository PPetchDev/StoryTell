/**
 * What a Replace rule does to a text (.scratch/saved-replies-and-replace-rules/spec.md: "Meaning
 * of a rule"). The web keeps a copy of this file's logic (`apps/web/lib/replace-rules.ts`); one
 * table of cases (`test/fixtures/replace-rule-cases.json`) pins both.
 */

/** The parts of a rule that decide what it does. */
export interface ReplaceRuleLogic {
    find: string;
    replace: string;
    regex: boolean;
    ignoreCase: boolean;
}

/** A text longer than this is left unchanged by every rule: a guard, real parts are far shorter. */
export const REPLACE_TEXT_MAX = 20_000;

function escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The rule as one global RegExp and the replacement to hand `String.replace`. A plain rule
 * matches `find` literally and its replacement is taken literally (`$` patterns off, through a
 * function); a regex rule uses JavaScript's replacement patterns (`$1`, `$<name>`, `$&`, `$$`).
 * Throws for a regex that doesn't compile.
 */
export function compileReplaceRule(rule: ReplaceRuleLogic): { pattern: RegExp; replacement: string | (() => string) } {
    const flags = rule.ignoreCase ? 'gi' : 'g';
    if (rule.regex) return { pattern: new RegExp(rule.find, flags), replacement: rule.replace };
    return { pattern: new RegExp(escapeRegExp(rule.find), flags), replacement: () => rule.replace };
}

/** Each rule in order on the output of the one before; a rule that throws is skipped. */
export function applyReplaceRules(text: string, rules: readonly ReplaceRuleLogic[]): string {
    if (text.length > REPLACE_TEXT_MAX) return text;
    let result = text;
    for (const rule of rules) {
        try {
            const { pattern, replacement } = compileReplaceRule(rule);
            result = result.replace(pattern, replacement as string);
        } catch {
            // A rule that throws when run is skipped.
        }
    }
    return result;
}

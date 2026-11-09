import { apiSend } from './api';
import type { Story } from './story';

// Mirrors the API's Replace rule DTOs (apps/api/src/api/replace-rule/dto/replace-rule.response.dto.ts).

/** What a rule does, and where it applies (.scratch/saved-replies-and-replace-rules/spec.md). */
export interface ReplaceRuleFields {
    /** Never trimmed: its spaces are part of the pattern. */
    find: string;
    /** May be empty: what was found is removed. */
    replace: string;
    regex: boolean;
    ignoreCase: boolean;
    /** Applied to AI Messages as shown; what is stored never changes. */
    onAi: boolean;
    /** Applied to my Messages before sending. */
    onMine: boolean;
}

export interface ReplaceRule extends ReplaceRuleFields {
    id: number;
}

/** A rule as the Chat detail lists it, in apply order (app-wide, then the Story's), parked ones left out. */
export type ChatReplaceRule = ReplaceRuleFields;

export interface ReplaceRuleList {
    replaceRules: ReplaceRule[];
}

/** Where a list of rules is saved: each write answers the scope's whole list, in order. */
export interface ReplaceRuleStore {
    add(fields: ReplaceRuleFields): Promise<ReplaceRule[]>;
    update(id: number, fields: Partial<ReplaceRuleFields>): Promise<ReplaceRule[]>;
    remove(id: number): Promise<ReplaceRule[]>;
    reorder(ids: number[]): Promise<ReplaceRule[]>;
}

const list = (answer: ReplaceRuleList) => answer.replaceRules;

/** The app-wide list is read with useApiQuery('/replace-rules'). */
export const appReplaceRules: ReplaceRuleStore = {
    add: (fields) => apiSend<ReplaceRuleList>('POST', '/replace-rules', fields).then(list),
    update: (id, fields) => apiSend<ReplaceRuleList>('PATCH', `/replace-rules/${id}`, fields).then(list),
    remove: (id) => apiSend<ReplaceRuleList>('DELETE', `/replace-rules/${id}`).then(list),
    reorder: (ids) => apiSend<ReplaceRuleList>('PUT', '/replace-rules/order', { ids }).then(list),
};

/** A Story's own: each write answers the whole Story, handed to `onStory` before its rules are taken. */
export function storyReplaceRules(storyId: number, onStory: (story: Story) => void = () => {}): ReplaceRuleStore {
    const rules = (story: Story) => {
        onStory(story);
        return story.replaceRules;
    };
    const base = `/stories/${storyId}/replace-rules`;
    return {
        add: (fields) => apiSend<Story>('POST', base, fields).then(rules),
        update: (id, fields) => apiSend<Story>('PATCH', `${base}/${id}`, fields).then(rules),
        remove: (id) => apiSend<Story>('DELETE', `${base}/${id}`).then(rules),
        reorder: (ids) => apiSend<Story>('PUT', `${base}/order`, { ids }).then(rules),
    };
}

/*
 * The web copy of the API's apply function (apps/api/src/manager/replace-rule/apply-replace-rules.ts),
 * kept identical: one table of cases (apps/api/test/fixtures/replace-rule-cases.json) pins both, here
 * through "Try it" in apps/web/e2e/replace-rules.spec.ts.
 */

/** The parts of a rule that decide what it does. */
export type ReplaceRuleLogic = Pick<ReplaceRuleFields, 'find' | 'replace' | 'regex' | 'ignoreCase'>;

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

/**
 * `applyReplaceRules` with the rules compiled once, for a renderer that runs the same rules over
 * many texts (every part of every AI Message, every streamed event). A rule that doesn't compile
 * is skipped, as there.
 */
export function makeReplacer(rules: readonly ReplaceRuleLogic[]): (text: string) => string {
    const compiled = rules.flatMap((rule) => {
        try {
            return [compileReplaceRule(rule)];
        } catch {
            return [];
        }
    });
    if (compiled.length === 0) return (text) => text;
    return (text) => {
        if (text.length > REPLACE_TEXT_MAX) return text;
        let result = text;
        for (const { pattern, replacement } of compiled) {
            try {
                result = result.replace(pattern, replacement as string);
            } catch {
                // A rule that throws when run is skipped.
            }
        }
        return result;
    };
}

const logicOf = ({ find, replace, regex, ignoreCase }: ChatReplaceRule): ReplaceRuleLogic => ({ find, replace, regex, ignoreCase });

/** The Chat's rules that change how AI Messages read: on AI Messages, in apply order. */
export function onAiRules(rules: readonly ChatReplaceRule[]): ReplaceRuleLogic[] {
    return rules.filter((rule) => rule.onAi).map(logicOf);
}

/** The Chat's rules that fix my Messages before they are sent: on my Messages, in apply order. */
export function onMineRules(rules: readonly ChatReplaceRule[]): ReplaceRuleLogic[] {
    return rules.filter((rule) => rule.onMine).map(logicOf);
}

/**
 * Why a regex Find doesn't compile, or null (spec: "Checks at save"). Compiling never runs the
 * pattern, so it can't hang the page; the API stays the authority on everything else.
 */
export function regexCompileError(find: string, ignoreCase = false): string | null {
    try {
        new RegExp(find, ignoreCase ? 'gi' : 'g');
        return null;
    } catch (error) {
        return (error as Error).message;
    }
}

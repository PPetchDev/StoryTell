import type { LoreSecondaryMode, LoreTriggers } from '../../../model/story/entities/lore-entry.entity.js';
import { createHash } from 'node:crypto';

import { estimateTokens } from '../turn/prompt-tokens.js';
import { cleanPatterns, compileLorePattern } from './lore-pattern.js';

/**
 * Spec: "Lore" and .scratch/lore-triggers/spec.md: which of the Story's Lore entries a prompt
 * carries. Pure logic over plain inputs: no database and no model call, so a turn stays as fast
 * and as cheap as without Lore. Every caller (the turn, Lore in play, Suggested replies, the
 * Snapshot writer) chooses through `selectLoreAt`, so they all agree for the same Messages.
 * Nothing is stored per Chat: Stays for and Rests for are worked out again from the Messages.
 */

/**
 * A Lore entry as the prompts read it. Its trigger settings may be left out, each then at its
 * default, which keeps the plain behaviour (.scratch/lore-triggers/spec.md: "The Lore entry").
 */
export interface PromptLoreEntry extends Partial<LoreTriggers> {
    id: number;
    name: string;
    keywords: string[];
    text: string;
    alwaysOn: boolean;
}

/** The Story's Lore as the prompts read it; takes a Story with its `lore` loaded. */
export function promptLore(story: { lore: Array<PromptLoreEntry & LoreTriggers> }): PromptLoreEntry[] {
    return story.lore.map((entry) => ({
        id: entry.id,
        name: entry.name,
        keywords: [...entry.keywords],
        text: entry.text,
        alwaysOn: entry.alwaysOn,
        secondaryKeywords: [...entry.secondaryKeywords],
        secondaryMode: entry.secondaryMode,
        patterns: [...entry.patterns],
        recursable: entry.recursable,
        sticky: entry.sticky,
        cooldown: entry.cooldown,
        delay: entry.delay,
        chance: entry.chance,
        group: entry.group,
    }));
}

/** Spec: "about 1,500 tokens". */
export const LORE_CAP_TOKENS = 1_500;
/** The Messages scanned for triggers before a point, besides the user's new message. */
export const LORE_SCAN_MESSAGES = 4;
/** Spec: "Recursion": how many steps deep entries bring in other entries. */
export const LORE_RECURSION_STEPS = 3;
/** Spec: "Timed effects": the replay never reaches back further than this many Messages. */
export const LORE_REPLAY_MAX_MESSAGES = 200;

/** The block's heading; tests find the block by it. */
export const LORE_HEADING = '# Lore';

const LATIN_OR_DIGIT = /[a-z0-9]/i;

/**
 * Whether `trigger` comes up in `text`, ignoring case. A trigger that starts with a Latin letter
 * or a digit must start a word ("elf" never fires on "herself"); its end is free, so "Crescent"
 * matches "Crescents". Any other trigger, Thai among them, matches anywhere.
 */
export function mentions(text: string, trigger: string): boolean {
    return mentionsLowered(text.toLocaleLowerCase(), trigger.trim().toLocaleLowerCase());
}

/** `mentions` over a text and a trigger already lower-cased and trimmed, so each is lower-cased once. */
function mentionsLowered(haystack: string, needle: string): boolean {
    if (needle === '') return false;
    const wordStart = LATIN_OR_DIGIT.test(needle[0]);
    for (let at = haystack.indexOf(needle); at >= 0; at = haystack.indexOf(needle, at + 1)) {
        if (!wordStart || at === 0 || !LATIN_OR_DIGIT.test(haystack[at - 1])) return true;
    }
    return false;
}

/** How an entry is written in a prompt. */
export function loreEntryText(entry: PromptLoreEntry): string {
    return `## ${entry.name.trim() || 'Untitled'}\n${entry.text.trim()}`;
}

/** A Message as the selection reads it: the user's text, or the AI's `@Name:` text. */
export interface LoreMessage {
    role: 'user' | 'assistant';
    text: string;
}

/** Why an entry is in play at a point (spec: "Lore in play"). */
export type InPlayReason =
    | { kind: 'always' }
    | { kind: 'cameUp'; trigger: string; messagesAgo: number }
    | { kind: 'staying'; messagesLeft: number }
    | { kind: 'broughtIn'; byName: string };

/** Why an entry that was a candidate at a point did not go in. */
export type LeftOutReason =
    | { kind: 'condition'; mode: LoreSecondaryMode; keywords: string[] }
    | { kind: 'waiting'; messagesLeft: number }
    | { kind: 'resting'; messagesLeft: number }
    | { kind: 'chance'; chance: number }
    | { kind: 'group'; group: string; winner: string }
    | { kind: 'noRoom' };

export interface ChosenLore {
    entry: PromptLoreEntry;
    why: InPlayReason;
}

export interface LeftOutLore {
    entry: PromptLoreEntry;
    why: LeftOutReason;
}

/** The selection at a point: what goes in, in the block's order, and what came up but was left out. */
export interface LoreSelection {
    chosen: ChosenLore[];
    leftOut: LeftOutLore[];
}

export interface LoreSelectionOptions {
    /** Text read before the Messages, as the newest of all: a Snapshot's hint. */
    extraScan?: string | null;
    /**
     * How many Messages, ending with the one just before the point, the point's own scan reads.
     * Left out, the turn window: the user's Message and the 4 before it, or the 4 before the
     * point. Past points, replayed for Stays for and Rests for, always read the turn window.
     */
    scanLength?: number;
    /** The block's cap in tokens. */
    cap?: number;
    /** Where Chance rolls come from; `loreRoll` unless a test hands in its own. */
    roll?: LoreRoll;
}

/**
 * A Chance roll: a number in [0, 100) for an entry at a point, given the text of the Message just
 * before the point. The entry passes when the number is below its Chance.
 */
export type LoreRoll = (entryId: number, point: number, textBefore: string) => number;

/**
 * Spec: "Chance": the roll is taken from a SHA-256 hash of the entry's id, the point and the text
 * of the Message just before it, so the same point over the same Messages always rolls the same
 * (Regenerate, Reply versions, reloads, Lore in play, Suggested replies), a Branch rolls as its
 * parent did, and an edited Message rolls again.
 */
export const loreRoll: LoreRoll = (entryId, point, textBefore) => {
    const digest = createHash('sha256').update(`${entryId}\n${point}\n${textBefore}`).digest();
    // 48 bits, so every value below 100 is as likely as any other.
    return (digest.readUIntBE(0, 6) / 2 ** 48) * 100;
};

/** How many Messages the turn window reads at a point: the user's Message and 4 before it, else 4. */
function turnWindow(messages: LoreMessage[], point: number): number {
    return messages[point - 1]?.role === 'user' ? LORE_SCAN_MESSAGES + 1 : LORE_SCAN_MESSAGES;
}

/**
 * The texts a point's scan reads, newest first (spec: "The point, and the scan"). `messages` are
 * the Chat's Messages before the point, oldest first. The turn window: when the Message just
 * before the point is the user's, it and the 4 before it; otherwise the 4 Messages before it.
 */
export function loreScanAt(messages: LoreMessage[], scanLength?: number): string[] {
    const length = scanLength ?? turnWindow(messages, messages.length);
    return messages
        .slice(Math.max(0, messages.length - length))
        .reverse()
        .map((message) => message.text);
}

/** A text the selection reads: as stored, for patterns, and lower-cased once, for keywords. */
interface ReadText {
    raw: string;
    lower: string;
}

const readText = (raw: string): ReadText => ({ raw, lower: raw.toLocaleLowerCase() });

/** Compiled patterns by source; one that doesn't compile (never saved so) matches nothing. */
const compiledPatterns = new Map<string, RegExp | null>();

function compiled(source: string): RegExp | null {
    let pattern = compiledPatterns.get(source);
    if (pattern === undefined) {
        const result = compileLorePattern(source);
        pattern = result instanceof RegExp ? result : null;
        compiledPatterns.set(source, pattern);
    }
    return pattern;
}

/** A sendable entry with what every point reads of it worked out once. */
interface Candidate {
    entry: PromptLoreEntry;
    /** Its place in the Story's Lore: the tie-breaker. */
    position: number;
    /** Its name and keywords, trimmed and lower-cased; the original spelling for the reason. */
    triggers: Array<{ trigger: string; lower: string }>;
    patterns: Array<{ source: string; pattern: RegExp }>;
    /** Its second keywords, trimmed and lower-cased; the original spelling for the reason. */
    secondary: string[];
    secondaryLower: string[];
    text: ReadText;
    cost: number;
    /** Sticky has no effect on an Always include entry. */
    sticky: number;
    cooldown: number;
    delay: number;
    /** Its group, trimmed; blank = none. Compared ignoring case. */
    group: string;
    /** 100 means no roll. */
    chance: number;
}

function candidateOf(entry: PromptLoreEntry, position: number): Candidate {
    const triggerList = [entry.name, ...entry.keywords].map((trigger) => trigger.trim()).filter((trigger) => trigger !== '');
    const secondary = (entry.secondaryKeywords ?? []).map((keyword) => keyword.trim()).filter((keyword) => keyword !== '');
    return {
        entry,
        position,
        triggers: triggerList.map((trigger) => ({ trigger, lower: trigger.toLocaleLowerCase() })),
        patterns: cleanPatterns(entry.patterns ?? []).flatMap((source) => {
            const pattern = compiled(source);
            return pattern ? [{ source, pattern }] : [];
        }),
        secondary,
        secondaryLower: secondary.map((keyword) => keyword.toLocaleLowerCase()),
        text: readText(entry.text),
        cost: estimateTokens(loreEntryText(entry)),
        sticky: entry.alwaysOn ? 0 : (entry.sticky ?? 0),
        cooldown: entry.cooldown ?? 0,
        delay: entry.delay ?? 0,
        chance: entry.chance ?? 100,
        group: (entry.group ?? '').trim(),
    };
}

/**
 * Where the entry first comes up in `texts` (newest first), or null: a name or keyword by the
 * keyword rule, else a pattern tested against the text as stored. The trigger is what came up:
 * the keyword, or the pattern's source.
 */
function cameUpIn(candidate: Candidate, texts: ReadText[]): { trigger: string; at: number } | null {
    for (let at = 0; at < texts.length; at++) {
        const trigger =
            candidate.triggers.find(({ lower }) => mentionsLowered(texts[at].lower, lower))?.trigger ??
            candidate.patterns.find(({ pattern }) => pattern.test(texts[at].raw))?.source;
        if (trigger !== undefined) return { trigger, at };
    }
    return null;
}

/**
 * Spec: "Matching", second keywords: the condition an entry must meet, by the keyword rule, in
 * everything the selection reads (`read`, lower-cased). "alsoNeeds": one of them must be there;
 * "unless": none may be. None set, no condition. The reason when it fails.
 */
function failedCondition(candidate: Candidate, read: string[]): LeftOutReason | null {
    if (candidate.secondary.length === 0) return null;
    const mode = candidate.entry.secondaryMode ?? 'alsoNeeds';
    const found = candidate.secondaryLower.some((keyword) => read.some((text) => mentionsLowered(text, keyword)));
    return found === (mode === 'alsoNeeds') ? null : { kind: 'condition', mode, keywords: candidate.secondary };
}

/** How an entry is named in a reason ("brought in by The Valley"). */
const nameOf = (entry: PromptLoreEntry): string => entry.name.trim() || 'Untitled';

/** Where each entry last went in, by the point: all a selection carries from one point to the next. */
type WentIn = Map<Candidate, number>;

interface PointResult {
    selection: LoreSelection;
    /** The entries that went in at this point (by Always, a trigger or recursion), starting a stay. */
    wentIn: Candidate[];
}

/**
 * Spec: "Selection at a point", at point `point` with its scan `scan` (newest first) and where
 * each entry last went in before it. Candidates, each at most once, in the block's order:
 *  1. Always include entries, by position;
 *  2. staying entries (within their Stays for after going in), by the point they went in,
 *     newest first, then position;
 *  3. entries that came up in the scan, by recency (the newest scanned text first), then position;
 *  4. entries brought in by the text of chosen ones, by step, then position, at most 3 steps.
 * Each passes its checks in order, the first that fails being its left-out reason: its second
 * keywords (not for Always include and staying entries), Waits until, Rests for, Chance (not for
 * staying entries, which won theirs when they went in), Group (no earlier entry took its group
 * here), then its room
 * under the cap; one that doesn't fit is left out and the rest are still tried.
 */
/** What one point's selection reads besides the entries. */
interface PointInput {
    point: number;
    /** Its scan, newest first. */
    scan: ReadText[];
    /** How many texts at the start of the scan are not Messages (a Snapshot's hint), for `messagesAgo`. */
    offset: number;
    /** The text of the Message just before the point, which Chance rolls on. */
    textBefore: string;
    lastIn: WentIn;
    cap: number;
    roll: LoreRoll;
}

function selectAtPoint(candidates: Candidate[], { point, scan, offset, textBefore, lastIn, cap, roll }: PointInput): PointResult {
    const selection: LoreSelection = { chosen: [], leftOut: [] };
    const wentIn: Candidate[] = [];
    const considered = new Set<Candidate>();
    // What second keywords are looked for in: the scan, then each chosen entry's text as it is chosen.
    const read = scan.map((text) => text.lower);
    const chosenCandidates: Candidate[] = [];
    /** The groups taken at this point, by lower-cased name, with the winner's name. */
    const groups = new Map<string, string>();
    let used = 0;

    const staysUntil = (candidate: Candidate): number | null => {
        const q = lastIn.get(candidate);
        return q !== undefined && point <= q + candidate.sticky ? q + candidate.sticky : null;
    };
    const restsUntil = (candidate: Candidate): number | null => {
        const q = lastIn.get(candidate);
        if (q === undefined) return null;
        const end = q + candidate.sticky + candidate.cooldown;
        return point > q + candidate.sticky && point <= end ? end : null;
    };

    const consider = (candidate: Candidate, why: InPlayReason): void => {
        considered.add(candidate);
        const leaveOut = (reason: LeftOutReason): void => {
            selection.leftOut.push({ entry: candidate.entry, why: reason });
        };
        if (why.kind !== 'always' && why.kind !== 'staying') {
            const failed = failedCondition(candidate, read);
            if (failed) return leaveOut(failed);
        }
        if (point < candidate.delay) return leaveOut({ kind: 'waiting', messagesLeft: candidate.delay - point });
        const resting = restsUntil(candidate);
        if (resting !== null) return leaveOut({ kind: 'resting', messagesLeft: resting - point + 1 });
        // A staying entry already won its roll when it went in.
        if (why.kind !== 'staying' && candidate.chance < 100 && !(roll(candidate.entry.id, point, textBefore) < candidate.chance)) {
            return leaveOut({ kind: 'chance', chance: candidate.chance });
        }
        // Spec: "Groups": the first of a group that gets this far takes it, fitting or not.
        if (candidate.group !== '') {
            const key = candidate.group.toLocaleLowerCase();
            const winner = groups.get(key);
            if (winner !== undefined) return leaveOut({ kind: 'group', group: candidate.group, winner });
            groups.set(key, nameOf(candidate.entry));
        }
        if (used + candidate.cost > cap) return leaveOut({ kind: 'noRoom' });
        used += candidate.cost;
        selection.chosen.push({ entry: candidate.entry, why });
        chosenCandidates.push(candidate);
        read.push(candidate.text.lower);
        // Only going in starts a stay; staying on does not extend it.
        if (why.kind !== 'staying') wentIn.push(candidate);
    };

    for (const candidate of candidates) if (candidate.entry.alwaysOn) consider(candidate, { kind: 'always' });

    const staying = candidates
        .filter((candidate) => !candidate.entry.alwaysOn)
        .flatMap((candidate) => {
            const until = staysUntil(candidate);
            return until === null ? [] : [{ candidate, until, since: lastIn.get(candidate)! }];
        })
        .sort((a, b) => b.since - a.since || a.candidate.position - b.candidate.position);
    for (const { candidate, until } of staying) consider(candidate, { kind: 'staying', messagesLeft: until - point + 1 });

    const cameUp = candidates
        .filter((candidate) => !considered.has(candidate))
        .flatMap((candidate) => {
            const found = cameUpIn(candidate, scan);
            return found === null ? [] : [{ candidate, found }];
        })
        .sort((a, b) => a.found.at - b.found.at || a.candidate.position - b.candidate.position);
    for (const { candidate, found } of cameUp) {
        consider(candidate, { kind: 'cameUp', trigger: found.trigger, messagesAgo: Math.max(0, found.at - offset) });
    }

    // Spec: "Recursion": the chosen entries' text brings in step 1, step 1's text step 2, and so on.
    let bringers = [...chosenCandidates];
    for (let step = 1; step <= LORE_RECURSION_STEPS && bringers.length > 0; step++) {
        const texts = bringers.map((candidate) => candidate.text);
        const before = chosenCandidates.length;
        for (const candidate of candidates) {
            if (considered.has(candidate) || candidate.entry.recursable === false) continue;
            const found = cameUpIn(candidate, texts);
            if (found !== null) consider(candidate, { kind: 'broughtIn', byName: nameOf(bringers[found.at].entry) });
        }
        bringers = chosenCandidates.slice(before);
    }
    return { selection, wentIn };
}

/**
 * Spec: "Timed effects, worked out again every time": the replay window in Messages, 2 × the
 * longest Stays for + Rests for among the entries, at most 200; 0 when none uses either.
 */
function replayWindow(candidates: Array<Pick<Candidate, 'sticky' | 'cooldown'>>): number {
    const longest = Math.max(0, ...candidates.map((candidate) => candidate.sticky + candidate.cooldown));
    return Math.min(LORE_REPLAY_MAX_MESSAGES, 2 * longest);
}

/**
 * Spec: "Selection at a point". The Lore for the point right after `messages` (the Chat's
 * Messages before it, oldest first, the Opening included): a point's number is how many Messages
 * come before it. Entries with blank text are never candidates.
 *
 * Where each entry last went in is found by replaying the full selection over the Chat's past
 * points (each earlier AI Message but the Opening), oldest first, each with the turn window,
 * starting with nothing staying or resting, over the replay window; with no entry using Stays for
 * or Rests for there is no replay. So every caller works out the same answer for the same
 * Messages, and editing, Regenerate, Reply versions, Reset and Branch carry the right Lore.
 */
export function selectLoreAt(entries: PromptLoreEntry[], messages: LoreMessage[], options: LoreSelectionOptions = {}): LoreSelection {
    const cap = options.cap ?? LORE_CAP_TOKENS;
    const roll = options.roll ?? loreRoll;
    const candidates = entries.filter((entry) => entry.text.trim() !== '').map(candidateOf);
    const point = messages.length;
    const texts = messages.map((message) => readText(message.text));
    // Newest first, `length` Messages before point `at`.
    const scanBefore = (at: number, length: number): ReadText[] => texts.slice(Math.max(0, at - length), at).reverse();

    const lastIn: WentIn = new Map();
    const window = replayWindow(candidates);
    if (window > 0) {
        for (let past = Math.max(1, point - window); past < point; past++) {
            if (messages[past].role !== 'assistant') continue;
            const scan = scanBefore(past, turnWindow(messages, past));
            const { wentIn } = selectAtPoint(candidates, { point: past, scan, offset: 0, textBefore: messages[past - 1].text, lastIn, cap, roll });
            for (const candidate of wentIn) lastIn.set(candidate, past);
        }
    }

    const extra = options.extraScan ?? null;
    const scanned = scanBefore(point, options.scanLength ?? turnWindow(messages, point));
    // The extra text is read first, as the newest; `messagesAgo` counts the scanned Messages only.
    const scan = extra !== null ? [readText(extra), ...scanned] : scanned;
    const textBefore = messages[point - 1]?.text ?? '';
    return selectAtPoint(candidates, { point, scan, offset: extra !== null ? 1 : 0, textBefore, lastIn, cap, roll }).selection;
}

/** The chosen entries of a selection, in the block's order. */
export function chosenLore(selection: LoreSelection): PromptLoreEntry[] {
    return selection.chosen.map((chosen) => chosen.entry);
}

/** Spec: "Lore in play": the selection at a point as the Memory drawer reads it. */
export interface LoreInPlay {
    entries: Array<{ id: number; name: string; alwaysOn: boolean; chance: number; why: InPlayReason }>;
    leftOut: Array<{ id: number; name: string; why: LeftOutReason }>;
}

export function loreInPlayOf(selection: LoreSelection): LoreInPlay {
    return {
        entries: selection.chosen.map(({ entry, why }) => ({ id: entry.id, name: entry.name, alwaysOn: entry.alwaysOn, chance: entry.chance ?? 100, why })),
        leftOut: selection.leftOut.map(({ entry, why }) => ({ id: entry.id, name: entry.name, why })),
    };
}

/**
 * The block the turn's trailing system message carries, or null when no entry is selected.
 * Lore is common knowledge of the world (spec): secrets stay on Character cards.
 */
export function loreBlock(selected: PromptLoreEntry[]): string | null {
    if (selected.length === 0) return null;
    return `${LORE_HEADING} (facts of this world that matter right now: common knowledge, so every Character knows them as anyone living there would)
${selected.map(loreEntryText).join('\n\n')}`;
}

/** The most the Lore block can take for this Story: its whole sendable Lore, or the cap. */
export function loreReserveTokens(entries: PromptLoreEntry[], cap = LORE_CAP_TOKENS): number {
    const sendable = entries.filter((entry) => entry.text.trim() !== '');
    if (sendable.length === 0) return 0;
    const whole = estimateTokens(`${LORE_HEADING}\n${sendable.map(loreEntryText).join('\n\n')}`) + 30;
    return Math.min(whole, cap + 30);
}

/** The replay window for these entries (spec: "Timed effects"), in Messages; 0 means no replay. */
export function loreReplayWindow(entries: PromptLoreEntry[]): number {
    return replayWindow(entries.filter((entry) => entry.text.trim() !== '').map(candidateOf));
}

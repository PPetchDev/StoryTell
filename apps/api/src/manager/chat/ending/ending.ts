/**
 * Endings (.scratch/endings/spec.md): a Chat's Ending read from its record, what the Judge is asked
 * and how its answer is applied, and what the Narrator is told to write an Epilogue. Pure logic
 * over plain inputs: the managers gather them.
 */

/** A Story's Ending as these rules read it. */
export interface EndingDefinition {
    id: number;
    name: string;
    condition: string;
    epilogue: string;
}

/** A recorded reaching, oldest first in a list. */
export interface EndingRecord {
    endingId: number;
    reason: string;
    messageId: number;
}

/** A Chat's Endings: the one it reached, and the ones it still can. */
export interface EndingState {
    /** The Ending the Chat reached, with its record; null when it reached none (or the author removed it since). */
    reached: { ending: EndingDefinition; reason: string; messageId: number } | null;
    /** The Endings the Judge watches for: the ready ones, while the Chat has reached none. In the author's order. */
    waiting: EndingDefinition[];
}

/** Whether an Ending can be reached: the Judge needs a condition to watch for. */
export function endingReady(ending: Pick<EndingDefinition, 'condition'>): boolean {
    return ending.condition.trim() !== '';
}

/** What the Ending is called where its name is blank. */
export function endingName(ending: Pick<EndingDefinition, 'name'>): string {
    return ending.name.trim() || 'An ending';
}

/**
 * The Chat's state from its records, oldest first. A Chat reaches at most one Ending: its first
 * record of an Ending the Story still has. While it has one, none waits.
 */
export function endingState(endings: readonly EndingDefinition[], records: readonly EndingRecord[]): EndingState {
    for (const record of records) {
        const ending = endings.find((candidate) => candidate.id === record.endingId);
        if (ending) return { reached: { ending, reason: record.reason, messageId: record.messageId }, waiting: [] };
    }
    return { reached: null, waiting: endings.filter(endingReady) };
}

/** What the Judge answered about Endings, read loosely; null when it named none. */
export interface JudgedEnding {
    /** The number of the Ending it says the story has reached. */
    reached: number;
    reason: string;
}

/** Reads the judgement's `ending` object: a whole number in `reached`, anything else is nothing. */
export function readJudgedEnding(value: unknown): JudgedEnding | null {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
    const fields = value as Record<string, unknown>;
    if (typeof fields.reached !== 'number' || !Number.isFinite(fields.reached)) return null;
    return { reached: Math.round(fields.reached), reason: typeof fields.reason === 'string' ? fields.reason.trim() : '' };
}

/** What answering about Endings adds to the judge's token cap. */
export const ENDING_EXTRA_TOKENS = 80;

/** The longest reason kept, in characters. */
export const ENDING_REASON_MAX = 240;

/**
 * The Judge's section about Endings, or null when none waits (the Story has none that is ready, or
 * the Chat has reached one): the judge's prompt is then exactly as it was. The rule and the JSON
 * field are in the section, so the system message never changes. It goes after the exchange it is
 * read from.
 */
export function judgeEndingSection(state: Pick<EndingState, 'waiting'>): string | null {
    if (state.waiting.length === 0) return null;
    return [
        '# Endings',
        'The story has not reached an ending. Each of these is reached when its condition has happened in the story:',
        ...state.waiting.map((ending, index) => `${index + 1}. ${endingName(ending)} — reached when: ${ending.condition.trim()}`),
        'Ending rule: add "ending": {"reason": "...", "reached": 1} to your JSON, with the ending\'s number, only when the latest exchange clearly shows that its whole condition has now happened. Not when it is only near, hinted at, promised or planned; when in doubt, leave "ending" out. At most one. Write the reason first: one short sentence the user will read, saying what brought the story there.',
    ].join('\n');
}

/** A reaching to record against the judged Message. */
export interface NewEndingReached {
    endingId: number;
    reason: string;
}

/**
 * What one judgement does to the Chat's Ending: a waiting Ending the Judge named is reached.
 * Anything else changes nothing. `rejected` says why what the Judge gave was not taken, for the log.
 */
export function applyEnding(state: Pick<EndingState, 'reached' | 'waiting'>, judged: JudgedEnding | null): { reached: NewEndingReached | null; rejected: string[] } {
    if (!judged) return { reached: null, rejected: [] };
    if (state.reached) return { reached: null, rejected: ['Ending: one is already reached in this Chat'] };
    const ending = state.waiting[judged.reached - 1];
    if (!ending) return { reached: null, rejected: [`Ending: no waiting Ending numbered ${judged.reached}`] };
    const reason = judged.reason.replace(/\s+/g, ' ').trim();
    return { reached: { endingId: ending.id, reason: reason.length > ENDING_REASON_MAX ? `${reason.slice(0, ENDING_REASON_MAX - 1).trimEnd()}…` : reason }, rejected: [] };
}

/** What an Epilogue turn is told beyond the usual layers (.scratch/endings/spec.md, "The Epilogue"). */
export interface PromptEpilogue {
    /** The Ending the Chat reached, by name; null when the user chose to end the story themselves. */
    endingName: string | null;
    /** What the author wants the Epilogue to tell; empty for none, and for the user's own ending. */
    note: string;
}

/** The Epilogue's input from the Chat's state: for the Ending it reached, or for an end of the user's own choosing. */
export function promptEpilogue(state: Pick<EndingState, 'reached'>): PromptEpilogue {
    if (!state.reached) return { endingName: null, note: '' };
    return { endingName: endingName(state.reached.ending), note: state.reached.ending.epilogue.trim() };
}

/** How long an Epilogue is asked to be, whatever the Story's reply length, and the least room it is given. */
export const EPILOGUE_WORDS = { min: 150, max: 300 } as const;
export const EPILOGUE_MIN_TOKENS = 900;

/**
 * Stands in for the user's message on an Epilogue turn, as the continue instruction does on a
 * Continue: the story closes here. The worn identity gets no new words or decisions, but the
 * narration may say where they end up, as it follows from what they already chose.
 */
export function epilogueInstruction(identity: string, epilogue: PromptEpilogue): string {
    return [
        `(The story ends here. ${identity} does nothing new.) Write the epilogue: this story's closing passage, from exactly where it stands.`,
        epilogue.endingName ? `The story has reached its ending: "${epilogue.endingName}".` : `${identity} has chosen to end the story at this point.`,
        epilogue.note ? `What the author wants the epilogue to tell: ${epilogue.note}` : null,
        `Tell how things settle afterwards for the Characters and the place, in the days or years that follow, and bring this story's open threads to rest. Add no new conflict, twist or cliffhanger, and close on a last image, not on a question to ${identity}.`,
        `The narration may say where ${identity} ends up, only as it follows from what they have already chosen; give ${identity} no line of speech and no new decision.`,
        `About ${EPILOGUE_WORDS.min} to ${EPILOGUE_WORDS.max} words.`,
    ]
        .filter((line): line is string => line !== null)
        .join('\n');
}

/** The trailing instruction of an Epilogue turn, in place of the turn's own. */
export function epilogueFinalInstruction(identity: string): string {
    return `Write the epilogue now, mostly as narration. Give ${identity} no line of speech and no new decision. Use @Name: lines for Character speech, spoken words only: no parentheses or *(stage directions)* inside them, even where earlier turns had them.`;
}

/** The Chat's Ending as the Chat screen shows it; null when it has reached none. */
export interface EndingView {
    id: number;
    name: string;
    /** What brought the story there, in the Judge's sentence; may be empty. */
    reason: string;
    /** The AI Message the story reached it with. */
    messageId: number;
}

export function endingView(state: Pick<EndingState, 'reached'>): EndingView | null {
    if (!state.reached) return null;
    const { ending, reason, messageId } = state.reached;
    return { id: ending.id, name: endingName(ending), reason, messageId };
}

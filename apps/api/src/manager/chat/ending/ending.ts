/**
 * Endings (.scratch/endings/spec.md): a Chat's Ending read from its record, what the Judge is asked
 * and how its answer is applied, and what the Narrator is told to write an Epilogue. An Ending is
 * the author's, reached when its condition happens, or, in a Story with none of its own, one the
 * Judge suggests when the story comes to a natural close. Pure logic over plain inputs: the
 * managers gather them.
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
    /** The author's Ending; null for one the Judge suggested. */
    endingId: number | null;
    /** A suggested Ending's name; null for the author's, which has its own. */
    name?: string | null;
    reason: string;
    messageId: number;
}

/** A Chat's Endings: the one it reached, and what the Judge still watches for. */
export interface EndingState {
    /**
     * The Ending the Chat reached, with its record; null when it reached none (or the author
     * removed it since). `ending` is the author's, or null for one the Judge suggested.
     */
    reached: { ending: EndingDefinition | null; name: string; reason: string; messageId: number } | null;
    /** The author's Endings the Judge watches for: the ready ones, while the Chat has reached none. In the author's order. */
    waiting: EndingDefinition[];
    /** Whether the Judge may suggest an Ending of its own: the Chat has reached none, the Story has none that can be reached, and the Chat allows it. */
    canSuggest: boolean;
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
 * How many replies a model must have written in a Chat before the Judge may suggest an Ending: a
 * story can't have run its course in its first few exchanges, and every earlier judge call is then
 * exactly as it was.
 */
export const ENDING_SUGGEST_AFTER_REPLIES = 6;

/**
 * The Chat's state from its records, oldest first. A Chat reaches at most one Ending: its first
 * record of an Ending the Story still has, or of a suggested one. While it has one, nothing waits.
 * `suggestions` says whether this Chat lets the Judge suggest one now (left out: no).
 */
export function endingState(endings: readonly EndingDefinition[], records: readonly EndingRecord[], options: { suggestions?: boolean } = {}): EndingState {
    for (const record of records) {
        if (record.endingId === null) {
            return { reached: { ending: null, name: record.name?.trim() || 'An ending', reason: record.reason, messageId: record.messageId }, waiting: [], canSuggest: false };
        }
        const ending = endings.find((candidate) => candidate.id === record.endingId);
        if (ending) return { reached: { ending, name: endingName(ending), reason: record.reason, messageId: record.messageId }, waiting: [], canSuggest: false };
    }
    const waiting = endings.filter(endingReady);
    // The author's Endings are the Story's endings: the Judge suggests one only where there are none.
    return { reached: null, waiting, canSuggest: waiting.length === 0 && options.suggestions === true };
}

/** What the Judge answered about Endings, read loosely; null when it named and suggested none. */
export interface JudgedEnding {
    /** The number of the author's Ending it says the story has reached; null when it gave none. */
    reached: number | null;
    /** The name of the Ending it suggests; null when it gave none. */
    suggest: string | null;
    reason: string;
}

/** Reads the judgement's `ending` object: a whole number in `reached` or a name in `suggest`; anything else is nothing. */
export function readJudgedEnding(value: unknown): JudgedEnding | null {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
    const fields = value as Record<string, unknown>;
    const reached = typeof fields.reached === 'number' && Number.isFinite(fields.reached) ? Math.round(fields.reached) : null;
    const suggest = typeof fields.suggest === 'string' && fields.suggest.trim() !== '' ? fields.suggest.trim() : null;
    if (reached === null && suggest === null) return null;
    return { reached, suggest, reason: typeof fields.reason === 'string' ? fields.reason.trim() : '' };
}

/** What answering about Endings adds to the judge's token cap. */
export const ENDING_EXTRA_TOKENS = 80;

/** The longest reason kept, in characters. */
export const ENDING_REASON_MAX = 240;

/** The longest name of a suggested Ending, in characters. */
export const ENDING_NAME_MAX = 60;

/**
 * The Judge's section about Endings, or null when there is nothing to ask: the Chat has reached
 * one, or the Story has none of its own and the Chat takes no suggestion now. The judge's prompt is
 * then exactly as it was. The rule and the JSON field are in the section, so the system message
 * never changes. It goes after the exchange it is read from.
 */
export function judgeEndingSection(state: Pick<EndingState, 'waiting' | 'canSuggest'>): string | null {
    if (state.waiting.length > 0) {
        return [
            '# Endings',
            'The story has not reached an ending. Each of these is reached when its condition has happened in the story:',
            ...state.waiting.map((ending, index) => `${index + 1}. ${endingName(ending)} — reached when: ${ending.condition.trim()}`),
            'Ending rule: add "ending": {"reason": "...", "reached": 1} to your JSON, with the ending\'s number, only when the latest exchange clearly shows that its whole condition has now happened. Not when it is only near, hinted at, promised or planned; when in doubt, leave "ending" out. At most one. Write the reason first: one short sentence the user will read, saying what brought the story there.',
        ].join('\n');
    }
    if (!state.canSuggest) return null;
    return [
        '# Ending',
        'The story has not ended.',
        'Ending rule: add "ending": {"reason": "...", "suggest": "..."} to your JSON only when the latest exchange brings the whole story to a natural close: what the story was about is settled and nothing pressing is left open, so an epilogue could follow now. A scene ending, a pause, a goodnight, a plan made or a problem half solved is not the story\'s end. Most exchanges are not; when in doubt, leave "ending" out. "suggest" is a name for the ending, two to five words, in the story\'s own terms. Write the reason first: one short sentence the user will read, saying what makes this the end.',
    ].join('\n');
}

/** A reaching to record against the judged Message. */
export interface NewEndingReached {
    /** The author's Ending; null for a suggested one. */
    endingId: number | null;
    /** A suggested Ending's name; null for the author's. */
    name: string | null;
    reason: string;
}

/** A suggested name as it is kept: on one line, without wrapping quotes or a closing full stop, cut to `ENDING_NAME_MAX`. */
function tidyName(name: string): string {
    const line = name
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
        .replace(/\.+$/, '')
        .trim();
    return line.length > ENDING_NAME_MAX ? `${line.slice(0, ENDING_NAME_MAX - 1).trimEnd()}…` : line;
}

function tidyReason(reason: string): string {
    const line = reason.replace(/\s+/g, ' ').trim();
    return line.length > ENDING_REASON_MAX ? `${line.slice(0, ENDING_REASON_MAX - 1).trimEnd()}…` : line;
}

/**
 * What one judgement does to the Chat's Ending: a waiting Ending the Judge named is reached, or,
 * where the Judge may suggest one, the one it suggests. Anything else changes nothing. `rejected`
 * says why what the Judge gave was not taken, for the log.
 */
export function applyEnding(
    state: Pick<EndingState, 'reached' | 'waiting' | 'canSuggest'>,
    judged: JudgedEnding | null,
): { reached: NewEndingReached | null; rejected: string[] } {
    if (!judged) return { reached: null, rejected: [] };
    if (state.reached) return { reached: null, rejected: ['Ending: one is already reached in this Chat'] };
    if (state.waiting.length > 0) {
        if (judged.reached === null) return { reached: null, rejected: ['Ending: a suggestion where the Story has its own Endings'] };
        const ending = state.waiting[judged.reached - 1];
        if (!ending) return { reached: null, rejected: [`Ending: no waiting Ending numbered ${judged.reached}`] };
        return { reached: { endingId: ending.id, name: null, reason: tidyReason(judged.reason) }, rejected: [] };
    }
    if (!state.canSuggest) return { reached: null, rejected: ['Ending: none was asked for'] };
    const name = judged.suggest === null ? '' : tidyName(judged.suggest);
    if (name === '') return { reached: null, rejected: ['Ending: a suggestion without a name'] };
    return { reached: { endingId: null, name, reason: tidyReason(judged.reason) }, rejected: [] };
}

/** What an Epilogue turn is told beyond the usual layers (.scratch/endings/spec.md, "The Epilogue"). */
export interface PromptEpilogue {
    /** The Ending the Chat reached, by name; null when the user chose to end the story themselves. */
    endingName: string | null;
    /** What the author wants the Epilogue to tell; empty for none, for a suggested Ending and for the user's own. */
    note: string;
}

/** The Epilogue's input from the Chat's state: for the Ending it reached, or for an end of the user's own choosing. */
export function promptEpilogue(state: Pick<EndingState, 'reached'>): PromptEpilogue {
    if (!state.reached) return { endingName: null, note: '' };
    return { endingName: state.reached.name, note: state.reached.ending?.epilogue.trim() ?? '' };
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
    return `Write the epilogue now, mostly as narration. Give ${identity} no line of speech and no new decision. Use @Name: lines for Character speech, spoken words only, with no quotation marks: no parentheses, *(stage directions)* or narration inside them, even where earlier turns had them.`;
}

/** The Chat's Ending as the Chat screen shows it; null when it has reached none. */
export interface EndingView {
    /** The author's Ending; null for one the Judge suggested. */
    id: number | null;
    name: string;
    /** What brought the story there, in the Judge's sentence; may be empty. */
    reason: string;
    /** The AI Message the story reached it with. */
    messageId: number;
    /** The Judge suggested it: the user may wave it off, where the author's stands. */
    suggested: boolean;
}

export function endingView(state: Pick<EndingState, 'reached'>): EndingView | null {
    if (!state.reached) return null;
    const { ending, name, reason, messageId } = state.reached;
    return { id: ending?.id ?? null, name, reason, messageId, suggested: ending === null };
}

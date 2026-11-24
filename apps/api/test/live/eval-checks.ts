import { ReplyLength } from '../../src/model/story/entities/story.entity.js';
import { repeatedPhrases } from '../../src/manager/chat/speech/repeated-phrases.js';
import { ParsedReply } from '../../src/manager/chat/turn/reply-parser.js';

/**
 * The checks of a prompt eval run (.scratch/prompt-evals/spec.md). A check is one yes-or-no
 * question about a reply. A code check is answered here, by code; a graded check is one written
 * criterion, answered by the grader model.
 */

/** What a code check reads: the reply as written, and as the app's reply parser reads it. */
export interface CheckContext {
    text: string;
    parsed: ParsedReply;
    /** The worn identity's name, as the turn prompt was given it. */
    identityName: string;
}

export interface CheckVerdict {
    pass: boolean;
    /** Why, in a few words: what a reader of the scorecard needs to see the failure. */
    reason: string;
}

/** A check answered by code, over whatever the scene's kind reads: a reply, a judgement, an extraction. */
export interface Check<T> {
    name: string;
    run(context: T): CheckVerdict;
}

export type CodeCheck = Check<CheckContext>;

export interface GradedCheck {
    name: string;
    /** One sentence the grader answers yes or no to, about the reply alone. */
    criterion: string;
    /**
     * A Character whose speech this criterion is about. The grader is shown their speech lines
     * apart and judges only those; with no speech line there is nothing to judge, and the check is
     * "not graded". Without it, a criterion about what someone says was passed on words quoted in
     * the narration (.scratch/prompt-evals/spec.md, "First runs").
     */
    speechOf?: string;
}

/** How far outside the reply length's range a reply may run and still count: models miss by a little. */
const LENGTH_SLACK = 0.15;

/** The word ranges the turn prompt asks for (REPLY_LENGTHS in the turn prompt). */
const WORD_RANGES: Record<ReplyLength, { min: number; max: number }> = {
    [ReplyLength.Short]: { min: 60, max: 150 },
    [ReplyLength.Medium]: { min: 150, max: 350 },
    [ReplyLength.Long]: { min: 350, max: 600 },
};

export function wordCount(text: string): number {
    return text.split(/\s+/).filter(Boolean).length;
}

/** Every speech line names a Character of the cast, and there is something to read. */
export const parsesAsAReply: CodeCheck = {
    name: 'parses',
    run: ({ parsed }) => {
        if (parsed.parts.length === 0) return { pass: false, reason: 'nothing to read' };
        if (parsed.unknownSpeakers.length > 0) return { pass: false, reason: `unknown speaker: ${parsed.unknownSpeakers.join(', ')}` };
        return { pass: true, reason: `${parsed.parts.length} parts` };
    },
};

/** A named Character speaks at least once, on an `@Name:` line. */
export function speaks(name: string): CodeCheck {
    return {
        name: `${name} speaks`,
        run: ({ parsed }) => {
            const lines = parsed.parts.filter((part) => part.kind === 'speech' && part.speakerName === name).length;
            return { pass: lines > 0, reason: `${lines} speech lines` };
        },
    };
}

/** A named Character has no `@Name:` line: one sitting out, whose line the app would have to drop. */
export function staysSilent(name: string): CodeCheck {
    return {
        name: `${name} stays silent`,
        run: ({ parsed }) => {
            const lines = parsed.parts.filter((part) => part.kind === 'speech' && part.speakerName === name).length;
            return { pass: lines === 0, reason: `${lines} speech lines` };
        },
    };
}

/** What follows the name on a speech line, as the model wrote it. */
const SPEECH_LINE_WORDS = /^\s*\**@[^:\n@]{1,60}:\s*(.*)$/;
/** An *asterisk action* of two words or more (one starred word is emphasis), or anything in parentheses. */
const STAGE_DIRECTION = /\*[^*\s][^*]*\s[^*]*\*|\([^)]+\)/;

/** A speech line holds only what is said aloud: no *asterisk action* and no (parenthesis) inside it. */
export const speechIsOnlySpoken: CodeCheck = {
    name: 'no stage directions in speech',
    run: ({ text }) => {
        for (const line of text.split('\n')) {
            const found = STAGE_DIRECTION.exec(SPEECH_LINE_WORDS.exec(line)?.[1] ?? '');
            if (found) return { pass: false, reason: `wrote "${found[0]}" inside a speech line` };
        }
        return { pass: true, reason: 'none' };
    },
};

/** No line is written as the user's own character: the reply parser's guard never had to cut. */
export const neverSpeaksAsTheUser: CodeCheck = {
    name: 'no line as the user',
    run: ({ parsed, identityName }) => ({
        pass: !parsed.cutAtUserLine,
        reason: parsed.cutAtUserLine ? `a line written as ${identityName}` : 'none',
    }),
};

/** The reply's word count is inside the reply length's range, give or take the slack. */
export function lengthIs(length: ReplyLength): CodeCheck {
    const { min, max } = WORD_RANGES[length];
    return {
        name: `${length} length`,
        run: ({ text }) => {
            const words = wordCount(text);
            const pass = words >= Math.floor(min * (1 - LENGTH_SLACK)) && words <= Math.ceil(max * (1 + LENGTH_SLACK));
            return { pass, reason: `${words} words (asked ${min} to ${max})` };
        },
    };
}

/** The reply says something it must (a listed fact's value). */
export function mentions(name: string, pattern: RegExp): CodeCheck {
    return { name, run: ({ text }) => ({ pass: pattern.test(text), reason: pattern.test(text) ? 'said' : 'not said' }) };
}

/** The reply leaves out something it must not say (another number for a fact, a phrase it was told to drop). */
export function avoids(name: string, pattern: RegExp): CodeCheck {
    return {
        name,
        run: ({ text }) => {
            const found = pattern.exec(text);
            return { pass: found === null, reason: found ? `wrote "${found[0]}"` : 'not written' };
        },
    };
}

/** The reply uses something at most a few times (a vague word, a comparison). `pattern` needs the `g` flag. */
export function atMost(name: string, pattern: RegExp, most: number): CodeCheck {
    return {
        name,
        run: ({ text }) => {
            const found = text.match(pattern) ?? [];
            return { pass: found.length <= most, reason: found.length === 0 ? 'none' : `${found.length}: ${found.slice(0, 4).map((one) => `"${one}"`).join(', ')}` };
        },
    };
}

/**
 * A habit of speech (a catchphrase) is in at most `most` of a Character's speech lines in the reply:
 * plain talk first, habits second (.scratch/natural-speech/plain-and-habits.md).
 */
export function habitInFewLines(name: string, speaker: string, habit: RegExp, most: number): CodeCheck {
    return {
        name,
        run: ({ parsed }) => {
            const lines = parsed.parts.filter((part) => part.kind === 'speech' && part.speakerName === speaker);
            const with_ = lines.filter((part) => habit.test(part.text)).length;
            return { pass: with_ <= most, reason: `in ${with_} of ${lines.length} lines` };
        },
    };
}

/** The reply ends on a finished sentence, not cut off mid-word. */
export const endsCleanly: CodeCheck = {
    name: 'ends cleanly',
    run: ({ text }) => {
        const end = text.trimEnd().slice(-1);
        return { pass: /[.!?…"”’'*)\]—-]/.test(end), reason: `ends with "${end}"` };
    },
};

/** The model wrote the scene: no refusal, apology or stepping out of the story. */
export const noRefusal: CodeCheck = avoids(
    'no refusal',
    /\bI (?:can(?:'|’)?not|can(?:'|’)t|won(?:'|’)t|am unable to|(?:'|’)m unable to) (?:write|continue|help|assist|comply|create|provide)|\bI(?:'|’)m sorry,? but\b|\bas an AI\b|\bfade[sd]? to black\b|\bcontent (?:policy|guidelines)\b/i,
);

/** The story is told in English whatever language the user typed in: no Thai script in the reply. */
export const writtenInEnglish: CodeCheck = avoids('written in English', /[฀-๿]+/);

/** What a check of a played Chat reads: every reply of it, in order, each as a one-reply check reads it. */
export interface ChatContext {
    replies: CheckContext[];
}

export type ChatCheck = Check<ChatContext>;

/** A one-reply check held by every reply of a played Chat; the reason names the turns that failed it. */
export function everyReply(check: CodeCheck): ChatCheck {
    return {
        name: `every reply: ${check.name}`,
        run: ({ replies }) => {
            const failed = replies.flatMap((reply, index) => {
                const verdict = check.run(reply);
                return verdict.pass ? [] : [`turn ${index + 1}: ${verdict.reason}`];
            });
            return { pass: failed.length === 0, reason: failed.join('; ') || `all ${replies.length}` };
        },
    };
}

/** A one-reply check on the reply to one turn of a played Chat, counted from 1. */
export function replyTo(turn: number, check: CodeCheck): ChatCheck {
    return {
        name: `turn ${turn}: ${check.name}`,
        run: ({ replies }) => (replies[turn - 1] ? check.run(replies[turn - 1]) : { pass: false, reason: `no reply to turn ${turn}` }),
    };
}

const wordsOnly = (text: string): string =>
    ` ${text
        .toLowerCase()
        .replace(/’/g, "'")
        .replace(/[^a-z0-9']+/g, ' ')
        .trim()} `;

/**
 * A phrase the earlier replies of a played Chat already shared is not written again. Before each
 * turn the app's own detector reads the replies so far, as the turn prompt does to name the
 * phrases not to reuse; a reply that holds one of them all the same is the failure. `names` are
 * the Chat's people, as the turn prompt gives them to the detector.
 */
export function dropsRepeatedPhrases(names: readonly string[]): ChatCheck {
    return {
        name: 'drops phrases the earlier replies shared',
        run: ({ replies }) => {
            const again: string[] = [];
            for (let turn = 2; turn < replies.length; turn++) {
                const named = repeatedPhrases(
                    replies.slice(0, turn).map((reply) => reply.text),
                    names,
                );
                const reply = wordsOnly(replies[turn].text);
                for (const phrase of named) if (reply.includes(wordsOnly(phrase))) again.push(`turn ${turn + 1}: "${phrase}"`);
            }
            return { pass: again.length === 0, reason: again.join('; ') || 'none came back' };
        },
    };
}

/** What the grader said of one reply of a played Chat: yes or no to the check's question, and the words it judged on. */
export interface ReplyVerdict {
    yes: boolean;
    quote: string;
}

/**
 * A check of a played Chat that the grader answers reply by reply, one yes or no each, and code
 * turns into a pass or a fail. Asked to judge a whole Chat by a count ("in four or more of the
 * replies…"), the grader answered both ways on the same Chat (the grader check, 2026-11-24): it
 * reads well and counts badly. So it only reads.
 */
export interface PerReplyCheck {
    name: string;
    /** One yes-or-no question about a single reply, where "yes" is the fault. */
    question: string;
    /** What the verdicts, one a reply in turn order, come to. */
    rule(verdicts: ReplyVerdict[]): CheckVerdict;
}

/**
 * A fault may show now and then, and not as a habit: the Chat fails when three replies in a row
 * have it, or half the replies or more. The reason names the turns and the words judged on.
 */
export function nowAndThen(verdicts: ReplyVerdict[]): CheckVerdict {
    const turns = verdicts.flatMap((verdict, index) => (verdict.yes ? [index + 1] : []));
    let longest = 0;
    let row = 0;
    for (const verdict of verdicts) {
        row = verdict.yes ? row + 1 : 0;
        longest = Math.max(longest, row);
    }
    const pass = longest < 3 && turns.length * 2 < verdicts.length;
    if (turns.length === 0) return { pass, reason: `none of ${verdicts.length}` };
    const quotes = turns.map((turn) => `"${verdicts[turn - 1].quote}"`).join('; ');
    return { pass, reason: `${turns.length === 1 ? 'turn' : 'turns'} ${turns.join(', ')} of ${verdicts.length}: ${quotes}` };
}

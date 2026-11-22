import { ReplyLength } from '../../src/model/story/entities/story.entity.js';
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

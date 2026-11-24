/**
 * Faults of a reply that code can see in its parts, as the app stores them: what the play-signals
 * report counts (.scratch/reply-repair/spec.md, "5. The play-signals report"). The prompt eval
 * run's check for a stage direction reads the same pattern from here. Pure.
 */

/** A part of a reply as far as these faults need it: a stored part, a Reply version's, or a freshly parsed one. */
export interface FaultPart {
    kind: 'narration' | 'speech';
    characterId?: number | null;
    text: string;
}

/** An *asterisk action* of two words or more (one starred word is emphasis), or anything in parentheses. */
export const STAGE_DIRECTION = /\*[^*\s][^*]*\s[^*]*\*|\([^)]+\)/;

export interface ReplyFaults {
    /** Nobody speaks: in the app the Narrator says everything, and no Character has a picture, colour or voice. */
    noSpeechLine: boolean;
    /** A speech line by a name that is no Character of the Story. */
    unknownSpeaker: boolean;
    /** A speech line that holds a stage direction, which is shown in the speech bubble and read aloud. */
    stageDirectionInSpeech: boolean;
}

export function replyFaults(parts: readonly FaultPart[]): ReplyFaults {
    const speech = parts.filter((part) => part.kind === 'speech');
    return {
        noSpeechLine: speech.length === 0,
        unknownSpeaker: speech.some((part) => part.characterId === null || part.characterId === undefined),
        stageDirectionInSpeech: speech.some((part) => STAGE_DIRECTION.test(part.text)),
    };
}

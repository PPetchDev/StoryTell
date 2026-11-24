import type { ReplacedReplyCounts } from '../../../model/reply-record/reply-record.service.js';
import { overusedIn } from '../speech/overused.js';
import { holdsPhrase, repeatedPhrases } from '../speech/repeated-phrases.js';
import { FaultPart, replyFaults } from './reply-faults.js';

/**
 * What one reply comes to in counts (.scratch/reply-repair/spec.md, "5. The play-signals report"):
 * the faults code can see in it and its word counts. Worked out the same way for a reply shown now,
 * by the play-signals report, and for a reply a Regenerate replaces, by the turn that replaces it,
 * so the two can be read side by side. Pure.
 */

/** A part of a reply as stored, as far as the counts need it. */
export interface CountedPart extends FaultPart {
    speakerName?: string | null;
}

/** How many replies before one are read for a phrase it shares with them. */
export const REPLIES_BEFORE = 3;

/** A reply's parts as the turn prompt's history writes them: what the replies after it are read against. */
export function replyText(parts: readonly CountedPart[]): string {
    return parts.map((part) => (part.kind === 'speech' ? `@${part.speakerName ?? ''}: ${part.text}` : part.text)).join('\n\n');
}

/**
 * One reply's counts. `before` are the play model's replies before it in its Chat, as text, the
 * nearest last; `names` are the Story's own people, whose names are no fault and no repeated phrase.
 */
export function replyCounts(parts: readonly CountedPart[], before: readonly string[], names: readonly string[]): ReplacedReplyCounts {
    const faults = replyFaults(parts);
    const text = replyText(parts);
    const overused = overusedIn([text], names);
    return {
        noSpeechLine: faults.noSpeechLine,
        unknownSpeaker: faults.unknownSpeaker,
        stageDirection: faults.stageDirectionInSpeech,
        // A phrase the replies before it already shared, written again: what the turn prompt names as not to be reused.
        sharedPhrase: repeatedPhrases(before.slice(-REPLIES_BEFORE), names).some((phrase) => holdsPhrase(text, phrase)),
        words: overused.words,
        overused: [...overused.found.values()].reduce((sum, found) => sum + found, 0),
    };
}

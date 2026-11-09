import { AppError } from './app-error.js';

import type { MissingField } from '../manager/story/playable.js';

export class ChatNotFoundError extends AppError {
    constructor() {
        super('404.004.001', 'Chat not found.');
    }
}

/** Starting a Chat or sending needs every required Story field filled. */
export class StoryNotPlayableError extends AppError {
    constructor(readonly missing: MissingField[]) {
        super(
            '422.004.002',
            `The Story isn't playable yet. Still to fill in: ${missing.map((field) => field.label).join(', ')}.`,
        );
    }
}

/** Retry when the Chat isn't waiting for a reply to a User Message. */
export class NoTurnToRetryError extends AppError {
    constructor() {
        super('409.004.003', 'There is no failed turn to retry.');
    }
}

/** A second send while this Chat's turn is still being written. */
export class TurnInProgressError extends AppError {
    constructor() {
        super('409.004.004', 'The AI is still writing this turn.');
    }
}

/** A send or a Message edit with nothing but whitespace. */
export class EmptyMessageError extends AppError {
    constructor() {
        super('422.004.005', 'Write something to send.');
    }
}

export class MessageNotFoundError extends AppError {
    constructor() {
        super('404.004.006', 'Message not found.');
    }
}

/** A previous AI Message's background call was still pending past the wait (spec: story 68). */
export class BackgroundStillSavingError extends AppError {
    constructor() {
        super('409.004.007', 'The previous turn is still saving its Memory, Bonds, Arcs and Scene. Try again in a moment.');
    }
}

/** The names of the background calls, in the plain words the failed notice reads them in. */
export type BackgroundCallName = 'Bonds, Arcs and Scene' | 'Memories';

/** A previous AI Message's background call failed, its automatic retry too; it must be retried before the next turn. */
export class BackgroundFailedError extends AppError {
    constructor(failed: BackgroundCallName[] = ['Bonds, Arcs and Scene']) {
        const judge = failed.includes('Bonds, Arcs and Scene');
        const memory = failed.includes('Memories');
        const what = judge && memory ? 'the Memories, feelings and Scene' : memory ? 'the Memories' : 'the feelings and the Scene';
        super('409.004.008', `Couldn't save ${what} from the last reply. Retry before sending.`);
    }
}

/** A judge retry on a Message whose judge did not fail, or that is not the latest AI Message. */
export class NoFailedJudgeError extends AppError {
    constructor() {
        super('409.004.009', 'Nothing to retry on that Message: its Bonds, Arcs and Scene did not fail to update.');
    }
}

/** An extraction retry on a Message whose extraction did not fail, or that is not the latest AI Message. */
export class NoFailedExtractionError extends AppError {
    constructor() {
        super('409.004.010', 'Nothing to retry on that Message: its Memories did not fail to update.');
    }
}

export class MemoryNotFoundError extends AppError {
    constructor() {
        super('404.004.011', 'Memory not found.');
    }
}

/** A Memory added or edited with nothing but whitespace. */
export class EmptyMemoryError extends AppError {
    constructor() {
        super('422.004.012', 'Write what to remember.');
    }
}

/** A Continue while the last User Message still awaits its reply: Retry is the way on. */
export class AwaitingReplyError extends AppError {
    constructor() {
        super('409.004.013', 'Your last message is still waiting for its reply. Retry it first.');
    }
}

/** A Regenerate on a Message other than the Chat's newest AI Message, or on the Opening. */
export class NotRegenerableError extends AppError {
    constructor() {
        super('409.004.014', 'Only the newest reply can be written again, and never the Opening.');
    }
}

/** The model's Suggested replies could not be read as three suggestions of the three kinds. Nothing stored. */
export class UnreadableSuggestionsError extends AppError {
    constructor(reason: string) {
        super('502.004.015', `Couldn't suggest replies (${reason}). Try again.`);
    }
}

/** The Story so far saved with nothing but whitespace. */
export class EmptyStorySoFarError extends AppError {
    constructor() {
        super('422.004.016', 'Write what has happened so far.');
    }
}

/** The user tried to save a Story so far while the Chat has none: the whole Chat still fits, so it would cover nothing. */
export class NoStorySoFarError extends AppError {
    constructor() {
        super('409.004.017', 'This Chat has no Story so far yet: the whole Chat still fits in what the AI reads.');
    }
}

/** A Reply version chosen that the Message does not have: only the newest AI Message has more than one. */
export class ReplyVersionNotFoundError extends AppError {
    constructor() {
        super('404.004.018', 'That reply has no such version.');
    }
}

/** Write for me's answer held nothing for the user once its label and any Character line were taken off. Nothing stored. */
export class UnreadableWriteForMeError extends AppError {
    constructor() {
        super('502.004.019', "Couldn't write it. Try again.");
    }
}

/** The background model's Thai reading came back empty. Nothing stored. */
export class UnreadableThaiReadingError extends AppError {
    constructor() {
        super('502.004.020', "Couldn't make a Thai reading. Try again.");
    }
}

/** Read aloud on a User Message: only AI Messages have a play queue (.scratch/read-aloud/spec.md). */
export class NotReadableError extends AppError {
    constructor() {
        super('404.004.022', 'Only AI Messages can be read aloud.');
    }
}

/** A Read aloud item outside the Message's play queue as it stands now. No call is made. */
export class SpeechItemNotFoundError extends AppError {
    constructor() {
        super('404.004.023', 'That part of the Message is not in its reading. Start reading it again.');
    }
}

/** A nudge on a Character sitting out of the Chat (.scratch/speaker-controls/spec.md). Nothing stored. */
export class NudgeSittingOutError extends AppError {
    constructor(name: string) {
        super('409.004.021', `${name} is sitting out. Bring them back before nudging them.`);
    }
}

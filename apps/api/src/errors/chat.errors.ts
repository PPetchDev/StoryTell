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

/** A previous AI Message's background call failed; it must be retried before the next turn. */
export class BackgroundFailedError extends AppError {
    constructor(failed: BackgroundCallName[] = ['Bonds, Arcs and Scene']) {
        const what = failed.length > 1 ? 'Bonds, Arcs, Scene and Memories' : failed[0];
        super('409.004.008', `The ${what} couldn't update after the previous turn. Retry before sending.`);
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

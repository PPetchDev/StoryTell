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

/** The previous AI Message's background judge was still pending past the wait (spec: story 68). */
export class BackgroundStillSavingError extends AppError {
    constructor() {
        super('409.004.007', 'The previous turn is still saving its Bonds, Arcs and Scene. Try again in a moment.');
    }
}

/** The previous AI Message's background judge failed; it must be retried before the next turn. */
export class BackgroundFailedError extends AppError {
    constructor() {
        super('409.004.008', "The previous turn's Bond, Arc and Scene judge failed. Retry it before sending.");
    }
}

/** A judge retry on a Message whose judge did not fail, or that is not the latest AI Message. */
export class NoFailedJudgeError extends AppError {
    constructor() {
        super('409.004.009', 'There is no failed judge call to retry on that Message.');
    }
}

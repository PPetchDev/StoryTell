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

export class EmptyMessageError extends AppError {
    constructor() {
        super('422.004.005', 'Write something to send.');
    }
}

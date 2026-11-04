import { AppError } from './app-error.js';

/** The model's answer to a draft or rewrite could not be read at all. Show with Retry. */
export class UnreadableDraftError extends AppError {
    constructor(message = "The model's draft could not be read.") {
        super('502.005.001', message);
    }
}

/** The model's draft was readable but does not fit a Story. Nothing is saved. Show with Retry. */
export class InvalidDraftError extends AppError {
    constructor(reason: string) {
        super('502.005.002', `The model's draft does not fit a Story: ${reason}`);
    }
}

export class EmptyIdeaError extends AppError {
    constructor() {
        super('422.005.003', 'Write an idea first, even a short one.');
    }
}

/** A rewrite asked for a field that is not a text field of that part of the Story. */
export class NotRewritableError extends AppError {
    constructor(target: string, field: string) {
        super('422.005.004', `"${field}" is not a text field of the ${target}.`);
    }
}

// --- Story assistant (ticket 23) ---

/** The assistant's answer could not be read at all (no JSON object). Nothing saved. Show with Retry. */
export class UnreadableChangeSetError extends AppError {
    constructor(message = "The assistant's answer could not be read.") {
        super('502.005.005', message);
    }
}

/**
 * A change set that does not fit the Story: an unknown Character or Scene, a field that
 * does not exist, a value outside its set, a bad StartingBond. Nothing is saved. From the
 * model it is a bad gateway (show with Retry); from the client it is the client's mistake.
 */
export class InvalidChangeSetError extends AppError {
    constructor(reason: string, source: 'model' | 'client' = 'model') {
        super(
            source === 'model' ? '502.005.006' : '422.005.007',
            source === 'model'
                ? `The assistant's changes do not fit the Story: ${reason}`
                : `The changes do not fit the Story: ${reason}`,
        );
    }
}

/** A change set removes a Character or Scene and the request did not confirm removals. */
export class RemovalNeedsConfirmationError extends AppError {
    constructor(removals: string[]) {
        super('409.005.008', `These changes would remove ${removals.join(', ')}. Confirm the removals first.`);
    }
}

export class EmptyInstructionError extends AppError {
    constructor() {
        super('422.005.009', 'Write an instruction first, e.g. "give Mira a sister".');
    }
}

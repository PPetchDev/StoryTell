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

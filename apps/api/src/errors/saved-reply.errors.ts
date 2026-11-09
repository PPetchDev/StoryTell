import { AppError } from './app-error.js';
import { SAVED_REPLIES_MAX } from '../model/saved-reply/entities/saved-reply.entity.js';

/** A Saved reply added or edited with nothing but whitespace. */
export class EmptySavedReplyError extends AppError {
    constructor() {
        super('422.008.001', 'A Saved reply needs some text.');
    }
}

/** One more Saved reply than a scope (app-wide, or one Story) holds. */
export class TooManySavedRepliesError extends AppError {
    constructor() {
        super('422.008.002', `You can keep at most ${SAVED_REPLIES_MAX} Saved replies here. Remove one first.`);
    }
}

/** A Saved reply id that isn't in that scope. */
export class SavedReplyNotFoundError extends AppError {
    constructor() {
        super('404.008.003', 'Saved reply not found.');
    }
}

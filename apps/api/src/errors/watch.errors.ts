import { AppError } from './app-error.js';

/** A Watch started while one already runs in the Chat (.scratch/watch-mode/spec.md). Nothing changes. */
export class WatchRunningError extends AppError {
    constructor() {
        super('409.004.160', 'The story is already playing on by itself in this Chat.');
    }
}

/** A Watch started while a Sudden event is under way: its Gauge moves by how the user plays. Nothing changes. */
export class WatchNeedsYouError extends AppError {
    constructor() {
        super('409.004.161', 'A Sudden event is under way. Play it yourself, then watch.');
    }
}

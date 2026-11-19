import { AppError } from './app-error.js';

/** Lore suggestions asked for in a Chat with nothing after its Opening (.scratch/lore-from-chat/spec.md). No call. */
export class NothingToSuggestLoreFromError extends AppError {
    constructor() {
        super('409.004.170', 'Nothing has happened in this Chat yet, so there is no Lore to find in it.');
    }
}

/** A Recap asked for in a Chat with nothing after its Opening (.scratch/previously-on/spec.md). No call. */
export class NothingToRecapError extends AppError {
    constructor() {
        super('409.004.120', 'Nothing has happened in this Chat yet, so there is nothing to recap.');
    }
}

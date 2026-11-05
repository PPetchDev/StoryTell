import { ReplyPart } from './reply-parser.js';

/**
 * A turn asked for as a stream (spec: streaming replies). Without one, a turn answers only
 * once the whole reply is written, as before.
 */
export interface TurnStream {
    /** Aborted when the user stops the reply: the turn then fails as a failed call does. */
    signal: AbortSignal;
    /** The turn passed its gate and the model call starts; errors before this are plain. */
    onStart(): void;
    /** The whole reply so far, parsed and guarded, each time it grows. Last: the stored parts. */
    onParts(parts: ReplyPart[]): void;
}

/**
 * The user stopped a streamed turn. Not an AppError, and in no error catalogue: like the
 * gateway's NetworkError it is an internal signal. The request it would answer is gone, so it
 * never reaches a client; it only unwinds the turn down its failure path.
 */
export class TurnStoppedError extends Error {
    constructor() {
        super('The user stopped the reply.');
        this.name = 'TurnStoppedError';
    }
}

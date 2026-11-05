import { ModelGatewayError, ProviderOutageError } from '../../errors/model-gateway.errors.js';
import {
    ImageCallKind,
    ImageData,
    ImageGenerationRequest,
    ImageGenerationResult,
    MAX_REFERENCE_IMAGES,
    ModelGateway,
    RemainingCredit,
    TextCallKind,
    TextCompletionRequest,
    TextCompletionResult,
    TextStream,
    TextStreamResult,
} from './model-gateway.js';

/**
 * How `streamText` hands a scripted reply out (`completeText` ignores it): in pieces of
 * `pieceSize` characters, `pieceDelayMs` apart, failing with `failWith` (an outage by
 * default) after `failAfterPieces` pieces when that is set.
 */
export interface FakeStreamOptions {
    pieceSize?: number;
    pieceDelayMs?: number;
    failAfterPieces?: number;
    failWith?: ModelGatewayError;
}

const DEFAULT_PIECE_SIZE = 12;

/** A reply is plain text, a partial result to override defaults, or an error to reject with. */
export type FakeTextReply = string | (Partial<TextCompletionResult> & FakeStreamOptions) | ModelGatewayError;
/** `delayMs` holds the reply back, so a browser test can see work in progress. */
export type FakeImageReply = (Partial<ImageGenerationResult> & { delayMs?: number }) | ModelGatewayError;

export type FakeGatewayCall =
    | { method: 'completeText'; request: TextCompletionRequest }
    /** `stopped` turns true when the caller's signal ended the stream. */
    | { method: 'streamText'; request: TextCompletionRequest; stopped: boolean }
    | { method: 'generateImage'; request: ImageGenerationRequest }
    | { method: 'remainingCredit' };

/** A valid 1x1 transparent PNG, the default image a scripted image call returns. */
export const FAKE_PNG: ImageData = {
    bytes: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
        'base64',
    ),
    mimeType: 'image/png',
};

export const FAKE_TEXT_MODEL = 'fake/text-model';
export const FAKE_IMAGE_MODEL = 'fake/image-model';

const DEFAULT_CREDIT: RemainingCredit = {
    text: { remainingUsd: 22, limitUsd: 22 },
    image: { remainingUsd: 8, limitUsd: 8 },
};

/**
 * The only test double in the suite. Tests script replies per call kind, in order, and
 * inspect the calls it received. A call with nothing scripted fails loudly instead of
 * inventing a reply, so a test never passes on output it did not choose.
 */
export class FakeModelGateway extends ModelGateway {
    readonly calls: FakeGatewayCall[] = [];
    private readonly textReplies = new Map<TextCallKind, FakeTextReply[]>();
    private readonly imageReplies = new Map<ImageCallKind, FakeImageReply[]>();
    private credit: RemainingCredit = structuredClone(DEFAULT_CREDIT);

    scriptText(kind: TextCallKind, ...replies: FakeTextReply[]): this {
        this.textReplies.set(kind, [...(this.textReplies.get(kind) ?? []), ...replies]);
        return this;
    }

    scriptImage(kind: ImageCallKind, ...replies: FakeImageReply[]): this {
        this.imageReplies.set(kind, [...(this.imageReplies.get(kind) ?? []), ...replies]);
        return this;
    }

    setRemainingCredit(credit: Partial<RemainingCredit>): this {
        this.credit = { ...this.credit, ...credit };
        return this;
    }

    textCalls(kind?: TextCallKind): TextCompletionRequest[] {
        return this.calls.flatMap((call) =>
            (call.method === 'completeText' || call.method === 'streamText') && (!kind || call.request.kind === kind)
                ? [call.request]
                : [],
        );
    }

    imageCalls(kind?: ImageCallKind): ImageGenerationRequest[] {
        return this.calls.flatMap((call) =>
            call.method === 'generateImage' && (!kind || call.request.kind === kind)
                ? [call.request]
                : [],
        );
    }

    /** Scripted replies not yet consumed, by kind. Handy for asserting a flow made no call. */
    pendingReplies(): Record<string, number> {
        const pending: Record<string, number> = {};
        for (const [kind, replies] of [...this.textReplies, ...this.imageReplies]) {
            if (replies.length > 0) pending[kind] = replies.length;
        }
        return pending;
    }

    reset(): void {
        this.calls.length = 0;
        this.textReplies.clear();
        this.imageReplies.clear();
        this.credit = structuredClone(DEFAULT_CREDIT);
    }

    async completeText(request: TextCompletionRequest): Promise<TextCompletionResult> {
        this.calls.push({ method: 'completeText', request });
        return this.nextTextReply(request).result;
    }

    async streamText(request: TextCompletionRequest, stream: TextStream): Promise<TextStreamResult> {
        const call = { method: 'streamText' as const, request, stopped: false };
        this.calls.push(call);
        const { result, options } = this.nextTextReply(request);
        const { pieceDelayMs, failAfterPieces } = options;
        const fail = () => options.failWith ?? new ProviderOutageError('The fake stream failed partway.');
        const size = Math.max(1, options.pieceSize ?? DEFAULT_PIECE_SIZE);
        let sent = '';
        for (let at = 0, pieces = 0; at < result.text.length; at += size, pieces++) {
            if (failAfterPieces !== undefined && pieces >= failAfterPieces) throw fail();
            if (pieceDelayMs) await abortableDelay(pieceDelayMs, stream.signal);
            if (stream.signal.aborted) {
                call.stopped = true;
                return { ...result, text: sent, usage: { promptTokens: 0, completionTokens: 0 }, costUsd: 0, stopped: true };
            }
            const piece = result.text.slice(at, at + size);
            sent += piece;
            stream.onText(piece);
        }
        // Set, and every piece is out: the stream fails before it completes.
        if (failAfterPieces !== undefined) throw fail();
        return { ...result, stopped: false };
    }

    /** The next scripted reply for the call's kind, split into its result and its stream options. */
    private nextTextReply(request: TextCompletionRequest): { result: TextCompletionResult; options: FakeStreamOptions } {
        const reply = this.textReplies.get(request.kind)?.shift();
        if (reply === undefined) {
            throw new Error(`FakeModelGateway: no scripted reply for text call "${request.kind}"`);
        }
        if (reply instanceof ModelGatewayError) throw reply;

        const { pieceSize, pieceDelayMs, failAfterPieces, failWith, ...partial } = typeof reply === 'string' ? { text: reply } : reply;
        return {
            result: { text: '', model: FAKE_TEXT_MODEL, usage: { promptTokens: 0, completionTokens: 0 }, costUsd: 0, ...partial },
            options: { pieceSize, pieceDelayMs, failAfterPieces, failWith },
        };
    }

    async generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
        this.calls.push({ method: 'generateImage', request });
        const referenceCount = request.referenceImages?.length ?? 0;
        if (referenceCount > MAX_REFERENCE_IMAGES) {
            throw new RangeError(
                `FakeModelGateway: at most ${MAX_REFERENCE_IMAGES} reference images, got ${referenceCount}`,
            );
        }
        const reply = this.imageReplies.get(request.kind)?.shift();
        if (reply === undefined) {
            throw new Error(`FakeModelGateway: no scripted reply for image call "${request.kind}"`);
        }
        if (reply instanceof ModelGatewayError) throw reply;

        const { delayMs, ...result } = reply;
        if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
        return { image: FAKE_PNG, model: FAKE_IMAGE_MODEL, costUsd: 0, ...result };
    }

    async remainingCredit(): Promise<RemainingCredit> {
        this.calls.push({ method: 'remainingCredit' });
        return structuredClone(this.credit);
    }
}

/** Waits `ms`, or less when `signal` aborts first. */
function abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
        if (signal.aborted) return resolve();
        const done = () => {
            clearTimeout(timer);
            signal.removeEventListener('abort', done);
            resolve();
        };
        const timer = setTimeout(done, ms);
        signal.addEventListener('abort', done);
    });
}

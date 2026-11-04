import { ModelGatewayError } from '../../errors/model-gateway.errors.js';
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
} from './model-gateway.js';

/** A reply is plain text, a partial result to override defaults, or an error to reject with. */
export type FakeTextReply = string | Partial<TextCompletionResult> | ModelGatewayError;
/** `delayMs` holds the reply back, so a browser test can see work in progress. */
export type FakeImageReply = (Partial<ImageGenerationResult> & { delayMs?: number }) | ModelGatewayError;

export type FakeGatewayCall =
    | { method: 'completeText'; request: TextCompletionRequest }
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
            call.method === 'completeText' && (!kind || call.request.kind === kind)
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
        const reply = this.textReplies.get(request.kind)?.shift();
        if (reply === undefined) {
            throw new Error(`FakeModelGateway: no scripted reply for text call "${request.kind}"`);
        }
        if (reply instanceof ModelGatewayError) throw reply;

        const partial = typeof reply === 'string' ? { text: reply } : reply;
        return {
            text: '',
            model: FAKE_TEXT_MODEL,
            usage: { promptTokens: 0, completionTokens: 0 },
            costUsd: 0,
            ...partial,
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

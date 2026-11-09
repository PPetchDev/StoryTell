import { Body, Controller, Delete, Get, HttpCode, Post, Put } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

import {
    ModelGatewayError,
    ModelRefusalError,
    OutOfCreditError,
    ProviderOutageError,
    UnparseableOutputError,
} from '../errors/model-gateway.errors.js';
import {
    FakeEmbeddingReply,
    FakeGatewayCall,
    FakeImageReply,
    FakeModelGateway,
    FakeSpeechReply,
    FakeStreamOptions,
    FakeTextReply,
    FakeTranscriptionReply,
} from '../service/model-gateway/fake-model-gateway.js';
import {
    CreditPool,
    EmbeddingCallKind,
    ImageCallKind,
    ModelGateway,
    RemainingCredit,
    SpeechCallKind,
    TextCallKind,
    TextCompletionResult,
} from '../service/model-gateway/model-gateway.js';
import { FakePage, FakePageFetcher } from '../service/page-fetch/fake-page-fetcher.js';

/** A scripted error, as JSON. `pool` applies to `out_of_credit` only. */
export interface ScriptedErrorJson {
    error: 'outage' | 'refusal' | 'out_of_credit' | 'unparseable';
    pool?: CreditPool;
    message?: string;
}

/** A text reply; the stream options shape how `streamText` hands it out (see FakeStreamOptions). */
export type ScriptedTextJson = Partial<TextCompletionResult> & Omit<FakeStreamOptions, 'failWith'> & { failWith?: ScriptedErrorJson };

export interface ScriptTextBody {
    kind: TextCallKind;
    replies: Array<string | ScriptedTextJson | ScriptedErrorJson>;
}

export interface ScriptImageBody {
    kind: ImageCallKind;
    replies: Array<
        { imageBase64?: string; mimeType?: string; model?: string; costUsd?: number; delayMs?: number } | ScriptedErrorJson
    >;
}

/** A page the fake page fetcher answers for `url`. */
export interface ScriptPageBody extends FakePage {
    url: string;
}

/** Transcriptions for Dictation: a text, a partial result, or an error, as for text replies. */
export interface ScriptTranscriptionBody {
    replies: Array<string | { text?: string; delayMs?: number } | ScriptedErrorJson>;
}

/** Speech for Read aloud and voice samples: a partial result (audio as base64), a hold-back, or an error. */
export interface ScriptSpeechBody {
    kind: SpeechCallKind;
    replies: Array<{ audioBase64?: string; characters?: number; costUsd?: number; delayMs?: number } | ScriptedErrorJson>;
}

export interface ScriptEmbeddingBody {
    kind: EmbeddingCallKind;
    replies: Array<'answer' | ScriptedErrorJson>;
}

function toError(json: ScriptedErrorJson): ModelGatewayError {
    switch (json.error) {
        case 'outage':
            return new ProviderOutageError(json.message);
        case 'refusal':
            return new ModelRefusalError(json.message);
        case 'out_of_credit':
            return new OutOfCreditError(json.pool ?? 'text', json.message);
        case 'unparseable':
            return new UnparseableOutputError(json.message);
    }
}

function isScriptedError(reply: unknown): reply is ScriptedErrorJson {
    return typeof reply === 'object' && reply !== null && 'error' in reply;
}

/**
 * Lets Playwright script and inspect the fake gateway inside a separately running API.
 * Mounted only when MODEL_GATEWAY=fake (see AppModule). Not part of the product API.
 */
@ApiExcludeController()
@Controller('testing/fake-gateway')
export class FakeGatewayControlController {
    private readonly fake: FakeModelGateway;

    constructor(
        gateway: ModelGateway,
        private readonly pages: FakePageFetcher,
    ) {
        this.fake = gateway as FakeModelGateway;
    }

    /** Scripts what the fake page fetcher answers for one address (Documents from a web page). */
    @Post('page')
    @HttpCode(204)
    scriptPage(@Body() body: ScriptPageBody): void {
        const { url, ...page } = body;
        this.pages.script(url, page);
    }

    @Post('text')
    @HttpCode(204)
    scriptText(@Body() body: ScriptTextBody): void {
        const replies: FakeTextReply[] = body.replies.map((reply) => {
            if (isScriptedError(reply)) return toError(reply);
            if (typeof reply === 'string' || !reply.failWith) return reply as FakeTextReply;
            return { ...reply, failWith: toError(reply.failWith) };
        });
        this.fake.scriptText(body.kind, ...replies);
    }

    @Post('image')
    @HttpCode(204)
    scriptImage(@Body() body: ScriptImageBody): void {
        const replies: FakeImageReply[] = body.replies.map((reply) => {
            if (isScriptedError(reply)) return toError(reply);
            const { imageBase64, mimeType, ...rest } = reply;
            return imageBase64
                ? {
                      ...rest,
                      image: {
                          bytes: Buffer.from(imageBase64, 'base64'),
                          mimeType: mimeType ?? 'image/png',
                      },
                  }
                : rest;
        });
        this.fake.scriptImage(body.kind, ...replies);
    }

    /** Embeddings answer unscripted; this queues failures (or `'answer'`) for the next calls of a kind. */
    @Post('embedding')
    @HttpCode(204)
    scriptEmbedding(@Body() body: ScriptEmbeddingBody): void {
        this.fake.scriptEmbedding(
            body.kind,
            ...body.replies.map((reply): FakeEmbeddingReply => (isScriptedError(reply) ? toError(reply) : 'answer')),
        );
    }

    @Post('transcription')
    @HttpCode(204)
    scriptTranscription(@Body() body: ScriptTranscriptionBody): void {
        this.fake.scriptTranscription(
            ...body.replies.map((reply): FakeTranscriptionReply => (isScriptedError(reply) ? toError(reply) : reply)),
        );
    }

    @Post('speech')
    @HttpCode(204)
    scriptSpeech(@Body() body: ScriptSpeechBody): void {
        const replies: FakeSpeechReply[] = body.replies.map((reply) => {
            if (isScriptedError(reply)) return toError(reply);
            const { audioBase64, ...rest } = reply;
            return audioBase64 ? { ...rest, audio: { bytes: Buffer.from(audioBase64, 'base64'), mimeType: 'audio/mpeg' as const } } : rest;
        });
        this.fake.scriptSpeech(body.kind, ...replies);
    }

    @Put('credit')
    @HttpCode(204)
    setCredit(@Body() body: Partial<RemainingCredit>): void {
        this.fake.setRemainingCredit(body);
    }

    /** Reference image and recording bytes are summarised, never echoed back. */
    @Get('calls')
    calls(): { calls: unknown[]; pendingReplies: Record<string, number> } {
        const summary = (data: { mimeType: string; bytes: Buffer }) => ({ mimeType: data.mimeType, size: data.bytes.length });
        return {
            calls: this.fake.calls.map((call: FakeGatewayCall) => {
                if (call.method === 'generateImage') {
                    return { ...call, request: { ...call.request, referenceImages: call.request.referenceImages?.map(summary) } };
                }
                if (call.method === 'transcribe') {
                    return { ...call, request: { ...call.request, audio: summary(call.request.audio) } };
                }
                return call;
            }),
            pendingReplies: this.fake.pendingReplies(),
        };
    }

    @Delete()
    @HttpCode(204)
    reset(): void {
        this.fake.reset();
        this.pages.reset();
    }
}

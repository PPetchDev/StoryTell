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
    FakeGatewayCall,
    FakeImageReply,
    FakeModelGateway,
    FakeTextReply,
} from '../service/model-gateway/fake-model-gateway.js';
import {
    CreditPool,
    ImageCallKind,
    ModelGateway,
    RemainingCredit,
    TextCallKind,
    TextCompletionResult,
} from '../service/model-gateway/model-gateway.js';

/** A scripted error, as JSON. `pool` applies to `out_of_credit` only. */
export interface ScriptedErrorJson {
    error: 'outage' | 'refusal' | 'out_of_credit' | 'unparseable';
    pool?: CreditPool;
    message?: string;
}

export interface ScriptTextBody {
    kind: TextCallKind;
    replies: Array<string | Partial<TextCompletionResult> | ScriptedErrorJson>;
}

export interface ScriptImageBody {
    kind: ImageCallKind;
    replies: Array<
        { imageBase64?: string; mimeType?: string; model?: string; costUsd?: number } | ScriptedErrorJson
    >;
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

    constructor(gateway: ModelGateway) {
        this.fake = gateway as FakeModelGateway;
    }

    @Post('text')
    @HttpCode(204)
    scriptText(@Body() body: ScriptTextBody): void {
        const replies: FakeTextReply[] = body.replies.map((reply) =>
            isScriptedError(reply) ? toError(reply) : reply,
        );
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

    @Put('credit')
    @HttpCode(204)
    setCredit(@Body() body: Partial<RemainingCredit>): void {
        this.fake.setRemainingCredit(body);
    }

    /** Reference image bytes are summarised, not echoed back. */
    @Get('calls')
    calls(): { calls: unknown[]; pendingReplies: Record<string, number> } {
        return {
            calls: this.fake.calls.map((call: FakeGatewayCall) =>
                call.method === 'generateImage'
                    ? {
                          ...call,
                          request: {
                              ...call.request,
                              referenceImages: call.request.referenceImages?.map((image) => ({
                                  mimeType: image.mimeType,
                                  size: image.bytes.length,
                              })),
                          },
                      }
                    : call,
            ),
            pendingReplies: this.fake.pendingReplies(),
        };
    }

    @Delete()
    @HttpCode(204)
    reset(): void {
        this.fake.reset();
    }
}

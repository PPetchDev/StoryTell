import { ProviderKeys, TextHost as TextHostName } from '../../../config/app-config.js';
import { CreditBalance, SamplerParam } from '../model-gateway.js';
import { defaultSleep, FetchLike, SleepFn } from './http.js';
import { VENICE_HOST } from './model-table.js';
import { OpenRouterChatRequest, OpenRouterClient, OpenRouterEmbeddingRequest } from './openrouter-client.js';
import { NANOGPT_HOST, NanoGptTextClient } from './nanogpt-text-client.js';
import { VeniceClient } from './venice-client.js';
import { VeniceTextClient } from './venice-text-client.js';

/**
 * The free host's one model (.scratch/text-fallback/spec.md). Picked on 2026-11-17 as the best free
 * model for roleplay, and tried once with a full turn prompt and a Judge prompt: 3.4 s, $0, no
 * reasoning tokens, a natural reply and valid Judge JSON. OpenRouter lists `temperature` and
 * `top_p` for it, but not `stop`, `min_p`, `repetition_penalty` or `response_format`.
 */
export const FREE_TEXT_MODEL = { id: 'nvidia/nemotron-3-ultra-550b-a55b:free', name: 'nemotron-3-ultra-free' } as const;

/** The samplers the free model takes; the others are left out rather than sent to be ignored. */
const FREE_SAMPLER_NAMES: Partial<Record<SamplerParam, string>> = { temperature: 'temperature', topP: 'top_p' };

/**
 * A free model on OpenRouter, for every text kind, play and background, while the paid hosts have
 * no credit. Free models still answer on an OpenRouter account whose balance is below zero.
 */
export class FreeTextClient extends OpenRouterClient {
    protected readonly label = 'OpenRouter (free model)';

    constructor(apiKey: string | undefined, fetchImpl: FetchLike, sleep: SleepFn = defaultSleep) {
        super(apiKey, fetchImpl, sleep);
    }

    /** The JSON body a request becomes on the free host. Exposed so contract tests can check it. */
    static buildFreeBody(request: OpenRouterChatRequest): Record<string, unknown> {
        // No `provider`: OpenRouter routes a free model to whichever host serves it, and pinning DeepInfra would find none.
        const body: Record<string, unknown> = {
            model: FREE_TEXT_MODEL.id,
            messages: request.messages,
            reasoning: { enabled: false },
            usage: { include: true },
        };
        if (request.maxTokens !== undefined) body.max_tokens = request.maxTokens;
        // Not listed for the model, but OpenRouter passes them on where it can and drops them where it can't;
        // the reply parser cuts a line written as the user, and the Judge prompt asks for JSON in words.
        if (request.json) body.response_format = { type: 'json_object' };
        if (request.stop?.length) body.stop = request.stop;
        for (const [param, value] of Object.entries(request.samplers ?? {}) as Array<[SamplerParam, number | undefined]>) {
            const name = FREE_SAMPLER_NAMES[param];
            if (name && value !== undefined) body[name] = value;
        }
        return body;
    }

    protected chatBody(request: OpenRouterChatRequest): Record<string, unknown> {
        return FreeTextClient.buildFreeBody(request);
    }

    protected embeddingBody(_request: OpenRouterEmbeddingRequest): Record<string, unknown> {
        throw new RangeError('The free host has no embedding model.');
    }

    protected costOf(): number {
        return 0;
    }

    /** A free model has no balance to run out of. */
    async credit(): Promise<CreditBalance> {
        return { remainingUsd: null, limitUsd: null };
    }
}

/** One host of the text chain, as the gateway sends to it and records it. */
export interface TextHost {
    name: TextHostName;
    client: OpenRouterClient;
    /** The host UsageRecords carry; undefined, the host the model table pins (DeepInfra). */
    recordedHost: string | undefined;
    /** The model UsageRecords carry, where the host answers every kind with its own model. */
    ownModel: string | undefined;
    /** False for the free host, which has no embedding model. */
    embeds: boolean;
    /** Whether a stopped stream's bill can be looked up afterwards (OpenRouter's generation endpoint). */
    looksUpStoppedBills: boolean;
    /**
     * Whether a call this host stays busy for (a 429 or 503 through every retry) moves on to the next
     * host, as one out of credit does. NanoGPT's only (.scratch/nanogpt-provider/spec.md): a used-up
     * Weekly allowance answers 429 too, and the next host is a different backend.
     */
    movesOnWhenBusy?: boolean;
    /** The balance this host spends. */
    credit(): Promise<CreditBalance>;
}

/** What UsageRecords name the free host. */
export const FREE_HOST = 'openrouter-free';

/** The chain `TEXT_HOSTS` names, in its order. */
export function buildTextHosts(
    names: readonly TextHostName[],
    keys: Pick<ProviderKeys, 'openRouter' | 'venice' | 'nanoGpt'>,
    fetchImpl: FetchLike,
    venice: VeniceClient,
    sleep: SleepFn = defaultSleep,
): TextHost[] {
    return names.map((name): TextHost => {
        switch (name) {
            case 'openrouter': {
                const client = new OpenRouterClient(keys.openRouter, fetchImpl, sleep);
                return { name, client, recordedHost: undefined, ownModel: undefined, embeds: true, looksUpStoppedBills: true, credit: () => client.credit() };
            }
            case 'venice':
                // .scratch/venice-text/spec.md: text on Venice spends the balance images do.
                return {
                    name,
                    client: new VeniceTextClient(keys.venice, fetchImpl, sleep),
                    recordedHost: VENICE_HOST,
                    ownModel: undefined,
                    embeds: true,
                    looksUpStoppedBills: false,
                    credit: () => venice.credit(),
                };
            case 'nanogpt': {
                const client = new NanoGptTextClient(keys.nanoGpt, fetchImpl, sleep);
                return {
                    name,
                    client,
                    recordedHost: NANOGPT_HOST,
                    ownModel: undefined,
                    embeds: false,
                    looksUpStoppedBills: false,
                    movesOnWhenBusy: true,
                    credit: () => client.credit(),
                };
            }
            case 'free': {
                const client = new FreeTextClient(keys.openRouter, fetchImpl, sleep);
                return { name, client, recordedHost: FREE_HOST, ownModel: FREE_TEXT_MODEL.name, embeds: false, looksUpStoppedBills: false, credit: () => client.credit() };
            }
        }
    });
}

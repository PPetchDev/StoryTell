import { FetchLike } from '../../src/service/model-gateway/real/http.js';
import { NanoGptTextClient } from '../../src/service/model-gateway/real/nanogpt-text-client.js';
import { OpenRouterClient, OpenRouterEmbeddingRequest, OpenRouterEmbeddingResult } from '../../src/service/model-gateway/real/openrouter-client.js';

/** The hosts an eval run can send its text calls to (`--host`, .scratch/nanogpt-provider/spec.md: "Evals"). */
export const EVAL_HOSTS = ['openrouter', 'nanogpt'] as const;
export type EvalHost = (typeof EVAL_HOSTS)[number];

/** `EVAL_HOST`, OpenRouter when unset, so a run compares with the runs before it. */
export function evalHost(env: NodeJS.ProcessEnv): EvalHost {
    const host = env.EVAL_HOST || 'openrouter';
    if (!(EVAL_HOSTS as readonly string[]).includes(host)) throw new RangeError(`--host must be one of ${EVAL_HOSTS.join(', ')}, got "${host}"`);
    return host as EvalHost;
}

/** NanoGPT for text, OpenRouter for embeddings: bge-m3 is not on NanoGPT's subscription. */
class EvalNanoGptClient extends NanoGptTextClient {
    constructor(
        key: string | undefined,
        fetchImpl: FetchLike,
        private readonly embeddings: OpenRouterClient,
    ) {
        super(key, fetchImpl);
    }

    embed(request: OpenRouterEmbeddingRequest): Promise<OpenRouterEmbeddingResult> {
        return this.embeddings.embed(request);
    }
}

/**
 * The client an eval run sends its text calls through. On NanoGPT they spend the Weekly allowance,
 * not credit, and each costs $0; embeddings still go to OpenRouter. Says which host once per run.
 */
export function evalTextClient(env: NodeJS.ProcessEnv, fetchImpl: FetchLike): OpenRouterClient {
    const openRouter = new OpenRouterClient(env.OPENROUTER_API_KEY, fetchImpl);
    const host = evalHost(env);
    console.log(`Text host: ${host}${host === 'nanogpt' ? " (spends NanoGPT's Weekly allowance, $0 a call; embeddings stay on OpenRouter)" : ''}`);
    return host === 'nanogpt' ? new EvalNanoGptClient(env.NANOGPT_API_KEY, fetchImpl, openRouter) : openRouter;
}

/** What a run spends, for its refusal without --spend: credit on OpenRouter, the Weekly allowance on NanoGPT. */
export function spendsWhat(env: NodeJS.ProcessEnv): string {
    return evalHost(env) === 'nanogpt' ? "spends NanoGPT's Weekly allowance (no credit for text; any embeddings still on OpenRouter)" : 'spends OpenRouter credit';
}

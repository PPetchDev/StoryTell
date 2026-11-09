import { ReplyLength } from '../../model/story/entities/story.entity.js';
import {
    PLAY_MODEL_CATALOGUE,
    PLAY_MODELS,
    PlayModel,
    SAMPLER_PARAMS,
    SAMPLER_RANGES,
    SamplerParam,
} from '../../service/model-gateway/model-gateway.js';
import { REPLY_LENGTH_WORDS, TURN_PROMPT_TOKEN_BUDGET } from '../chat/turn/prompt.js';

export interface PlayModelOption {
    id: PlayModel;
    /** Its name and the host that serves it. Every play model is pinned to DeepInfra (spec: "More play models"). */
    label: string;
    priceUsdPerMillion: { input: number; output: number; cachedInput: number };
    /** Roughly what a long turn costs: the full turn prompt uncached plus a Long reply, to the cent. */
    longTurnUsd: number;
    /** The parameters this model is offered, in SAMPLER_PARAMS order. */
    samplers: Array<{ param: SamplerParam; min: number; max: number; step: number; suggested: number | null }>;
}

/** The play models Settings offers, in PLAY_MODELS order, from the catalogue. */
export function playModelOptions(): PlayModelOption[] {
    return PLAY_MODELS.map((id) => {
        const facts = PLAY_MODEL_CATALOGUE[id];
        return {
            id,
            label: `${facts.name} (DeepInfra)`,
            priceUsdPerMillion: { ...facts.priceUsdPerMillion },
            longTurnUsd: longTurnUsd(facts.priceUsdPerMillion),
            samplers: SAMPLER_PARAMS.filter((param) => facts.samplers.includes(param)).map((param) => ({
                param,
                ...SAMPLER_RANGES[param],
                suggested: facts.suggested[param] ?? null,
            })),
        };
    });
}

/** Spec: the turn prompt budget at the uncached input price plus the Long reply's `maxTokens` at the output price; at least $0.01. */
function longTurnUsd(price: { input: number; output: number }): number {
    const usd =
        (TURN_PROMPT_TOKEN_BUDGET * price.input + REPLY_LENGTH_WORDS[ReplyLength.Long].maxTokens * price.output) / 1_000_000;
    return Math.max(0.01, Math.round(usd * 100) / 100);
}

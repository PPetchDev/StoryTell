import { Injectable } from '@nestjs/common';

import { ModelGateway, ServedFor } from '../../../service/model-gateway/model-gateway.js';
import { buildMeanwhilePrompt, MeanwhilePromptInput, ReadMeanwhile, readMeanwhile } from './meanwhile.js';

/**
 * .scratch/meanwhile/spec.md: one background-model call in which the Characters away from the
 * moment each take a step on their own. It only writes: the Chat manager decides when, and keeps it.
 */
@Injectable()
export class MeanwhileManagerService {
    constructor(private readonly gateway: ModelGateway) {}

    /** Throws the gateway's typed error; an answer that cannot be read is null. */
    async write(input: MeanwhilePromptInput, servedFor: ServedFor): Promise<{ read: ReadMeanwhile[] | null; model: string }> {
        const prompt = buildMeanwhilePrompt(input);
        const result = await this.gateway.completeText({ kind: 'meanwhile', messages: prompt.messages, maxTokens: prompt.maxTokens, servedFor });
        return {
            read: readMeanwhile(
                result.text,
                input.actors.map((actor) => actor.character.name),
                input.identityName,
            ),
            model: result.model,
        };
    }
}

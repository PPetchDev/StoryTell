import { Injectable } from '@nestjs/common';

import { ModelGateway, ServedFor } from '../../../service/model-gateway/model-gateway.js';
import { buildThoughtPrompt, readThought, THOUGHT_TIMEOUT_MS, ThoughtPromptInput } from './thoughts.js';

/**
 * .scratch/character-minds/spec.md: one background-model call that writes a Character's Thought,
 * under its own call kind in the text pool. It only thinks: the Chat manager decides who and when.
 */
@Injectable()
export class ThoughtsManagerService {
    constructor(private readonly gateway: ModelGateway) {}

    /**
     * The thought, or null when the call failed, came back empty or took longer than
     * `THOUGHT_TIMEOUT_MS`: a reply is never held up or stopped by a missing Thought.
     */
    async think(input: ThoughtPromptInput, servedFor: ServedFor): Promise<{ text: string | null; error: string | null }> {
        const prompt = buildThoughtPrompt(input);
        let timer: ReturnType<typeof setTimeout> | undefined;
        const late = new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error(`no answer within ${THOUGHT_TIMEOUT_MS} ms`)), THOUGHT_TIMEOUT_MS);
        });
        try {
            const result = await Promise.race([
                this.gateway.completeText({ kind: 'character_thought', messages: prompt.messages, maxTokens: prompt.maxTokens, servedFor }),
                late,
            ]);
            const text = readThought(result.text, input.character.name);
            return { text, error: text === null ? 'an empty answer' : null };
        } catch (error) {
            return { text: null, error: error instanceof Error ? error.message : String(error) };
        } finally {
            clearTimeout(timer);
        }
    }
}

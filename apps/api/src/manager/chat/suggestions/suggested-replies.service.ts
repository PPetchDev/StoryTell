import { Injectable } from '@nestjs/common';

import { ModelGateway, ServedFor } from '../../../service/model-gateway/model-gateway.js';
import { buildSuggestionsPrompt, parseSuggestions, SuggestedReply, SuggestionsPromptInput } from './suggestions-prompt.js';

/**
 * Spec: "Suggested replies". One play-model call, under its own call kind so the Usage page
 * can show what it costs, in the text pool like every text call. Nothing is stored: the
 * suggestions only fill the composer, and are never part of the Chat's history.
 */
@Injectable()
export class SuggestedRepliesManagerService {
    constructor(private readonly gateway: ModelGateway) {}

    /** Throws the gateway's typed error, or `UnreadableSuggestionsError` for output that isn't three of the three kinds. */
    async suggest(input: SuggestionsPromptInput, servedFor: ServedFor): Promise<SuggestedReply[]> {
        const prompt = buildSuggestionsPrompt(input);
        const result = await this.gateway.completeText({
            kind: 'suggested_replies',
            messages: prompt.messages,
            maxTokens: prompt.maxTokens,
            json: true,
            servedFor,
        });
        return parseSuggestions(result.text);
    }
}

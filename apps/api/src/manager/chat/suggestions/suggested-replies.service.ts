import { Injectable, Logger } from '@nestjs/common';

import { UnreadableSuggestionsError } from '../../../errors/chat.errors.js';

import { ModelGateway, ServedFor } from '../../../service/model-gateway/model-gateway.js';
import { buildSuggestionsPrompt, parseSuggestions, SuggestedReply, SuggestionsPromptInput } from './suggestions-prompt.js';

/**
 * Spec: "Suggested replies". One play-model call, under its own call kind so the Usage page
 * can show what it costs, in the text pool like every text call. Nothing is stored: the
 * suggestions only fill the composer, and are never part of the Chat's history.
 */
@Injectable()
export class SuggestedRepliesManagerService {
    private readonly logger = new Logger(SuggestedRepliesManagerService.name);

    constructor(private readonly gateway: ModelGateway) {}

    /** Throws the gateway's typed error, or `UnreadableSuggestionsError` for output that isn't three of the three kinds. */
    async suggest(input: SuggestionsPromptInput, servedFor: ServedFor): Promise<SuggestedReply[]> {
        const prompt = buildSuggestionsPrompt(input);
        const result = await this.gateway.completeText({
            kind: 'suggested_replies',
            messages: prompt.messages,
            maxTokens: prompt.maxTokens,
            // No JSON mode: with it, GLM-5.3 on DeepInfra packed or ran on its three options (1 of 5 readable,
            // against 15 of 15 without it, 2026-11-05). The prompt still asks for JSON, and the parser finds it.
            json: false,
            servedFor,
        });
        try {
            return parseSuggestions(result.text);
        } catch (error) {
            // The raw answer, kept short, so an unreadable one can be told apart from a refusal or a cut-off.
            if (error instanceof UnreadableSuggestionsError) {
                this.logger.warn(`Unreadable suggestions (${result.model}, ${result.text.length} chars): ${JSON.stringify(result.text.slice(0, 600))}`);
            }
            throw error;
        }
    }
}

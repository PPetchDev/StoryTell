import { Injectable, Logger } from '@nestjs/common';

import { UnreadableWriteForMeError } from '../../../errors/chat.errors.js';

import { ModelGateway, ServedFor } from '../../../service/model-gateway/model-gateway.js';
import { buildWriteForMePrompt, readWriteForMe, WriteForMePromptInput } from './write-for-me-prompt.js';

/**
 * .scratch/write-for-me/spec.md: one play-model call that writes the user's next Message as the
 * worn identity, from the composer's draft or from nothing. Under its own call kind, in the
 * text pool. Nothing is stored: the text only fills the composer.
 */
@Injectable()
export class WriteForMeManagerService {
    private readonly logger = new Logger(WriteForMeManagerService.name);

    constructor(private readonly gateway: ModelGateway) {}

    /** Throws the gateway's typed error, or `UnreadableWriteForMeError` for an answer with nothing left. */
    async write(input: WriteForMePromptInput, servedFor: ServedFor): Promise<string> {
        const prompt = buildWriteForMePrompt(input);
        const result = await this.gateway.completeText({
            kind: 'write_for_me',
            messages: prompt.messages,
            maxTokens: prompt.maxTokens,
            stop: prompt.stop,
            servedFor,
        });
        try {
            return readWriteForMe(result.text, input.identity.name);
        } catch (error) {
            if (error instanceof UnreadableWriteForMeError) {
                this.logger.warn(`Unreadable Write for me (${result.model}, ${result.text.length} chars): ${JSON.stringify(result.text.slice(0, 600))}`);
            }
            throw error;
        }
    }
}

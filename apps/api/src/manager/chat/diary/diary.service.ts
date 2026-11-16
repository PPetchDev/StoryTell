import { Injectable, Logger } from '@nestjs/common';

import { UnreadableDiaryEntryError } from '../../../errors/chat.errors.js';
import { ModelGateway, ServedFor } from '../../../service/model-gateway/model-gateway.js';
import { buildDiaryPrompt, DiaryPromptInput, ReadDiaryEntry, readDiaryEntry } from './diary.js';

/**
 * .scratch/diary/spec.md: one play-model call that writes a Character's Diary entry, under its own
 * call kind in the text pool. It only writes: the Chat manager decides when and keeps the entry.
 */
@Injectable()
export class DiaryManagerService {
    private readonly logger = new Logger(DiaryManagerService.name);

    constructor(private readonly gateway: ModelGateway) {}

    /** Throws the gateway's typed error, or `UnreadableDiaryEntryError` for an answer with nothing in it. */
    async write(input: DiaryPromptInput, servedFor: ServedFor): Promise<ReadDiaryEntry> {
        const prompt = buildDiaryPrompt(input);
        const result = await this.gateway.completeText({ kind: 'diary_entry', messages: prompt.messages, maxTokens: prompt.maxTokens, servedFor });
        try {
            return readDiaryEntry(result.text, input.character.name);
        } catch (error) {
            if (error instanceof UnreadableDiaryEntryError) this.logger.warn(`Empty Diary entry (${result.model}) for ${input.character.name}`);
            throw error;
        }
    }
}

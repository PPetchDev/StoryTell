import { Injectable, Logger } from '@nestjs/common';

import { MessageNotFoundError, UnreadableThaiReadingError } from '../../../errors/chat.errors.js';
import { ChatModelService } from '../../../model/chat/chat.service.js';
import { ModelGateway, ServedFor } from '../../../service/model-gateway/model-gateway.js';
import { buildThaiReadingPrompt, readThaiReading, THAI_READINGS_PER_MESSAGE } from './thai-reading.js';

/**
 * .scratch/write-for-me/spec.md, "Thai reading": one background-model call per reading, under
 * its own call kind in the text pool, kept under the fingerprint of the text it translated.
 */
@Injectable()
export class ThaiReadingManagerService {
    private readonly logger = new Logger(ThaiReadingManagerService.name);

    constructor(
        private readonly gateway: ModelGateway,
        private readonly chatModel: ChatModelService,
    ) {}

    /**
     * Makes a new reading of `source` and keeps it, at most five per Message (one per Reply
     * version), the oldest going first. A reading saved meanwhile for the same text (a double
     * tap) wins and is answered. Throws the gateway's typed error, `UnreadableThaiReadingError`
     * for an empty answer, or `MessageNotFoundError` when the Message went during the call.
     */
    async make(messageId: number, source: string, fingerprint: string, names: string[], servedFor: ServedFor): Promise<string> {
        const prompt = buildThaiReadingPrompt({ source, names });
        const result = await this.gateway.completeText({ kind: 'thai_reading', messages: prompt.messages, maxTokens: prompt.maxTokens, servedFor });
        let text: string;
        try {
            text = readThaiReading(result.text);
        } catch (error) {
            if (error instanceof UnreadableThaiReadingError) this.logger.warn(`Empty Thai reading (${result.model}) for Message ${messageId}`);
            throw error;
        }
        const readings = await this.chatModel.insertThaiReading(messageId, fingerprint, text);
        if (readings === null) throw new MessageNotFoundError();
        const dropped = readings.slice(THAI_READINGS_PER_MESSAGE).filter((reading) => reading.sourceFingerprint !== fingerprint);
        await this.chatModel.deleteThaiReadings(dropped.map((reading) => reading.id));
        return readings.find((reading) => reading.sourceFingerprint === fingerprint)!.text;
    }
}

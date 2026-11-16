import { Injectable } from '@nestjs/common';

import { ModelGateway, ServedFor } from '../../../service/model-gateway/model-gateway.js';
import { acceptRepair, buildRepairPrompt, REPAIR_TIMEOUT_MS, RepairInput } from './speech-repair.js';

/**
 * .scratch/natural-speech/line-repair.md: one play-model call that says a speech line again the
 * way the Character would actually say it, under its own call kind in the text pool.
 */
@Injectable()
export class SpeechRepairManagerService {
    constructor(private readonly gateway: ModelGateway) {}

    /** The repaired line, or null with why it was not taken: the line is then kept as written. */
    async repair(input: RepairInput, servedFor: ServedFor): Promise<{ line: string | null; reason: string | null }> {
        const prompt = buildRepairPrompt(input);
        let timer: ReturnType<typeof setTimeout> | undefined;
        const late = new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error(`no answer within ${REPAIR_TIMEOUT_MS} ms`)), REPAIR_TIMEOUT_MS);
        });
        try {
            const result = await Promise.race([
                this.gateway.completeText({ kind: 'speech_repair', messages: prompt.messages, maxTokens: prompt.maxTokens, servedFor }),
                late,
            ]);
            const line = acceptRepair(result.text, input);
            return { line, reason: line === null ? 'the answer was empty, too long, or no better' : null };
        } catch (error) {
            return { line: null, reason: error instanceof Error ? error.message : String(error) };
        } finally {
            clearTimeout(timer);
        }
    }
}

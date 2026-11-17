import { Injectable } from '@nestjs/common';

import { ModelGateway, ServedFor } from '../../../service/model-gateway/model-gateway.js';
import { acceptRepair, buildRepairPrompt, firstRepairAnswer, RepairInput } from './speech-repair.js';

/**
 * .scratch/natural-speech/line-repair.md: one play-model call that says a speech line again the
 * way the Character would actually say it, under its own call kind in the text pool. When the play
 * model fails or is slow, the same call goes once to the background model
 * (`speech_repair_fallback`), inside the same time limit.
 */
@Injectable()
export class SpeechRepairManagerService {
    constructor(private readonly gateway: ModelGateway) {}

    /** The repaired line, or null with why it was not taken: the line is then kept as written. */
    async repair(input: RepairInput, servedFor: ServedFor): Promise<{ line: string | null; reason: string | null }> {
        const prompt = buildRepairPrompt(input);
        const ask = (kind: 'speech_repair' | 'speech_repair_fallback') => () =>
            this.gateway.completeText({ kind, messages: prompt.messages, maxTokens: prompt.maxTokens, servedFor }).then((result) => result.text);
        const answer = await firstRepairAnswer(ask('speech_repair'), ask('speech_repair_fallback'));
        if (answer.text === null) return { line: null, reason: answer.failures.join('; ') };
        const line = acceptRepair(answer.text, input);
        if (line !== null) return { line, reason: null };
        return { line: null, reason: [...answer.failures, `${answer.by} model: the answer was empty, too long, or no better`].join('; ') };
    }
}

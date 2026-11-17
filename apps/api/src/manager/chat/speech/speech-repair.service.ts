import { Injectable } from '@nestjs/common';

import { ModelGateway, ServedFor } from '../../../service/model-gateway/model-gateway.js';
import { buildRepairPrompt, firstRepairAnswer, judgeRepair, RepairFailure, RepairInput } from './speech-repair.js';

/** One repair's outcome, with what the model answered, so the API log can show what it changed. */
export interface RepairResult {
    /** The repaired line, or null when the line is kept as written. */
    line: string | null;
    /** Why it was kept as written; null when repaired. */
    reason: RepairFailure | null;
    /** The model's raw answer; null when none came. */
    answer: string | null;
    /** Each model that failed or was late, and why ("play model: no answer within 6000 ms"); null when none did. */
    error: string | null;
}

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
    async repair(input: RepairInput, servedFor: ServedFor): Promise<RepairResult> {
        const prompt = buildRepairPrompt(input);
        const ask = (kind: 'speech_repair' | 'speech_repair_fallback') => () =>
            this.gateway.completeText({ kind, messages: prompt.messages, maxTokens: prompt.maxTokens, servedFor }).then((result) => result.text);
        const answer = await firstRepairAnswer(ask('speech_repair'), ask('speech_repair_fallback'));
        const error = answer.failures.length > 0 ? answer.failures.join('; ') : null;
        if (answer.text === null) {
            // Nothing came: a timeout when every model was only late, otherwise a failed call.
            const late = answer.failures.every((failure) => failure.includes('no answer within'));
            return { line: null, reason: late ? 'timeout' : 'error', answer: null, error };
        }
        const verdict = judgeRepair(answer.text, input);
        return { line: verdict.line, reason: verdict.refused, answer: answer.text, error: error === null ? null : `${error}; answered by the ${answer.by} model` };
    }
}

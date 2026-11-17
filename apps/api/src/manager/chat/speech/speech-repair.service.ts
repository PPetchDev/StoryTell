import { Injectable } from '@nestjs/common';

import { ModelGateway, ServedFor } from '../../../service/model-gateway/model-gateway.js';
import { buildRepairPrompt, judgeRepair, REPAIR_TIMEOUT_MS, RepairFailure, RepairInput } from './speech-repair.js';

/** No answer within REPAIR_TIMEOUT_MS: told apart from a failed call, so the log says which. */
class RepairTimeoutError extends Error {}

/** One repair's outcome, with what the model answered, so the API log can show what it changed. */
export interface RepairResult {
    /** The repaired line, or null when the line is kept as written. */
    line: string | null;
    /** Why it was kept as written; null when repaired. */
    reason: RepairFailure | null;
    /** The model's raw answer; null when none came. */
    answer: string | null;
    /** The failed call's message, when `reason` is 'timeout' or 'error'. */
    error: string | null;
}

/**
 * .scratch/natural-speech/line-repair.md: one play-model call that says a speech line again the
 * way the Character would actually say it, under its own call kind in the text pool.
 */
@Injectable()
export class SpeechRepairManagerService {
    constructor(private readonly gateway: ModelGateway) {}

    /** The repaired line, or null with why it was not taken: the line is then kept as written. */
    async repair(input: RepairInput, servedFor: ServedFor): Promise<RepairResult> {
        const prompt = buildRepairPrompt(input);
        let timer: ReturnType<typeof setTimeout> | undefined;
        const late = new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new RepairTimeoutError(`no answer within ${REPAIR_TIMEOUT_MS} ms`)), REPAIR_TIMEOUT_MS);
        });
        try {
            const result = await Promise.race([
                this.gateway.completeText({ kind: 'speech_repair', messages: prompt.messages, maxTokens: prompt.maxTokens, servedFor }),
                late,
            ]);
            const verdict = judgeRepair(result.text, input);
            return { line: verdict.line, reason: verdict.refused, answer: result.text, error: null };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return { line: null, reason: error instanceof RepairTimeoutError ? 'timeout' : 'error', answer: null, error: message };
        } finally {
            clearTimeout(timer);
        }
    }
}

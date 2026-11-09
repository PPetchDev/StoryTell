'use client';

import { useEffect, useState } from 'react';

import type { ReplaceRuleLogic } from '@/lib/replace-rules';

/** How long "Try it" lets a rule run, the same limit as the API's save check. */
export const TRY_TIME_LIMIT_MS = 250;

export type TryState = { status: 'idle' } | { status: 'running' } | { status: 'done'; output: string } | { status: 'slow' };

/**
 * Runs one rule over a sample in a Web Worker, never on the page's thread (spec: "Management
 * UI"), and terminates it after the time limit. A new rule or sample terminates a run still going
 * and starts another. `rule` null (a Find that doesn't compile, or is empty) runs nothing.
 */
export function useTryRule(rule: ReplaceRuleLogic | null, sample: string): TryState {
    const [state, setState] = useState<TryState>({ status: 'idle' });
    const key = rule && sample !== '' ? JSON.stringify([rule, sample]) : null;

    useEffect(() => {
        if (key === null) {
            setState({ status: 'idle' });
            return;
        }
        const [job, text] = JSON.parse(key) as [ReplaceRuleLogic, string];
        setState({ status: 'running' });
        const worker = new Worker(new URL('./try-rule.worker.ts', import.meta.url), { type: 'module' });
        let limit: ReturnType<typeof setTimeout> | undefined;
        const stop = () => {
            clearTimeout(limit);
            worker.terminate();
        };
        worker.onmessage = (event: MessageEvent<{ ready?: true; output?: string }>) => {
            if (event.data.ready) {
                limit = setTimeout(() => {
                    stop();
                    setState({ status: 'slow' });
                }, TRY_TIME_LIMIT_MS);
                worker.postMessage({ rule: job, text });
                return;
            }
            stop();
            setState({ status: 'done', output: event.data.output ?? '' });
        };
        return stop;
    }, [key]);

    return state;
}

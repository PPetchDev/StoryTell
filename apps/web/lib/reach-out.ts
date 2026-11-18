import { apiFetch, apiSend } from '@/lib/api';

/** "Characters message first" (.scratch/reach-outs/spec.md): a Chat's own setting. */

/** Hours away before a Character messages the user first; null while off (the default). */
export type ReachOutHours = 6 | 12 | 24 | null;

export const REACH_OUT_CHOICES: ReadonlyArray<{ hours: ReachOutHours; label: string }> = [
    { hours: null, label: 'Off' },
    { hours: 6, label: 'After 6 hours' },
    { hours: 12, label: 'After 12 hours' },
    { hours: 24, label: 'After 24 hours' },
];

/** The Chat menu's sub line: "Off" or "After 12 hours away". */
export function reachOutSummary(hours: ReachOutHours | undefined): string {
    if (hours === undefined) return 'When you have been away a while';
    return hours === null ? 'Off' : `After ${hours} hours away`;
}

export const reachOutApi = {
    get: (storyId: number, chatId: number) => apiFetch<{ afterHours: ReachOutHours }>(`/stories/${storyId}/chats/${chatId}/reach-out`),
    set: (storyId: number, chatId: number, afterHours: ReachOutHours) =>
        apiSend<{ afterHours: ReachOutHours }>('PUT', `/stories/${storyId}/chats/${chatId}/reach-out`, { afterHours }),
};

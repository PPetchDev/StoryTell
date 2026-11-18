import { useEffect, useMemo, useState } from 'react';

import { apiFetch } from './api';
import { backgroundPending, Chat } from './chat';
import { devicePreference } from './device-preference';
import { CallKind } from './types';

/** One call kind's part of what a reply cost (.scratch/cost-view/spec.md). */
export interface ReplyKindCost {
    kind: CallKind;
    costUsd: number;
    calls: number;
    /** The prompt cache of its text calls that reported one; null when none did. */
    cache: { promptTokens: number; cachedTokens: number } | null;
}

/** What one AI Message cost: every call it caused, every Reply version included. */
export interface ReplyCost {
    messageId: number;
    costUsd: number;
    calls: number;
    /** Most spent first. */
    byKind: ReplyKindCost[];
}

export interface ChatCosts {
    chatId: number;
    messages: ReplyCost[];
}

/** Each reply's cost, by Message id. */
export type ReplyCosts = ReadonlyMap<number, ReplyCost>;

const showReplyCost = devicePreference<boolean>({
    key: 'storytell.showReplyCost',
    fallback: false,
    parse: (stored) => (stored === 'on' ? true : stored === 'off' ? false : null),
    // Off is the default, so it leaves nothing stored.
    serialise: (on) => (on ? 'on' : null),
});

/** Settings' "Show cost per reply" (.scratch/cost-view/spec.md). Off by default, kept on this device only. */
export const setShowReplyCost = showReplyCost.set;
export const useShowReplyCost = showReplyCost.useValue;

/** Four decimals under a dollar, so a reply of a cent or two still shows which; two from a dollar up. */
export function replyUsd(amount: number): string {
    return amount < 1 ? `$${amount.toFixed(4)}` : `$${amount.toFixed(2)}`;
}

/** Of a group's prompt tokens, the share read from the cache, in whole percent; null without any. */
export function cachedPercent(cache: ReplyKindCost['cache']): number | null {
    if (!cache || cache.promptTokens <= 0) return null;
    return Math.round((100 * cache.cachedTokens) / cache.promptTokens);
}

/**
 * The Chat's reply costs while "Show cost per reply" is on; null while it is off or not read yet.
 * Read again when the Messages change and when the newest reply's background calls finish, since
 * they add to its cost. A failed read just shows no costs: they are never in the way of play.
 */
export function useReplyCosts(chat: Pick<Chat, 'id' | 'storyId' | 'messages' | 'diaryWriting'>): ReplyCosts | null {
    const on = useShowReplyCost();
    const [costs, setCosts] = useState<{ chatId: number; byMessage: ReplyCosts } | null>(null);
    const pending = backgroundPending(chat as Chat);
    const key = useMemo(
        () => chat.messages.map((message) => (message.kind === 'ai' ? `${message.id}.${message.versions?.current ?? 0}.${message.versions?.count ?? 0}` : message.id)).join(','),
        [chat.messages],
    );

    useEffect(() => {
        if (!on) return;
        let cancelled = false;
        apiFetch<ChatCosts>(`/stories/${chat.storyId}/chats/${chat.id}/costs`).then(
            (read) => {
                if (!cancelled) setCosts({ chatId: read.chatId, byMessage: new Map(read.messages.map((cost) => [cost.messageId, cost])) });
            },
            () => undefined,
        );
        return () => {
            cancelled = true;
        };
    }, [on, chat.storyId, chat.id, key, pending]);

    return on && costs?.chatId === chat.id ? costs.byMessage : null;
}

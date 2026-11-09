import { devicePreference } from './device-preference';

/**
 * How a Chat shows (.scratch/chat-looks/spec.md, "Visual novel view"): the thread, or the Visual
 * novel view. A per-device preference for every Chat; the thread until the user switches.
 */
export type ChatView = 'thread' | 'novel';

const chatView = devicePreference<ChatView>({
    key: 'storytell.chatView',
    fallback: 'thread',
    parse: (stored) => (stored === 'thread' || stored === 'novel' ? stored : null),
    serialise: (view) => view,
});

export const setChatView = chatView.set;

/** This device's Chat view; the thread while rendering on the server. */
export const useChatView = chatView.useValue;

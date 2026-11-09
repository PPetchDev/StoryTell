'use client';

import { createContext, ReactNode, useContext, useMemo } from 'react';

import { ChatReplaceRule, makeReplacer, onAiRules, ReplaceRuleLogic } from '@/lib/replace-rules';

const asStored = (text: string) => text;

/**
 * How an AI part's text reads on screen: the Chat's On AI Messages Replace rules applied
 * (.scratch/saved-replies-and-replace-rules/spec.md: "Where the AI-side rules run"). Without a
 * provider (the Opening preview, say) text shows as stored. The Visual novel view and Read aloud
 * read it here too, so a hidden phrase stays hidden everywhere the story is read or heard.
 */
const ShownTextContext = createContext<(text: string) => string>(asStored);

/** Gives everything under it the Chat's shown text, its rules compiled once per rule list. */
export function ShownTextProvider({ rules, children }: { rules: readonly ChatReplaceRule[]; children: ReactNode }) {
    const key = JSON.stringify(onAiRules(rules));
    const shown = useMemo(() => makeReplacer(JSON.parse(key) as ReplaceRuleLogic[]), [key]);
    return <ShownTextContext.Provider value={shown}>{children}</ShownTextContext.Provider>;
}

/** The function that turns a stored AI part's text into what is shown. Names are never passed to it. */
export function useShownText(): (text: string) => string {
    return useContext(ShownTextContext);
}

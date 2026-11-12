'use client';

import { ReactNode, useId } from 'react';

import { FoldTitle, useFoldedState } from '@/components/fold/fold-button';
import { loreTriggerSummary } from '@/lib/lore';
import { LoreEntry } from '@/lib/story';

/** The fold's key in the per-device store: present while the fold is open (lib/folds.ts). */
export const loreMoreKey = (loreId: number) => `loreMoreOpen:${loreId}`;

interface LoreMoreTriggersProps {
    entry: LoreEntry;
    /** The trigger fields, in the spec's order. */
    children: ReactNode;
}

/**
 * A Lore card's More triggers fold (.scratch/lore-triggers/spec.md: "The Lore card in the
 * editor"): closed by default on every screen, its header summing up every setting that is not
 * at its default. Folded, its fields stay in the page, hidden, so autosave keeps working.
 */
export function LoreMoreTriggers({ entry, children }: LoreMoreTriggersProps) {
    const bodyId = useId();
    const foldKey = loreMoreKey(entry.id);
    const folded = useFoldedState(foldKey, true);
    return (
        <div className="mt-4 border-x-0 border-t border-b-0 border-dashed border-line">
            {/* An h3 under the card's h2 (audit M12). The title and its summary share a line while they fit. */}
            {/* The title's size is set round it: FoldTitle's own heading inherits it. */}
            <div className="text-note">
                <FoldTitle foldKey={foldKey} controls={bodyId} as="h3" startsFolded className="[&_button>span]:flex-wrap [&_button>span]:gap-x-3 [&_button>span]:gap-y-0.5">
                    <span>More triggers</span>
                    <span className="min-w-0 text-sm font-medium [overflow-wrap:anywhere] text-muted">{loreTriggerSummary(entry)}</span>
                </FoldTitle>
            </div>
            <div id={bodyId} hidden={folded} className="pt-3 pb-1">
                {children}
                <p className="mt-3 mb-0 text-sm text-muted">Changes here apply to the whole Chat as if they had always been so.</p>
            </div>
        </div>
    );
}

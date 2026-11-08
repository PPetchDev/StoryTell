'use client';

import { ReactNode, useId } from 'react';

import { FoldTitle, useFoldedState } from '@/components/fold/fold-button';
import { loreTriggerSummary } from '@/lib/lore';
import { LoreEntry } from '@/lib/story';
import styles from './story-editor.module.css';

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
        <div className={styles.moreTriggers}>
            <FoldTitle foldKey={foldKey} controls={bodyId} as="h4" startsFolded className={styles.moreTriggersTitle}>
                <span>More triggers</span>
                <span className={styles.moreTriggersSummary}>{loreTriggerSummary(entry)}</span>
            </FoldTitle>
            <div id={bodyId} hidden={folded} className={styles.moreTriggersBody}>
                {children}
                <p className={styles.moreTriggersFoot}>Changes here apply to the whole Chat as if they had always been so.</p>
            </div>
        </div>
    );
}

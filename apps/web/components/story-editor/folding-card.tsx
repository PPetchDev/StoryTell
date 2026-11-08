'use client';

import { ReactNode, useContext, useId } from 'react';

import { FoldTitle } from '@/components/fold/fold-button';
import { useFolded } from '@/lib/folds';
import { FieldMarksContext } from './field-marks';
import styles from './story-editor.module.css';

interface FoldingCardProps {
    /** The card's key in the per-device fold store, e.g. `character:12`. */
    foldKey: string;
    /** The card's accessible name, e.g. "Character 1". */
    label: string;
    /** What its heading shows: a name, with a picture or a number. */
    title: ReactNode;
    /** The DOM id prefixes of the fields inside, so a folded card can say one is needed to play. */
    fieldPrefixes: readonly string[];
    /** Buttons on the right of the header: move, remove. */
    tools?: ReactNode;
    /** Lays out the fields, e.g. the Character card's columns on a wide screen. */
    bodyClassName?: string;
    children: ReactNode;
}

/**
 * A Story editor card that folds (spec: "Folding cards"): Character, Starting Bonds, Scene and
 * Lore. Folded, its fields stay in the page, hidden, so autosave and the Story assistant keep
 * working on them, and a jump to one unfolds the card first (`data-fold-key`, read by the
 * editor's jump). A folded card with a field needed to play says so in its header.
 */
export function FoldingCard({ foldKey, label, title, fieldPrefixes, tools, bodyClassName, children }: FoldingCardProps) {
    const bodyId = useId();
    const folded = useFolded(foldKey);
    const { needed } = useContext(FieldMarksContext);
    const needsFilling = folded && [...needed].some((domId) => fieldPrefixes.some((prefix) => domId.startsWith(prefix)));

    return (
        <section className={styles.card} aria-label={label}>
            <div className={styles.cardHeader}>
                <FoldTitle foldKey={foldKey} controls={bodyId} className={styles.cardTitle}>
                    {title}
                </FoldTitle>
                {needsFilling && <span className={styles.needsFilling}>Needs filling in</span>}
                {tools}
            </div>
            <div id={bodyId} hidden={folded} data-fold-key={foldKey} className={bodyClassName ? `${styles.cardBody} ${bodyClassName}` : styles.cardBody}>
                {children}
            </div>
        </section>
    );
}

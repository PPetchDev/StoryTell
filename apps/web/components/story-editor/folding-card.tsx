'use client';

import { ReactNode, useContext, useId } from 'react';

import { FoldTitle } from '@/components/fold/fold-button';
import { useFolded } from '@/lib/folds';
import { FieldMarksContext } from './field-marks';

/** An editor card: the surface, rounded, with room round its fields. Wider padding on a desktop. */
export const EDITOR_CARD = 'mb-4 rounded-xl bg-surface px-4.5 py-4 lg:px-7 lg:py-6';

/** A boxed group of fields inside a card (Example lines, Expressions, the Reference image). */
export const SUBSECTION = 'mx-0 my-3 min-w-0 rounded-sm border border-line px-3 pt-2 pb-3';
export const SUBSECTION_LEGEND = 'px-1 text-md font-semibold text-muted';

/** A small quiet note under a tab's title or inside a card. */
export const NOTE = 'mt-0 mb-3 text-md text-muted';

/**
 * The fold button of the card named `label` ("Character 2"), for focus to land on after the card
 * before it was removed (audit H2).
 */
export function cardToggle(label: string): HTMLElement | null {
    return document.querySelector<HTMLElement>(`section[aria-label="${label}"] [aria-expanded]`);
}

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
 * editor's jump). A folded card with a field needed to play says so in its header. Its title is
 * an h2, under the page's h1 (audit M12).
 */
export function FoldingCard({ foldKey, label, title, fieldPrefixes, tools, bodyClassName, children }: FoldingCardProps) {
    const bodyId = useId();
    const folded = useFolded(foldKey);
    const { needed } = useContext(FieldMarksContext);
    const needsFilling = folded && [...needed].some((domId) => fieldPrefixes.some((prefix) => domId.startsWith(prefix)));

    return (
        <section className="mb-4 rounded-xl bg-surface px-4.5 py-1.5 lg:px-7 lg:py-2" aria-label={label}>
            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                <FoldTitle foldKey={foldKey} controls={bodyId} as="h2" className="basis-32">
                    {title}
                </FoldTitle>
                {needsFilling && (
                    <span className="flex-none rounded-full bg-warning-soft px-2.5 py-0.5 text-xs font-semibold text-warning">Needs filling in</span>
                )}
                {tools && <div className="ml-auto">{tools}</div>}
            </div>
            <div
                id={bodyId}
                hidden={folded}
                data-fold-key={foldKey}
                className={['mt-1.5 border-t border-line pt-4 pb-3.5 lg:py-5', bodyClassName].filter(Boolean).join(' ')}
            >
                {children}
            </div>
        </section>
    );
}

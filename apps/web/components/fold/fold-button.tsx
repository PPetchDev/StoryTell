'use client';

import { ReactNode } from 'react';

import { setFolded, useFolded } from '@/lib/folds';

import { ChevronDownIcon } from '@/components/icons';

interface FoldTitleProps {
    /** The fold's key in the per-device store (lib/folds.ts). */
    foldKey: string;
    /** The id of the body it shows and hides. */
    controls: string;
    /** The heading level the title sits at. */
    as?: 'h2' | 'h3' | 'h4';
    /**
     * The fold starts folded, so its key in the store records that it is open (lib/folds.ts);
     * left out, the key records that it is folded, as for the cards.
     */
    startsFolded?: boolean;
    id?: string;
    className?: string;
    children: ReactNode;
}

/** Whether a fold is folded now, reading its key the way its `startsFolded` says. */
export function useFoldedState(foldKey: string, startsFolded = false): boolean {
    const stored = useFolded(foldKey);
    return startsFolded ? !stored : stored;
}

/**
 * A folding card's title: a heading holding one button, with a chevron at its end, that folds
 * and unfolds the body named by `controls`. The heading keeps the title's text as its name; a
 * picture in it (a Character's Portrait) is decorative and part of what can be tapped.
 */
export function FoldTitle({ foldKey, controls, as: Heading = 'h3', startsFolded = false, id, className, children }: FoldTitleProps) {
    const folded = useFoldedState(foldKey, startsFolded);
    // The stored key means "open" for a fold that starts folded, "folded" otherwise.
    const toggle = () => setFolded(foldKey, startsFolded ? folded : !folded);
    return (
        <Heading id={id} className={['m-0 min-w-0 flex-1 text-[length:inherit]', className].filter(Boolean).join(' ')}>
            <button
                type="button"
                className="group bare-button flex min-h-11 w-full items-center gap-2 rounded-[0.6rem] py-1 font-bold [overflow-wrap:anywhere] text-text [-webkit-tap-highlight-color:transparent] active:bg-surface-raised"
                aria-expanded={!folded}
                aria-controls={controls}
                onClick={toggle}
            >
                <span className="flex min-w-0 flex-1 items-center gap-3">{children}</span>
                {/* Points down while folded (there is more), up while open. */}
                <ChevronDownIcon
                    size={20}
                    strokeWidth={2.2}
                    className="flex-none rotate-180 text-muted group-aria-[expanded=false]:rotate-0 motion-safe:transition-transform motion-safe:duration-150"
                />
            </button>
        </Heading>
    );
}

'use client';

import { ReactNode } from 'react';

import { setFolded, useFolded } from '@/lib/folds';

import styles from './fold.module.css';

interface FoldTitleProps {
    /** The fold's key in the per-device store (lib/folds.ts). */
    foldKey: string;
    /** The id of the body it shows and hides. */
    controls: string;
    /** The heading level the title sits at. */
    as?: 'h2' | 'h3';
    id?: string;
    className?: string;
    children: ReactNode;
}

/**
 * A folding card's title: a heading holding one button, with a chevron at its end, that folds
 * and unfolds the body named by `controls`. The heading keeps the title's text as its name; a
 * picture in it (a Character's Portrait) is decorative and part of what can be tapped.
 */
export function FoldTitle({ foldKey, controls, as: Heading = 'h3', id, className, children }: FoldTitleProps) {
    const folded = useFolded(foldKey);
    return (
        <Heading id={id} className={[styles.title, className].filter(Boolean).join(' ')}>
            <button
                type="button"
                className={styles.button}
                aria-expanded={!folded}
                aria-controls={controls}
                onClick={() => setFolded(foldKey, !folded)}
            >
                <span className={styles.label}>{children}</span>
                <svg className={styles.chevron} viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                    <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            </button>
        </Heading>
    );
}

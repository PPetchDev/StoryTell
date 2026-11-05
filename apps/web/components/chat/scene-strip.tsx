'use client';

import { useId } from 'react';

import styles from './scene-strip.module.css';

interface SceneStripProps {
    /** The Chat's current Scene; null in free play. */
    scene: { name: string; goal: string } | null;
    onHide(): void;
}

/**
 * A thin strip under the top bar (spec: "Scene strip"): the current Scene's name and its goal,
 * or "Free play". The Chat re-reads after each turn settles, so a Scene the judge moved on to
 * shows here then. A tap hides it; the ⋯ menu brings it back.
 */
export function SceneStrip({ scene, onHide }: SceneStripProps) {
    const hintId = useId();
    return (
        <button type="button" className={styles.strip} aria-describedby={hintId} onClick={onHide}>
            <span className={styles.name}>
                <span className="visually-hidden">Scene: </span>
                <span aria-hidden="true">📍 </span>
                {scene ? scene.name : 'Free play'}
            </span>
            {scene && scene.goal !== '' && (
                <span className={styles.goal}>
                    <span className="visually-hidden">Goal: </span>
                    <span aria-hidden="true">🎯 </span>
                    {scene.goal}
                </span>
            )}
            <span id={hintId} className="visually-hidden">
                Tap to hide
            </span>
        </button>
    );
}

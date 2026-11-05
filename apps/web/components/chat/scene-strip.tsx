'use client';

import { useId } from 'react';

import { Chat } from '@/lib/chat';
import { Scene } from '@/lib/story';

import styles from './scene-strip.module.css';

interface SceneStripProps {
    /** The Chat's current Scene; null in free play. */
    current: Chat['currentScene'];
    /** The Story's Scenes, which hold each one's goal; empty while the Story can't be read. */
    scenes: Scene[];
    onHide(): void;
}

/**
 * A thin strip under the top bar (spec: "Scene strip"): the current Scene's name and its goal
 * (the Scene's situation), or "Free play". The Chat re-reads until each turn's background calls
 * settle, so a Scene the judge moved on to shows then. A tap hides it; ⋯ brings it back.
 */
export function SceneStrip({ current, scenes, onHide }: SceneStripProps) {
    const hintId = useId();
    const goal = current ? (scenes.find((scene) => scene.id === current.id)?.situation ?? '') : '';
    return (
        <button type="button" className={styles.strip} aria-describedby={hintId} onClick={onHide}>
            <span className={styles.name}>
                <span className="visually-hidden">Scene: </span>
                <span aria-hidden="true">📍 </span>
                {current ? current.name : 'Free play'}
            </span>
            {goal !== '' && (
                <span className={styles.goal}>
                    <span className="visually-hidden">Goal: </span>
                    <span aria-hidden="true">🎯 </span>
                    {goal}
                </span>
            )}
            <span id={hintId} className="visually-hidden">
                Tap to hide
            </span>
        </button>
    );
}

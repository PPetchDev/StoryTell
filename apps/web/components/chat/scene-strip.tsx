'use client';

import { useId } from 'react';

import { bondGateInWords } from '@/lib/bonds';
import { Chat, TimeOfDay } from '@/lib/chat';
import { Scene } from '@/lib/story';

import styles from './scene-strip.module.css';

interface SceneStripProps {
    /** The Chat's current Scene; null in free play. */
    current: Chat['currentScene'];
    /** The Chat's Time of day; null while the story has not made one clear. */
    timeOfDay: TimeOfDay | null;
    /** The Story's Scenes, which hold each one's goal; empty while the Story can't be read. */
    scenes: Scene[];
    /** The Story's Characters, to name a Scene's Bond gates; empty while the Story can't be read. */
    characters?: readonly { id: number; name: string }[];
    onHide(): void;
}

const TIME_OF_DAY: Record<TimeOfDay, { icon: string; label: string }> = {
    dawn: { icon: '🌅', label: 'Dawn' },
    morning: { icon: '🌤️', label: 'Morning' },
    noon: { icon: '☀️', label: 'Noon' },
    afternoon: { icon: '🌇', label: 'Afternoon' },
    evening: { icon: '🌆', label: 'Evening' },
    night: { icon: '🌙', label: 'Night' },
};

/**
 * A thin strip under the top bar (spec: "Scene strip"): the current Scene's name, the Time of day
 * once there is one (spec: "Story clock"), and the Scene's goal (its situation), or "Free play",
 * then what its Bond gates wait for.
 * The Chat re-reads until each turn's background calls settle, so a Scene or time the judge moved
 * on to shows then. A tap hides it; ⋯ brings it back.
 */
export function SceneStrip({ current, timeOfDay, scenes, characters = [], onHide }: SceneStripProps) {
    const hintId = useId();
    const scene = current ? scenes.find((candidate) => candidate.id === current.id) : undefined;
    const goal = scene?.situation ?? '';
    // Its Bond gates in plain words (.scratch/bond-axes/spec.md): what the Scene waits for, toward "you".
    const nameOf = (characterId: number | null) =>
        characterId === null ? 'you' : (characters.find((character) => character.id === characterId)?.name ?? 'someone');
    const waiting = (scene?.gates ?? []).map((gate) => bondGateInWords(nameOf(gate.fromCharacterId), nameOf(gate.toCharacterId), gate.axis, gate.atLeast));
    const time = timeOfDay ? TIME_OF_DAY[timeOfDay] : null;
    return (
        <button type="button" className={styles.strip} aria-describedby={hintId} onClick={onHide}>
            <span className={styles.name}>
                <span className="visually-hidden">Scene: </span>
                <span aria-hidden="true">📍 </span>
                {current ? current.name : 'Free play'}
            </span>
            {time && (
                <span className={styles.time}>
                    <span className="visually-hidden">Time: </span>
                    <span aria-hidden="true">{time.icon} </span>
                    {time.label}
                </span>
            )}
            {goal !== '' && (
                <span className={styles.goal}>
                    <span className="visually-hidden">Goal: </span>
                    <span aria-hidden="true">🎯 </span>
                    {goal}
                </span>
            )}
            {waiting.length > 0 && <span className={styles.waiting}>Waiting for: {waiting.join('; ')}</span>}
            <span id={hintId} className="visually-hidden">
                Tap to hide
            </span>
        </button>
    );
}

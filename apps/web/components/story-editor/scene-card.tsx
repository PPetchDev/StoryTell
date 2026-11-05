'use client';

import { Scene, SCENE_REMOVAL_WARNING } from '@/lib/story';
import { ConfirmButton, OrderButtons, TextField, Toolbar } from './fields';
import { FieldRewrites, rewritableField } from './rewrite';
import styles from './story-editor.module.css';

type TextKey = 'name' | 'situation' | 'moveOnCondition';

interface SceneCardProps {
    scene: Scene;
    index: number;
    count: number;
    rewrites: FieldRewrites;
    onText(field: TextKey, value: string): void;
    onMove(direction: -1 | 1): void;
    onRemove(): void;
}

export function SceneCard({ scene, index, count, rewrites, onText, onMove, onRemove }: SceneCardProps) {
    const heading = scene.name.trim() === '' ? `Scene ${index + 1}` : scene.name;
    const last = index === count - 1;
    const rewritable = (field: TextKey) => rewritableField({ target: 'scene', id: scene.id, field }, rewrites);
    return (
        <section className={styles.card} aria-label={`Scene ${index + 1}`}>
            <div className={styles.cardHeader}>
                <h3 className={styles.cardTitle}>
                    {index + 1}. {heading}
                </h3>
                <Toolbar>
                    <OrderButtons index={index} count={count} what={heading} onMove={onMove} />
                    <ConfirmButton
                        label="Remove"
                        danger
                        question={`Remove ${heading}?`}
                        warning={SCENE_REMOVAL_WARNING}
                        confirmLabel="Remove"
                        onConfirm={onRemove}
                    />
                </Toolbar>
            </div>
            <TextField
                label="Name"
                value={scene.name}
                hint="A short name, shown at the top of the Chat."
                onChange={(v) => onText('name', v)}
                {...rewritable('name')}
            />
            <TextField
                label="Situation / goal"
                value={scene.situation}
                multiline
                hint="What is going on, and what the story is working toward here."
                onChange={(v) => onText('situation', v)}
                {...rewritable('situation')}
            />
            <TextField
                label="Move-on condition"
                value={scene.moveOnCondition}
                multiline
                hint={
                    last
                        ? 'Optional on the last Scene: leave it empty and play stays here, then continues freely.'
                        : 'When the story moves to the next Scene, e.g. "once Mira trusts you". Feelings count.'
                }
                onChange={(v) => onText('moveOnCondition', v)}
                {...rewritable('moveOnCondition')}
            />
        </section>
    );
}

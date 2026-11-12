'use client';

import { Character, Role, Scene, SceneBondGate, SCENE_REMOVAL_WARNING } from '@/lib/story';
import { ConfirmButton, OrderButtons, TextField, Toolbar } from './fields';
import { cardToggle, FoldingCard } from './folding-card';
import { FieldRewrites, rewritableField } from './rewrite';
import { SceneGates } from './scene-gates';

type TextKey = 'name' | 'situation' | 'moveOnCondition';

interface SceneCardProps {
    scene: Scene;
    index: number;
    count: number;
    rewrites: FieldRewrites;
    /** The Story's cast and Role, for its Bond gates. */
    cast: Character[];
    role: Role;
    onText(field: TextKey, value: string): void;
    onGates(gates: SceneBondGate[]): void;
    onMove(direction: -1 | 1): void;
    /** Removes the Scene; focus moves to the next card once the promise it returns settles. */
    onRemove(): void | Promise<unknown>;
}

export function SceneCard({ scene, index, count, rewrites, cast, role, onText, onGates, onMove, onRemove }: SceneCardProps) {
    const heading = scene.name.trim() === '' ? `Scene ${index + 1}` : scene.name;
    const last = index === count - 1;
    const rewritable = (field: TextKey) => rewritableField({ target: 'scene', id: scene.id, field }, rewrites);
    return (
        <FoldingCard
            foldKey={`scene:${scene.id}`}
            label={`Scene ${index + 1}`}
            fieldPrefixes={[`field-scene.${scene.id}.`]}
            title={
                <span>
                    {index + 1}. {heading}
                </span>
            }
            tools={
                <Toolbar>
                    <OrderButtons index={index} count={count} what={heading} onMove={onMove} />
                    <ConfirmButton
                        label="Remove"
                        danger
                        question={`Remove ${heading}?`}
                        warning={SCENE_REMOVAL_WARNING}
                        confirmLabel="Remove"
                        ariaLabel={`Remove Scene ${index + 1}`}
                        onConfirm={onRemove}
                        focusAfter={() => cardToggle(`Scene ${index + 1}`) ?? cardToggle(`Scene ${index}`)}
                    />
                </Toolbar>
            }
        >
            <TextField
                label="Name"
                required
                value={scene.name}
                hint="A short name, shown at the top of the Chat."
                onChange={(v) => onText('name', v)}
                {...rewritable('name')}
            />
            <TextField
                label="Situation / goal"
                required
                value={scene.situation}
                multiline
                hint="What is going on, and what the story is working toward here."
                onChange={(v) => onText('situation', v)}
                {...rewritable('situation')}
            />
            <TextField
                label="Move-on condition"
                required={!last && (scene.gates ?? []).length === 0}
                value={scene.moveOnCondition}
                multiline
                hint={
                    last
                        ? 'Optional on the last Scene: leave it empty and play stays here, then continues freely.'
                        : 'When the story moves to the next Scene, e.g. "once Mira trusts you". Feelings count. Or add a Bond gate below.'
                }
                onChange={(v) => onText('moveOnCondition', v)}
                {...rewritable('moveOnCondition')}
            />
            <SceneGates gates={scene.gates} cast={cast} role={role} onChange={onGates} />
        </FoldingCard>
    );
}

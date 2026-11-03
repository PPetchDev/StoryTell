'use client';

import { RewriteRequest, Scene } from '@/lib/story';
import { ConfirmButton, OrderButtons, TextField, Toolbar } from './fields';
import { rewriteKey, RewriteStates } from './rewrite';

type TextKey = 'name' | 'situation' | 'moveOnCondition';

interface SceneCardProps {
    scene: Scene;
    index: number;
    count: number;
    rewrites: RewriteStates;
    onRewrite(request: RewriteRequest): void;
    onText(field: TextKey, value: string): void;
    onMove(direction: -1 | 1): void;
    onRemove(): void;
}

export function SceneCard({ scene, index, count, rewrites, onRewrite, onText, onMove, onRemove }: SceneCardProps) {
    const heading = scene.name.trim() === '' ? `Scene ${index + 1}` : scene.name;
    const last = index === count - 1;
    const rewritable = (field: TextKey) => {
        const request: RewriteRequest = { target: 'scene', id: scene.id, field };
        return { rewrite: rewrites[rewriteKey(request)], onRewrite: () => onRewrite(request) };
    };
    return (
        <section className="card" aria-label={`Scene ${index + 1}`}>
            <div className="card-header">
                <h3>
                    {index + 1}. {heading}
                </h3>
                <Toolbar>
                    <OrderButtons index={index} count={count} what={heading} onMove={onMove} />
                    <ConfirmButton
                        label="Remove"
                        question={`Remove ${heading}?`}
                        confirmLabel="Remove"
                        onConfirm={onRemove}
                    />
                </Toolbar>
            </div>
            <TextField label="Name" value={scene.name} onChange={(v) => onText('name', v)} {...rewritable('name')} />
            <TextField
                label="Situation / goal"
                value={scene.situation}
                multiline
                rows={3}
                onChange={(v) => onText('situation', v)}
                {...rewritable('situation')}
            />
            <TextField
                label="Move-on condition"
                value={scene.moveOnCondition}
                multiline
                rows={2}
                hint={
                    last
                        ? 'Optional on the last Scene: leave it empty and play stays here, then continues freely.'
                        : 'In plain language, e.g. "once Mira trusts you". Feelings count.'
                }
                onChange={(v) => onText('moveOnCondition', v)}
                {...rewritable('moveOnCondition')}
            />
        </section>
    );
}

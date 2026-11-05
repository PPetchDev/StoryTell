'use client';

import { useState } from 'react';

import { Character, RewriteRequest, Role, StartingBond } from '@/lib/story';
import { fieldDomId } from './editor-tabs';
import { TextField } from './fields';
import { rewriteKey, RewriteStates } from './rewrite';
import styles from './story-editor.module.css';

interface BondsCardProps {
    /** The Character the Bonds go from. */
    character: Character;
    index: number;
    cast: Character[];
    role: Role;
    bonds: StartingBond[];
    rewrites: RewriteStates;
    onRewrite(request: RewriteRequest): void;
    onAdd(toCharacterId: number | null): void;
    onText(bondId: number, field: 'label' | 'description', value: string): void;
    onRemove(bondId: number): void;
    /** Fields the assistant changed, by their rewrite key (ticket 23). */
    highlights?: ReadonlySet<string>;
}

const ROLE_TARGET = 'role';

/** One Character's starting Bonds, on the Bonds tab: where they stand with the others at the start. */
export function BondsCard(props: BondsCardProps) {
    const { character, index, cast, role, bonds, rewrites } = props;
    const name = character.name.trim() === '' ? `Character ${index + 1}` : character.name;
    const [target, setTarget] = useState<string>(ROLE_TARGET);

    const targetName = (toCharacterId: number | null): string => {
        if (toCharacterId === null) return role.name.trim() === '' ? 'the Role' : `${role.name} (the Role)`;
        const other = cast.find((c) => c.id === toCharacterId);
        return other?.name.trim() ? other.name : 'an unnamed Character';
    };
    const taken = new Set(bonds.map((bond) => (bond.toCharacterId === null ? ROLE_TARGET : String(bond.toCharacterId))));
    const targets: Array<{ value: string; label: string }> = [
        { value: ROLE_TARGET, label: targetName(null) },
        ...cast
            .filter((other) => other.id !== character.id)
            .map((other) => ({ value: String(other.id), label: targetName(other.id) })),
    ].filter((option) => !taken.has(option.value));
    const chosen = targets.some((option) => option.value === target) ? target : (targets[0]?.value ?? '');

    const rewritable = (bondId: number, field: 'label' | 'description') => {
        const request: RewriteRequest = { target: 'startingBond', id: bondId, field };
        return {
            domId: fieldDomId(request),
            rewrite: rewrites[rewriteKey(request)],
            onRewrite: () => props.onRewrite(request),
            highlighted: props.highlights?.has(rewriteKey(request)),
        };
    };

    return (
        <section className={styles.card} aria-label={`Bonds from ${name}`}>
            <h3 className={styles.cardTitle}>From {name}</h3>
            {bonds.length === 0 && <p className={styles.hint}>Optional. With none, {name} starts as a stranger to everyone.</p>}
            {bonds.map((bond) => (
                <div className={styles.bond} key={bond.id} role="group" aria-label={`Bond toward ${targetName(bond.toCharacterId)}`}>
                    <div className={styles.cardHeader}>
                        <strong>Toward {targetName(bond.toCharacterId)}</strong>
                        <button type="button" className="button button-quiet button-small" onClick={() => props.onRemove(bond.id)}>
                            Remove Bond
                        </button>
                    </div>
                    <TextField
                        label="Label"
                        value={bond.label}
                        placeholder='e.g. "wary", "old friends"'
                        hint="A word or two for how they get on."
                        onChange={(v) => props.onText(bond.id, 'label', v)}
                        {...rewritable(bond.id, 'label')}
                    />
                    <TextField
                        label="Description"
                        value={bond.description}
                        multiline
                        hint="Where the two stand with each other at the start."
                        onChange={(v) => props.onText(bond.id, 'description', v)}
                        {...rewritable(bond.id, 'description')}
                    />
                </div>
            ))}
            {targets.length > 0 && (
                <div className={styles.addBond}>
                    <label>
                        Toward{' '}
                        <select value={chosen} onChange={(event) => setTarget(event.target.value)}>
                            {targets.map((option) => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </label>
                    <button
                        type="button"
                        className="button button-quiet"
                        onClick={() => props.onAdd(chosen === ROLE_TARGET ? null : Number(chosen))}
                    >
                        Add Bond
                    </button>
                </div>
            )}
        </section>
    );
}

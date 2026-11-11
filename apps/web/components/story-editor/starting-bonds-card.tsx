'use client';

import { useState } from 'react';

import { CharacterPortrait } from '@/components/portrait/character-portrait';
import { BOND_AXES, BondAxis } from '@/lib/bonds';
import { Portrait } from '@/lib/character-colour';
import { Character, Role, StartingBond } from '@/lib/story';
import { BondLevelField } from './bond-level-field';
import { TextField } from './fields';
import { FoldingCard } from './folding-card';
import { FieldRewrites, rewritableField } from './rewrite';
import styles from './story-editor.module.css';

interface StartingBondsCardProps {
    /** The Character the Bonds go from. */
    character: Character;
    index: number;
    /** The Character's colour and Portrait, for the picture in the card's header. */
    colour: string;
    portrait?: Portrait;
    cast: Character[];
    role: Role;
    bonds: StartingBond[];
    rewrites: FieldRewrites;
    onAdd(toCharacterId: number | null): void;
    onText(bondId: number, field: 'label' | 'description', value: string): void;
    /** A starting level picked by its word (.scratch/bond-axes/spec.md). */
    onLevel(bondId: number, axis: BondAxis, level: number): void;
    onRemove(bondId: number): void;
}

const ROLE_TARGET = 'role';

/** One Character's StartingBonds, on the Bonds tab, folding: where they stand with the others at the start. */
export function StartingBondsCard(props: StartingBondsCardProps) {
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

    const rewritable = (bondId: number, field: 'label' | 'description') =>
        rewritableField({ target: 'startingBond', id: bondId, field }, rewrites);

    return (
        <FoldingCard
            foldKey={`bonds:${character.id}`}
            label={`Starting Bonds from ${name}`}
            fieldPrefixes={bonds.map((bond) => `field-startingBond.${bond.id}.`)}
            title={
                <>
                    <CharacterPortrait name={name} colour={props.colour} portrait={props.portrait} className={styles.cardPortrait} />
                    From {name}
                </>
            }
        >
            {bonds.length === 0 && <p className={styles.note}>Optional. With none, {name} starts as a stranger to everyone.</p>}
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
                    <div role="group" aria-label="Starting levels" className={styles.bondLevels}>
                        {BOND_AXES.map((axis) => (
                            <BondLevelField key={axis} axis={axis} value={bond[axis]} onChange={(level) => props.onLevel(bond.id, axis, level)} />
                        ))}
                    </div>
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
        </FoldingCard>
    );
}

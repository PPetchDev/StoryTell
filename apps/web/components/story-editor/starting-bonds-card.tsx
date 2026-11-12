'use client';

import { useState } from 'react';

import { CharacterPortrait } from '@/components/portrait/character-portrait';
import { BOND_AXES, BondAxis } from '@/lib/bonds';
import { Portrait } from '@/lib/character-colour';
import { Character, Role, StartingBond } from '@/lib/story';
import { BondLevelField } from './bond-level-field';
import { ConfirmButton, INPUT_BOX, inputEdge, TextField } from './fields';
import { cardToggle, FoldingCard, NOTE } from './folding-card';
import { FieldRewrites, rewritableField } from './rewrite';

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
    /** Removes the Bond; focus goes back to the card's title once the promise it returns settles. */
    onRemove(bondId: number): void | Promise<unknown>;
}

const ROLE_TARGET = 'role';

/** One Bond in the card: a hairline above each but the first (the editor's own, not the Dashboard's .bond). */
const BOND = 'mt-4 border-t border-line pt-4 first:mt-0 first:border-t-0 first:pt-0';

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
                    <CharacterPortrait name={name} colour={props.colour} portrait={props.portrait} className="size-9 flex-none text-note" />
                    From {name}
                </>
            }
        >
            {bonds.length === 0 && <p className={NOTE}>Optional. With none, {name} starts as a stranger to everyone.</p>}
            {bonds.map((bond) => (
                <div className={BOND} key={bond.id} role="group" aria-label={`Bond toward ${targetName(bond.toCharacterId)}`}>
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                        <strong>Toward {targetName(bond.toCharacterId)}</strong>
                        {/* Its label, description and levels go with it, so it asks first (audit H3). */}
                        <ConfirmButton
                            label="Remove Bond"
                            ariaLabel={`Remove Bond toward ${targetName(bond.toCharacterId)}`}
                            question={`Remove the Bond toward ${targetName(bond.toCharacterId)}?`}
                            warning="Its label, description and starting levels go too."
                            confirmLabel="Remove"
                            danger
                            onConfirm={() => props.onRemove(bond.id)}
                            focusAfter={() => cardToggle(`Starting Bonds from ${name}`)}
                        />
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
                    <div role="group" aria-label="Starting levels" className="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] items-start gap-x-3">
                        {BOND_AXES.map((axis) => (
                            <BondLevelField key={axis} axis={axis} value={bond[axis]} onChange={(level) => props.onLevel(bond.id, axis, level)} />
                        ))}
                    </div>
                </div>
            ))}
            {targets.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                    <label className="flex min-w-0 items-center gap-2 text-md font-semibold text-muted">
                        Toward
                        <select className={`${INPUT_BOX} ${inputEdge()} max-w-full font-normal`} value={chosen} onChange={(event) => setTarget(event.target.value)}>
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

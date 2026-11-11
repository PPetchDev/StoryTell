'use client';

import { useId } from 'react';

import { BOND_AXES, BOND_AXIS_NAMES, BOND_AXIS_RANGE, BondAxis } from '@/lib/bonds';
import { Character, Role, SceneBondGate } from '@/lib/story';
import { BondLevelField } from './bond-level-field';
import fieldStyles from './fields.module.css';
import styles from './story-editor.module.css';

interface SceneGatesProps {
    gates: SceneBondGate[];
    cast: Character[];
    role: Role;
    /** The whole new list; it replaces the Scene's gates. */
    onChange(gates: SceneBondGate[]): void;
}

const ROLE_TARGET = 'role';

/** A Character's name as the editor shows it, or their place in the cast while unnamed. */
function nameOf(cast: Character[], characterId: number): string {
    const index = cast.findIndex((character) => character.id === characterId);
    const name = cast[index]?.name.trim() ?? '';
    return name !== '' ? name : index >= 0 ? `Character ${index + 1}` : 'a removed Character';
}

/** A select with its label above it, styled like the editor's other fields. */
function SelectField({ label, value, options, onChange }: { label: string; value: string; options: Array<{ value: string; label: string }>; onChange(value: string): void }) {
    const id = useId();
    return (
        <div className={fieldStyles.field}>
            <div className={fieldStyles.head}>
                <span className={fieldStyles.label}>
                    <label htmlFor={id}>{label}</label>
                </span>
            </div>
            <select id={id} className={fieldStyles.input} value={value} onChange={(event) => onChange(event.target.value)}>
                {options.map((option) => (
                    <option key={option.value} value={option.value}>
                        {option.label}
                    </option>
                ))}
            </select>
        </div>
    );
}

/** The first gate not set yet, from the first Character toward the Role on Trust; null when every one is. */
function nextGate(gates: SceneBondGate[], cast: Character[]): SceneBondGate | null {
    for (const from of cast) {
        for (const toCharacterId of [null, ...cast.filter((other) => other.id !== from.id).map((other) => other.id)]) {
            for (const axis of BOND_AXES) {
                const taken = gates.some((gate) => gate.fromCharacterId === from.id && gate.toCharacterId === toCharacterId && gate.axis === axis);
                if (!taken) return { fromCharacterId: from.id, toCharacterId, axis, atLeast: Math.min(1, BOND_AXIS_RANGE[axis].max) };
            }
        }
    }
    return null;
}

/**
 * A Scene's Bond gates (.scratch/bond-axes/spec.md, "Bond gates and the Scene"): each names a
 * Character, toward whom, a feeling and the least level, picked by its word. The Scene moves on
 * only when every gate holds, as well as its move-on condition when it has one.
 */
export function SceneGates({ gates, cast, role, onChange }: SceneGatesProps) {
    const roleName = role.name.trim() === '' ? 'the Role' : `${role.name} (the Role)`;
    const replace = (index: number, gate: SceneBondGate) => onChange(gates.map((other, at) => (at === index ? gate : other)));
    const addable = nextGate(gates, cast);

    return (
        <div className={styles.gates} role="group" aria-label="Bond gates">
            <p className={styles.gatesTitle}>Bond gates</p>
            <p className={fieldStyles.hint}>
                Optional. The Scene also waits until each of these feelings has grown this far, so it can move on when a relationship is ready.
            </p>
            {gates.map((gate, index) => {
                const towardOptions = [
                    { value: ROLE_TARGET, label: roleName },
                    ...cast.filter((other) => other.id !== gate.fromCharacterId).map((other) => ({ value: String(other.id), label: nameOf(cast, other.id) })),
                ];
                return (
                    <div key={index} className={styles.gate} role="group" aria-label={`Bond gate ${index + 1}`}>
                        <div className={styles.gateFields}>
                            <SelectField
                                label="Character"
                                value={String(gate.fromCharacterId)}
                                options={cast.map((character) => ({ value: String(character.id), label: nameOf(cast, character.id) }))}
                                onChange={(value) => {
                                    const fromCharacterId = Number(value);
                                    // A Character has no Bond toward itself: such a gate turns toward the Role.
                                    replace(index, { ...gate, fromCharacterId, toCharacterId: gate.toCharacterId === fromCharacterId ? null : gate.toCharacterId });
                                }}
                            />
                            <SelectField
                                label="Toward"
                                value={gate.toCharacterId === null ? ROLE_TARGET : String(gate.toCharacterId)}
                                options={towardOptions}
                                onChange={(value) => replace(index, { ...gate, toCharacterId: value === ROLE_TARGET ? null : Number(value) })}
                            />
                            <SelectField
                                label="Feeling"
                                value={gate.axis}
                                options={BOND_AXES.map((axis) => ({ value: axis, label: BOND_AXIS_NAMES[axis] }))}
                                onChange={(value) => {
                                    const axis = value as BondAxis;
                                    const { min, max } = BOND_AXIS_RANGE[axis];
                                    replace(index, { ...gate, axis, atLeast: Math.min(max, Math.max(min, gate.atLeast)) });
                                }}
                            />
                            <BondLevelField label="At least" axis={gate.axis} value={gate.atLeast} onChange={(atLeast) => replace(index, { ...gate, atLeast })} />
                        </div>
                        <button
                            type="button"
                            className="button button-quiet button-small"
                            onClick={() => onChange(gates.filter((_, at) => at !== index))}
                        >
                            Remove gate
                        </button>
                    </div>
                );
            })}
            {cast.length === 0 ? (
                <p className={fieldStyles.hint}>Add a Character first, on the Characters tab.</p>
            ) : (
                <button type="button" className="button button-quiet" disabled={addable === null} onClick={() => addable && onChange([...gates, addable])}>
                    Add Bond gate
                </button>
            )}
        </div>
    );
}

'use client';

import { useState } from 'react';

import { Character, Role, StartingBond } from '@/lib/story';
import { ConfirmButton, OrderButtons, TextField, Toolbar } from './fields';

type TextKey = 'name' | 'appearance' | 'personality' | 'voice' | 'background' | 'secrets' | 'arcDirections';

interface CharacterCardProps {
    character: Character;
    index: number;
    count: number;
    cast: Character[];
    role: Role;
    bonds: StartingBond[];
    onText(field: TextKey, value: string): void;
    onExampleLines(lines: string[]): void;
    onMove(direction: -1 | 1): void;
    onRemove(): void;
    onAddBond(toCharacterId: number | null): void;
    onBondText(bondId: number, field: 'label' | 'description', value: string): void;
    onRemoveBond(bondId: number): void;
}

const ROLE_TARGET = 'role';

export function CharacterCard(props: CharacterCardProps) {
    const { character, index, count, cast, role, bonds } = props;
    const heading = character.name.trim() === '' ? `Character ${index + 1}` : character.name;
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

    const setLine = (lineIndex: number, value: string) => {
        const lines = [...character.exampleLines];
        lines[lineIndex] = value;
        props.onExampleLines(lines);
    };
    const moveLine = (lineIndex: number, direction: -1 | 1) => {
        const lines = [...character.exampleLines];
        const [line] = lines.splice(lineIndex, 1);
        lines.splice(lineIndex + direction, 0, line);
        props.onExampleLines(lines);
    };

    return (
        <section className="card" aria-label={`Character ${index + 1}`}>
            <div className="card-header">
                <h3>{heading}</h3>
                <Toolbar>
                    <OrderButtons index={index} count={count} what={heading} onMove={props.onMove} />
                    <ConfirmButton
                        label="Remove"
                        question={`Remove ${heading}?`}
                        confirmLabel="Remove"
                        onConfirm={props.onRemove}
                    />
                </Toolbar>
            </div>
            <TextField label="Name" value={character.name} onChange={(v) => props.onText('name', v)} />
            <TextField
                label="Appearance"
                value={character.appearance}
                multiline
                rows={3}
                onChange={(v) => props.onText('appearance', v)}
            />
            <TextField
                label="Personality"
                value={character.personality}
                multiline
                rows={3}
                onChange={(v) => props.onText('personality', v)}
            />
            <TextField
                label="Voice"
                value={character.voice}
                multiline
                rows={3}
                hint="How they talk: rhythm, words they use, what they never say."
                onChange={(v) => props.onText('voice', v)}
            />

            <fieldset className="subsection">
                <legend>Example lines</legend>
                {character.exampleLines.length === 0 && <p className="hint">Optional. A few lines in their voice, in order.</p>}
                <ol className="line-list">
                    {character.exampleLines.map((line, lineIndex) => (
                        <li key={lineIndex}>
                            <input
                                type="text"
                                aria-label={`Example line ${lineIndex + 1}`}
                                value={line}
                                onChange={(event) => setLine(lineIndex, event.target.value)}
                            />
                            <Toolbar>
                                <OrderButtons
                                    index={lineIndex}
                                    count={character.exampleLines.length}
                                    what={`example line ${lineIndex + 1}`}
                                    onMove={(direction) => moveLine(lineIndex, direction)}
                                />
                                <button
                                    type="button"
                                    className="button button-quiet"
                                    aria-label={`Remove example line ${lineIndex + 1}`}
                                    onClick={() =>
                                        props.onExampleLines(character.exampleLines.filter((_, i) => i !== lineIndex))
                                    }
                                >
                                    ×
                                </button>
                            </Toolbar>
                        </li>
                    ))}
                </ol>
                <button
                    type="button"
                    className="button button-quiet"
                    onClick={() => props.onExampleLines([...character.exampleLines, ''])}
                >
                    Add example line
                </button>
            </fieldset>

            <TextField
                label="Background"
                value={character.background}
                multiline
                rows={3}
                onChange={(v) => props.onText('background', v)}
            />
            <TextField
                label="Secrets"
                value={character.secrets}
                multiline
                rows={3}
                hint="Optional. What only this Character knows."
                onChange={(v) => props.onText('secrets', v)}
            />
            <TextField
                label="Arc directions"
                value={character.arcDirections}
                multiline
                rows={3}
                hint='Optional. How they might change, e.g. "if trusted, her coldness thaws".'
                onChange={(v) => props.onText('arcDirections', v)}
            />

            <fieldset className="subsection">
                <legend>Starting Bonds</legend>
                {bonds.length === 0 && (
                    <p className="hint">Optional. With none, {heading} starts as a stranger to everyone.</p>
                )}
                {bonds.map((bond) => (
                    <div className="bond" key={bond.id} role="group" aria-label={`Bond toward ${targetName(bond.toCharacterId)}`}>
                        <div className="card-header">
                            <strong>Toward {targetName(bond.toCharacterId)}</strong>
                            <button
                                type="button"
                                className="button button-quiet"
                                onClick={() => props.onRemoveBond(bond.id)}
                            >
                                Remove Bond
                            </button>
                        </div>
                        <TextField
                            label="Label"
                            value={bond.label}
                            placeholder='e.g. "wary", "old friends"'
                            onChange={(v) => props.onBondText(bond.id, 'label', v)}
                        />
                        <TextField
                            label="Description"
                            value={bond.description}
                            multiline
                            rows={2}
                            onChange={(v) => props.onBondText(bond.id, 'description', v)}
                        />
                    </div>
                ))}
                {targets.length > 0 && (
                    <div className="add-bond">
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
                            onClick={() => props.onAddBond(chosen === ROLE_TARGET ? null : Number(chosen))}
                        >
                            Add Bond
                        </button>
                    </div>
                )}
            </fieldset>
        </section>
    );
}

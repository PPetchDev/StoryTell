'use client';

import { Character, StartingBelief } from '@/lib/story';
import { TextField } from './fields';
import { FoldingCard } from './folding-card';
import styles from './story-editor.module.css';

interface StartingBeliefsCardProps {
    cast: Character[];
    /** In the author's order; ones not yet saved have an id below zero. */
    beliefs: StartingBelief[];
    /** The list as it now reads; the editor saves the ones with text. */
    onChange(beliefs: StartingBelief[]): void;
}

/**
 * The Story's Starting Beliefs, on the Bonds tab beside the Starting Bonds (.scratch/memory-by-meaning/spec.md):
 * what a Character believes when a Chat starts, true or not. Every new Chat and every Reset begins
 * with them. A Belief is saved once it has text.
 */
export function StartingBeliefsCard({ cast, beliefs, onChange }: StartingBeliefsCardProps) {
    const nameOf = (characterId: number, index: number) => {
        const name = cast.find((character) => character.id === characterId)?.name.trim();
        return name ? name : `Character ${index + 1}`;
    };
    const change = (id: number, fields: Partial<StartingBelief>) =>
        onChange(beliefs.map((belief) => (belief.id === id ? { ...belief, ...fields } : belief)));
    const nextId = Math.min(0, ...beliefs.map((belief) => belief.id)) - 1;

    return (
        <FoldingCard foldKey="starting-beliefs" label="Starting Beliefs" fieldPrefixes={[]} title="Starting Beliefs">
            <p className={styles.note}>
                Optional. What a Character believes when a Chat starts, even if it isn’t true: a lie they were told, a secret kept from them.
            </p>
            {beliefs.map((belief, index) => (
                <div className={styles.bond} key={belief.id} role="group" aria-label={`Starting Belief ${index + 1}`}>
                    <div className={styles.cardHeader}>
                        <label className={styles.beliefHolder}>
                            Who believes it{' '}
                            <select value={belief.characterId} onChange={(event) => change(belief.id, { characterId: Number(event.target.value) })}>
                                {cast.map((character, at) => (
                                    <option key={character.id} value={character.id}>
                                        {nameOf(character.id, at)}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <button
                            type="button"
                            className="button button-quiet button-small"
                            onClick={() => onChange(beliefs.filter((other) => other.id !== belief.id))}
                        >
                            Remove Belief
                        </button>
                    </div>
                    <TextField
                        label="What they believe"
                        value={belief.text}
                        multiline
                        placeholder="e.g. {user} is a wandering herder."
                        hint={belief.text.trim() === '' ? 'Write what they believe to save it. Write {user} for the one the user plays.' : 'Write {user} for the one the user plays.'}
                        onChange={(text) => change(belief.id, { text })}
                    />
                </div>
            ))}
            {cast.length === 0 ? (
                <p className={styles.note}>Add a Character first, on the Characters tab.</p>
            ) : (
                <div className={styles.addBond}>
                    <button type="button" className="button button-quiet" onClick={() => onChange([...beliefs, { id: nextId, characterId: cast[0].id, text: '' }])}>
                        Add Belief
                    </button>
                </div>
            )}
        </FoldingCard>
    );
}

'use client';

import { useRef } from 'react';

import { Character, StartingBelief } from '@/lib/story';
import { INPUT_BOX, inputEdge, TextField } from './fields';
import { FoldingCard, NOTE } from './folding-card';
import { UndoNotice, useUndo } from './undo-notice';

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
    const list = useRef<HTMLDivElement>(null);
    const undo = useUndo();
    /** One tap removes a Belief; Undo puts the list back as it was (audit H3). */
    const remove = (index: number) => {
        const before = beliefs;
        onChange(beliefs.filter((_, at) => at !== index));
        undo.offer({
            message: `Removed Starting Belief ${index + 1}.`,
            undo: () => onChange(before),
            focusAfterUndo: () => list.current?.querySelector<HTMLElement>(`[aria-label="Remove Starting Belief ${index + 1}"]`),
        });
    };

    return (
        <FoldingCard foldKey="starting-beliefs" label="Starting Beliefs" fieldPrefixes={[]} title="Starting Beliefs">
            <p className={NOTE}>
                Optional. What a Character believes when a Chat starts, even if it isn’t true: a lie they were told, a secret kept from them.
            </p>
            <div ref={list}>
                {beliefs.map((belief, index) => (
                    <div className="mt-4 border-t border-line pt-4 first:mt-0 first:border-t-0 first:pt-0" key={belief.id} role="group" aria-label={`Starting Belief ${index + 1}`}>
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                            <label className="flex min-w-0 flex-wrap items-center gap-2 text-md font-semibold text-muted">
                                Who believes it
                                <select className={`${INPUT_BOX} ${inputEdge()} max-w-full font-normal`} value={belief.characterId} onChange={(event) => change(belief.id, { characterId: Number(event.target.value) })}>
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
                                aria-label={`Remove Starting Belief ${index + 1}`}
                                onClick={() => remove(index)}
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
            </div>
            <UndoNotice undo={undo} />
            {cast.length === 0 ? (
                <p className={NOTE}>Add a Character first, on the Characters tab.</p>
            ) : (
                <div className="mt-3">
                    <button type="button" className="button button-quiet" onClick={() => onChange([...beliefs, { id: nextId, characterId: cast[0].id, text: '' }])}>
                        Add Belief
                    </button>
                </div>
            )}
        </FoldingCard>
    );
}

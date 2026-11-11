'use client';

import { useId, useState } from 'react';

import { ConfirmButton } from '@/components/story-editor/fields';
import { Belief, BeliefFields, MemoryList, renderUser } from '@/lib/memory';

interface BeliefFormProps {
    label: string;
    list: MemoryList;
    initial: BeliefFields;
    busy: boolean;
    /** Answers whether it saved: the form stays open with what was typed when it didn't. */
    onSave(fields: BeliefFields): Promise<boolean>;
    onCancel(): void;
}

/** Who believes it, what they believe, and the Memory it doesn't match, if any. Saved with Save. */
function BeliefForm({ label, list, initial, busy, onSave, onCancel }: BeliefFormProps) {
    const [characterId, setCharacterId] = useState(initial.characterId);
    const [text, setText] = useState(initial.text);
    const [contradicts, setContradicts] = useState<number | null>(initial.contradictsMemoryId);
    const id = useId();
    const memories = list.memories.filter((memory) => !memory.archived || memory.id === contradicts);
    const blank = text.trim() === '';
    return (
        <form
            className="memory-form"
            aria-label={label}
            onSubmit={(event) => {
                event.preventDefault();
                if (!blank) void onSave({ characterId, text: text.trim(), contradictsMemoryId: contradicts });
            }}
        >
            <label htmlFor={`${id}-who`} className="muted small">
                Who believes it
            </label>
            <select id={`${id}-who`} value={characterId} onChange={(event) => setCharacterId(Number(event.target.value))}>
                {list.cast.map((character) => (
                    <option key={character.id} value={character.id}>
                        {character.name}
                    </option>
                ))}
            </select>
            <label htmlFor={`${id}-text`} className="muted small">
                What they believe
            </label>
            <textarea
                id={`${id}-text`}
                placeholder="What they hold to be true, even if it isn't. Write {user} for yourself."
                value={text}
                rows={2}
                autoFocus
                onChange={(event) => setText(event.target.value)}
            />
            <label htmlFor={`${id}-truth`} className="muted small">
                Doesn’t match (optional)
            </label>
            <select
                id={`${id}-truth`}
                value={contradicts ?? ''}
                onChange={(event) => setContradicts(event.target.value === '' ? null : Number(event.target.value))}
            >
                <option value="">No Memory</option>
                {memories.map((memory) => (
                    <option key={memory.id} value={memory.id}>
                        {renderUser(memory.text, list.identityName)}
                    </option>
                ))}
            </select>
            <div className="toolbar">
                <button type="submit" className="button button-small" disabled={busy || blank}>
                    Save
                </button>
                <button type="button" className="button button-quiet button-small" onClick={onCancel}>
                    Cancel
                </button>
            </div>
        </form>
    );
}

interface BeliefViewProps {
    list: MemoryList;
    belief: Belief;
    busy: boolean;
    onEdit(fields: BeliefFields): Promise<boolean>;
    onDelete(): void;
    onJump(messageId: number): void;
}

/** One Belief: "Nara believes …", the Memory it doesn't match, and, once given up, the line that showed the truth. */
function BeliefView({ list, belief, busy, onEdit, onDelete, onJump }: BeliefViewProps) {
    const [editing, setEditing] = useState(false);
    const name = list.cast.find((character) => character.id === belief.characterId)?.name ?? 'A removed Character';
    const truth = belief.contradictsMemoryId === null ? undefined : list.memories.find((memory) => memory.id === belief.contradictsMemoryId);
    const inPlay = list.inPlay.beliefIds.includes(belief.id);
    if (editing) {
        return (
            <li className="memory belief" aria-label={`Belief ${belief.id}`}>
                <BeliefForm
                    label={`Edit Belief ${belief.id}`}
                    list={list}
                    initial={{ characterId: belief.characterId, text: belief.text, contradictsMemoryId: belief.contradictsMemoryId }}
                    busy={busy}
                    onSave={async (fields) => {
                        const saved = await onEdit(fields);
                        if (saved) setEditing(false);
                        return saved;
                    }}
                    onCancel={() => setEditing(false)}
                />
            </li>
        );
    }
    return (
        <li className="memory belief" aria-label={`Belief ${belief.id}`}>
            <p className="message-text">
                <span className="belief-holder">{name}</span> {belief.givenUp ? 'believed' : 'believes'} {renderUser(belief.text, list.identityName)}
            </p>
            {truth && (
                <p className="muted small belief-truth">
                    Doesn’t match: {renderUser(truth.text, list.identityName)}
                </p>
            )}
            {belief.givenUp && (
                <p className="muted small">
                    Gave this up:{' '}
                    <a
                        href={`#message-${belief.givenUp.messageId}`}
                        onClick={(event) => {
                            event.preventDefault();
                            onJump(belief.givenUp!.messageId);
                        }}
                    >
                        {belief.givenUp.line}
                    </a>
                </p>
            )}
            <p className="muted small memory-meta">
                <span>{belief.writtenBy === 'ai' ? 'Written by the AI' : 'Written by you'}</span>
                {inPlay && <span className="memory-in-play">In play</span>}
            </p>
            <div className="toolbar">
                <button type="button" className="button button-quiet button-small" disabled={busy} onClick={() => setEditing(true)}>
                    Edit
                </button>
                <ConfirmButton
                    label="Delete"
                    danger
                    question="Delete this Belief?"
                    confirmLabel="Delete"
                    onConfirm={onDelete}
                    disabled={busy}
                />
            </div>
        </li>
    );
}

export interface BeliefsSectionProps {
    list: MemoryList;
    busy: boolean;
    onAdd(fields: BeliefFields): Promise<boolean>;
    onEdit(beliefId: number, fields: BeliefFields): Promise<boolean>;
    onDelete(beliefId: number): void;
    onJump(messageId: number): void;
}

/**
 * The Memory drawer's Beliefs (.scratch/memory-by-meaning/spec.md, "In the Memory drawer"): under
 * the Memories, the held ones grouped by Character, each "Nara believes …" with the Memory it
 * doesn't match; the given-up ones folded below with the line that showed the truth. Add, edit and
 * delete. The Memory graph never draws them.
 */
export function BeliefsSection({ list, busy, onAdd, onEdit, onDelete, onJump }: BeliefsSectionProps) {
    const [adding, setAdding] = useState(false);
    const held = list.beliefs.filter((belief) => belief.givenUp === null);
    const givenUp = list.beliefs.filter((belief) => belief.givenUp !== null);
    const holders = list.cast.filter((character) => held.some((belief) => belief.characterId === character.id));
    const view = (belief: Belief) => (
        <BeliefView
            key={belief.id}
            list={list}
            belief={belief}
            busy={busy}
            onEdit={(fields) => onEdit(belief.id, fields)}
            onDelete={() => onDelete(belief.id)}
            onJump={onJump}
        />
    );
    return (
        <section className="memory-beliefs" aria-label="Beliefs">
            <h3>Beliefs</h3>
            <p className="muted small">What a Character holds to be true, which may be false. They act on it until the story shows them the truth.</p>
            {held.length === 0 ? (
                <p className="muted">No one holds a Belief yet.</p>
            ) : (
                holders.map((character) => (
                    <ul key={character.id} className="memory-list" aria-label={`${character.name}’s Beliefs`}>
                        {held.filter((belief) => belief.characterId === character.id).map(view)}
                    </ul>
                ))
            )}
            {adding ? (
                <BeliefForm
                    label="New Belief"
                    list={list}
                    initial={{ characterId: list.present[0] ?? list.cast[0]?.id ?? 0, text: '', contradictsMemoryId: null }}
                    busy={busy}
                    onSave={async (fields) => {
                        const saved = await onAdd(fields);
                        if (saved) setAdding(false);
                        return saved;
                    }}
                    onCancel={() => setAdding(false)}
                />
            ) : (
                list.cast.length > 0 && (
                    <button type="button" className="button button-small" disabled={busy} onClick={() => setAdding(true)}>
                        Add a Belief
                    </button>
                )
            )}
            {givenUp.length > 0 && (
                <details className="memory-archived">
                    <summary>Given up ({givenUp.length})</summary>
                    <ul className="memory-list" aria-label="Given-up Beliefs">
                        {givenUp.map(view)}
                    </ul>
                </details>
            )}
        </section>
    );
}

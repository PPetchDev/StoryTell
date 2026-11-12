'use client';

import { useRef, useState } from 'react';

import { Autosave } from '@/components/story-editor/autosave';
import { ConfirmButton } from '@/components/story-editor/fields';
import { Persona, personaApi } from '@/lib/persona';

interface PersonaCardProps {
    persona: Persona;
    autosave: Autosave;
    /** A Persona just made with "New Persona": its name is focused and selected. */
    justCreated: boolean;
    onSaved(persona: Persona): void;
    onDelete(): Promise<unknown>;
    /** Where focus goes once this Persona is deleted (audit M50). */
    focusAfterDelete(): HTMLElement | null;
}

/**
 * One Persona, its Name and Description saved as they are typed (spec: "Saving"). What was
 * typed stays in the fields whatever the API answers, so a failed save loses nothing.
 */
function PersonaCard({ persona, autosave, justCreated, onSaved, onDelete, focusAfterDelete }: PersonaCardProps) {
    const [name, setName] = useState(persona.name);
    const [description, setDescription] = useState(persona.description);
    const idPrefix = `persona-${persona.id}`;
    const nameMissing = name.trim() === '';

    const changeName = (value: string) => {
        setName(value);
        const key = `persona.${persona.id}.name`;
        // An empty name is shown as an error and not sent, nor is the name typed before it.
        if (value.trim() === '') autosave.cancel(key);
        else autosave.queue(key, () => personaApi.update(persona.id, { name: value }), onSaved);
    };

    const changeDescription = (value: string) => {
        setDescription(value);
        autosave.queue(`persona.${persona.id}.description`, () => personaApi.update(persona.id, { description: value }), onSaved);
    };

    return (
        <li id={idPrefix} className="card m-0 grid gap-2" aria-label={persona.name}>
            <div className="field">
                <label htmlFor={`${idPrefix}-name`}>Name</label>
                <input
                    id={`${idPrefix}-name`}
                    type="text"
                    value={name}
                    autoFocus={justCreated}
                    onFocus={justCreated ? (event) => event.target.select() : undefined}
                    aria-invalid={nameMissing}
                    aria-describedby={nameMissing ? `${idPrefix}-name-error` : undefined}
                    onChange={(event) => changeName(event.target.value)}
                />
                {nameMissing && (
                    <p id={`${idPrefix}-name-error`} role="alert" className="field-error">
                        A Persona needs a name.
                    </p>
                )}
            </div>
            <div className="field">
                <label htmlFor={`${idPrefix}-description`}>Description</label>
                <textarea
                    id={`${idPrefix}-description`}
                    rows={3}
                    value={description}
                    aria-describedby={`${idPrefix}-description-hint`}
                    onChange={(event) => changeDescription(event.target.value)}
                />
                {/* What to write, kept in view while writing it (audit L21). */}
                <p id={`${idPrefix}-description-hint`} className="hint">
                    Who you are while wearing it: what Characters can see and know about you.
                </p>
            </div>
            <div className="toolbar">
                <ConfirmButton
                    label="Delete"
                    danger
                    ariaLabel={`Delete ${persona.name}`}
                    question={`Delete "${persona.name}"? Chats wearing it go back to their Role; Messages keep the name.`}
                    confirmLabel="Delete"
                    onConfirm={onDelete}
                    focusAfter={focusAfterDelete}
                />
            </div>
        </li>
    );
}

/**
 * The user's Personas (spec: "Personas: create, read, update, delete"), app-wide, Name and
 * Description only. Any Chat can wear one in place of its Story's Role. Renaming or deleting
 * one never changes the name on Messages already written; a Chat wearing a deleted one goes
 * back to its Role. Edits save as they are typed, with the status in the page header.
 */
export function PersonaList({ initial, autosave }: { initial: Persona[]; autosave: Autosave }) {
    const [personas, setPersonas] = useState(initial);
    const [justCreated, setJustCreated] = useState<number | null>(null);
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const newButton = useRef<HTMLButtonElement>(null);

    const saved = (persona: Persona) =>
        setPersonas((current) => current.map((each) => (each.id === persona.id ? persona : each)));

    /** Makes a Persona at once, named "New Persona", to be renamed in place. */
    const create = async () => {
        setError(null);
        setCreating(true);
        await autosave.commit(
            () => personaApi.create({ name: 'New Persona', description: '' }),
            (created) => {
                setPersonas((current) => [...current, created]);
                setJustCreated(created.id);
            },
            setError,
        );
        setCreating(false);
    };

    const remove = (personaId: number) => {
        setError(null);
        return autosave.commit(
            () => personaApi.remove(personaId),
            () => setPersonas((current) => current.filter((persona) => persona.id !== personaId)),
            setError,
        );
    };

    return (
        <>
            <button ref={newButton} type="button" className="button" disabled={creating} aria-busy={creating || undefined} onClick={() => void create()}>
                New Persona
            </button>

            {error && (
                <p role="alert" className="field-error">
                    {error}
                </p>
            )}

            {personas.length === 0 ? (
                <p className="muted">No Personas yet. Until you make one, every Chat is played as its Story&apos;s Role.</p>
            ) : (
                <ul className="mt-4 mb-0 grid list-none gap-4 p-0" aria-label="Personas">
                    {personas.map((persona, index) => (
                        <PersonaCard
                            key={persona.id}
                            persona={persona}
                            autosave={autosave}
                            justCreated={persona.id === justCreated}
                            onSaved={saved}
                            onDelete={() => remove(persona.id)}
                            focusAfterDelete={() => {
                                // Still there: the delete failed, and focus goes back to its button.
                                if (document.getElementById(`persona-${persona.id}`)) return null;
                                const next = personas[index + 1] ?? personas[index - 1];
                                return (next && document.getElementById(`persona-${next.id}-name`)) || newButton.current;
                            }}
                        />
                    ))}
                </ul>
            )}
        </>
    );
}

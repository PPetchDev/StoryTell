'use client';

import { useState } from 'react';

import { useAutosave } from '@/components/story-editor/autosave';
import { ConfirmButton } from '@/components/story-editor/fields';
import { Persona, personaApi } from '@/lib/persona';

type Autosave = Pick<ReturnType<typeof useAutosave>, 'queue' | 'commit'>;

interface PersonaCardProps {
    persona: Persona;
    autosave: Autosave;
    /** A Persona just made with "New Persona": its name is focused and selected. */
    fresh: boolean;
    onSaved(persona: Persona): void;
    onDelete(): void;
}

/**
 * One Persona, its Name and Description saved as they are typed (spec: "Saving"). What was
 * typed stays in the fields whatever the API answers, so a failed save loses nothing.
 */
function PersonaCard({ persona, autosave, fresh, onSaved, onDelete }: PersonaCardProps) {
    const [name, setName] = useState(persona.name);
    const [description, setDescription] = useState(persona.description);
    const idPrefix = `persona-${persona.id}`;
    const nameMissing = name.trim() === '';

    const changeName = (value: string) => {
        setName(value);
        // An empty name is shown as an error and not sent.
        if (value.trim() === '') return;
        autosave.queue(`persona.${persona.id}.name`, () => personaApi.update(persona.id, { name: value }), onSaved);
    };

    const changeDescription = (value: string) => {
        setDescription(value);
        autosave.queue(`persona.${persona.id}.description`, () => personaApi.update(persona.id, { description: value }), onSaved);
    };

    return (
        <li className="card persona-form" aria-label={persona.name}>
            <div className="field">
                <label htmlFor={`${idPrefix}-name`}>Name</label>
                <input
                    id={`${idPrefix}-name`}
                    type="text"
                    value={name}
                    required
                    autoFocus={fresh}
                    onFocus={fresh ? (event) => event.target.select() : undefined}
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
                    placeholder="Who you are while wearing it: what Characters can see and know about you."
                    onChange={(event) => changeDescription(event.target.value)}
                />
            </div>
            <div className="toolbar">
                <ConfirmButton
                    label="Delete"
                    question={`Delete "${persona.name}"? Chats wearing it go back to their Role; Messages keep the name.`}
                    confirmLabel="Delete"
                    onConfirm={onDelete}
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
    const [fresh, setFresh] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);

    const saved = (persona: Persona) =>
        setPersonas((current) => current.map((each) => (each.id === persona.id ? persona : each)));

    const create = () => {
        setError(null);
        void autosave.commit(
            () => personaApi.create({ name: 'New Persona', description: '' }),
            (created) => {
                setPersonas((current) => [...current, created]);
                setFresh(created.id);
            },
            setError,
        );
    };

    const remove = (personaId: number) => {
        setError(null);
        void autosave.commit(
            () => personaApi.remove(personaId),
            () => setPersonas((current) => current.filter((persona) => persona.id !== personaId)),
            setError,
        );
    };

    return (
        <>
            <button type="button" className="button" onClick={create}>
                New Persona
            </button>

            {error && <p role="alert">{error}</p>}

            {personas.length === 0 ? (
                <p className="muted">No Personas yet. Until you make one, every Chat is played as its Story&apos;s Role.</p>
            ) : (
                <ul className="persona-list" aria-label="Personas">
                    {personas.map((persona) => (
                        <PersonaCard
                            key={persona.id}
                            persona={persona}
                            autosave={autosave}
                            fresh={persona.id === fresh}
                            onSaved={saved}
                            onDelete={() => remove(persona.id)}
                        />
                    ))}
                </ul>
            )}
        </>
    );
}

'use client';

import { FormEvent, useState } from 'react';

import { useConnection } from '@/components/connection';
import { ConfirmButton } from '@/components/story-editor/fields';
import { ApiError, ApiUnreachableError } from '@/lib/api';
import { Persona, personaApi } from '@/lib/persona';

interface PersonaFormProps {
    /** The form's accessible name and the id prefix of its fields. */
    label: string;
    idPrefix: string;
    initial: { name: string; description: string };
    submitLabel: string;
    /** Resolves once saved; a failure keeps what was typed. */
    onSubmit(fields: { name: string; description: string }): Promise<boolean>;
    onCancel?(): void;
}

function PersonaForm({ label, idPrefix, initial, submitLabel, onSubmit, onCancel }: PersonaFormProps) {
    const [name, setName] = useState(initial.name);
    const [description, setDescription] = useState(initial.description);
    const [saving, setSaving] = useState(false);

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (name.trim() === '') return;
        setSaving(true);
        const saved = await onSubmit({ name, description });
        setSaving(false);
        if (saved && !onCancel) {
            setName('');
            setDescription('');
        }
    };

    return (
        <form className="persona-form" aria-label={label} onSubmit={submit}>
            <div className="field">
                <label htmlFor={`${idPrefix}-name`}>Name</label>
                <input id={`${idPrefix}-name`} type="text" value={name} required onChange={(event) => setName(event.target.value)} />
            </div>
            <div className="field">
                <label htmlFor={`${idPrefix}-description`}>Description</label>
                <textarea
                    id={`${idPrefix}-description`}
                    rows={3}
                    value={description}
                    placeholder="Who you are while wearing it: what Characters can see and know about you."
                    onChange={(event) => setDescription(event.target.value)}
                />
            </div>
            <div className="toolbar">
                <button type="submit" className="button" disabled={saving || name.trim() === ''}>
                    {saving ? 'Saving…' : submitLabel}
                </button>
                {onCancel && (
                    <button type="button" className="button button-quiet" onClick={onCancel}>
                        Cancel
                    </button>
                )}
            </div>
        </form>
    );
}

/**
 * The user's Personas (spec: "Personas: create, read, update, delete"), app-wide, Name and
 * Description only. Any Chat can wear one in place of its Story's Role. Renaming or deleting
 * one never changes the name on Messages already written; a Chat wearing a deleted one goes
 * back to its Role.
 */
export function PersonaList({ initial }: { initial: Persona[] }) {
    const { reportUnreachable } = useConnection();
    const [personas, setPersonas] = useState(initial);
    const [editing, setEditing] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);

    const run = async (work: () => Promise<void>): Promise<boolean> => {
        setError(null);
        try {
            await work();
            return true;
        } catch (caught) {
            if (caught instanceof ApiUnreachableError) reportUnreachable();
            else setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
            return false;
        }
    };

    const create = (fields: { name: string; description: string }) =>
        run(async () => {
            const created = await personaApi.create(fields);
            setPersonas((current) => [...current, created]);
        });

    const update = (personaId: number, fields: { name: string; description: string }) =>
        run(async () => {
            const saved = await personaApi.update(personaId, fields);
            setPersonas((current) => current.map((persona) => (persona.id === personaId ? saved : persona)));
            setEditing(null);
        });

    const remove = (personaId: number) =>
        void run(async () => {
            await personaApi.remove(personaId);
            setPersonas((current) => current.filter((persona) => persona.id !== personaId));
        });

    return (
        <>
            <section className="card" aria-label="New Persona">
                <h2>New Persona</h2>
                <PersonaForm label="New Persona" idPrefix="new-persona" initial={{ name: '', description: '' }} submitLabel="Create" onSubmit={create} />
            </section>

            {error && <p role="alert">{error}</p>}

            {personas.length === 0 ? (
                <p className="muted">No Personas yet. Until you make one, every Chat is played as its Story&apos;s Role.</p>
            ) : (
                <ul className="persona-list" aria-label="Personas">
                    {personas.map((persona) => (
                        <li key={persona.id} className="card" aria-label={persona.name}>
                            {editing === persona.id ? (
                                <PersonaForm
                                    label={`Edit ${persona.name}`}
                                    idPrefix={`persona-${persona.id}`}
                                    initial={persona}
                                    submitLabel="Save"
                                    onSubmit={(fields) => update(persona.id, fields)}
                                    onCancel={() => setEditing(null)}
                                />
                            ) : (
                                <>
                                    <h3>{persona.name}</h3>
                                    <p className={persona.description ? 'persona-description' : 'muted'}>
                                        {persona.description || 'No description.'}
                                    </p>
                                    <div className="toolbar">
                                        <button type="button" className="button button-quiet" onClick={() => setEditing(persona.id)}>
                                            Edit
                                        </button>
                                        <ConfirmButton
                                            label="Delete"
                                            question={`Delete "${persona.name}"? Chats wearing it go back to their Role; Messages keep the name.`}
                                            confirmLabel="Delete"
                                            onConfirm={() => remove(persona.id)}
                                        />
                                    </div>
                                </>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </>
    );
}

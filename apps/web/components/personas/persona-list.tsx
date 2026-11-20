'use client';

import { ChangeEvent, useRef, useState } from 'react';

import { useConnection } from '@/components/connection';
import { initialOf } from '@/components/portrait/character-portrait';
import { Autosave } from '@/components/story-editor/autosave';
import { ExpressionSet } from '@/components/story-editor/expressions';
import { ConfirmButton } from '@/components/story-editor/fields';
import { ApiError, ApiUnreachableError } from '@/lib/api';
import { preparedForUpload } from '@/lib/cover';
import { expressionEndpoints } from '@/lib/expression-endpoints';
import { Persona, personaApi, personaImageUrl } from '@/lib/persona';

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
 * typed stays in the fields whatever the API answers, so a failed save loses nothing. Its picture
 * (.scratch/persona-image/spec.md) is uploaded from the phone and saved at once, apart from the
 * autosave: it shows beside the user's lines in a Chat that wears the Persona.
 */
function PersonaCard({ persona, autosave, justCreated, onSaved, onDelete, focusAfterDelete }: PersonaCardProps) {
    const [name, setName] = useState(persona.name);
    const [description, setDescription] = useState(persona.description);
    const idPrefix = `persona-${persona.id}`;
    const nameMissing = name.trim() === '';
    const { reportUnreachable } = useConnection();
    const [picture, setPicture] = useState(persona.imagePath);
    /** What is happening to the picture, in words, while it is: "Uploading…", "Removing…". */
    const [pictureBusy, setPictureBusy] = useState<string | null>(null);
    const [pictureError, setPictureError] = useState<string | null>(null);
    /** Its Expressions (.scratch/your-faces/spec.md), as the last write answered them. */
    const [faces, setFaces] = useState(persona.expressions ?? []);
    const took = (saved: Persona) => {
        setFaces(saved.expressions ?? []);
        setPicture(saved.imagePath);
        onSaved(saved);
    };
    const fileInput = useRef<HTMLInputElement>(null);
    const pictureButton = useRef<HTMLButtonElement>(null);

    const savePicture = async (doing: string, save: () => Promise<Persona>) => {
        setPictureBusy(doing);
        setPictureError(null);
        try {
            took(await save());
        } catch (caught) {
            if (caught instanceof ApiUnreachableError) reportUnreachable();
            setPictureError(caught instanceof ApiError ? caught.message : "Couldn't save the picture. Try again.");
        } finally {
            setPictureBusy(null);
        }
    };

    const upload = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        // Cleared, so choosing the same file again still counts as a change.
        event.target.value = '';
        // Re-encoded first, as a Cover is: that drops what a phone writes into a photo, where it was taken included.
        if (file)
            void savePicture('Uploading…', async () => {
                const prepared = await preparedForUpload(file);
                return personaApi.uploadImage(persona.id, prepared.picture, prepared.filename);
            });
    };

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
            <div className="flex items-center gap-3">
                {picture ? (
                    // eslint-disable-next-line @next/next/no-img-element -- served by the API from the image folder, as a thumbnail
                    <img
                        className="size-16 shrink-0 rounded-full bg-surface-raised object-cover"
                        src={personaImageUrl(picture, 320)}
                        alt={`Picture of ${persona.name}`}
                        draggable={false}
                    />
                ) : (
                    <span className="grid size-16 shrink-0 place-items-center rounded-full bg-accent-fill text-2xl leading-none font-bold text-accent-text" aria-hidden="true">
                        {initialOf(name)}
                    </span>
                )}
                <div className="grid min-w-0 gap-1.5">
                    <div className="toolbar">
                        <button
                            ref={pictureButton}
                            type="button"
                            className="button button-quiet button-small"
                            disabled={pictureBusy !== null}
                            aria-label={`${picture ? 'Change picture' : 'Add a picture'} of ${persona.name}`}
                            onClick={() => fileInput.current?.click()}
                        >
                            {picture ? 'Change picture' : 'Add a picture'}
                        </button>
                        {picture && (
                            <ConfirmButton
                                label="Remove picture"
                                ariaLabel={`Remove picture of ${persona.name}`}
                                danger
                                disabled={pictureBusy !== null}
                                question="Remove the picture?"
                                confirmLabel="Remove"
                                small
                                onConfirm={() => savePicture('Removing…', () => personaApi.clearImage(persona.id))}
                                focusAfter={() => pictureButton.current}
                            />
                        )}
                    </div>
                    <p className="hint m-0">Shown beside your lines in a Chat that wears this Persona.</p>
                </div>
                <input
                    ref={fileInput}
                    className="visually-hidden"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    aria-label={`Picture for ${persona.name}`}
                    tabIndex={-1}
                    onChange={upload}
                />
            </div>
            <p className={pictureBusy ? 'm-0 text-md text-muted' : 'sr-only'} role="status">
                {pictureBusy}
            </p>
            {pictureError && (
                <p className="field-error" role="alert">
                    {pictureError}
                </p>
            )}
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
            <ExpressionSet<Persona>
                owner={{
                    key: `persona-${persona.id}`,
                    name: name.trim() === '' ? 'this Persona' : name,
                    expressions: faces,
                    picturePath: picture,
                    defaultCrop: null,
                    pictureName: 'picture',
                    squareName: 'the centre square',
                    plainName: 'its picture',
                }}
                api={expressionEndpoints<Persona>(`/personas/${persona.id}`)}
                commit={async (run, onError) => {
                    try {
                        const saved = await run();
                        took(saved);
                        return saved;
                    } catch (caught) {
                        if (caught instanceof ApiUnreachableError) reportUnreachable();
                        onError(caught instanceof Error ? caught.message : 'Something went wrong.');
                        return undefined;
                    }
                }}
                flush={async () => {}}
                onDrawn={took}
                reload={() => personaApi.get(persona.id)}
            />
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

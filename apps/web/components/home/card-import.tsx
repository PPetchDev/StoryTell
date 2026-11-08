'use client';

import { FormEvent, useEffect, useState } from 'react';

import { useConnection } from '@/components/connection';
import { ApiUnreachableError } from '@/lib/api';
import { cardApi, CardPreview } from '@/lib/character-card';
import { Story } from '@/lib/story';

interface Props {
    file: File;
    /** The Story is made: open it. */
    onImported(story: Story): void;
    /** Back to the file picker, for a refused file. */
    onChooseAnother(): void;
    onCancel(): void;
}

type PreviewState = { kind: 'reading' } | { kind: 'ready'; preview: CardPreview } | { kind: 'refused'; message: string };

const message = (failure: unknown) => (failure instanceof Error ? failure.message : 'Something went wrong.');

/**
 * Home's New Story panel once a Character card is picked (spec: "Web"): what the card is and
 * what comes along, the greeting that becomes the Opening, the name the user plays under, then
 * Import. Reading the card writes nothing; the Story is made by a fixed mapping, with no AI call.
 */
export function CardImport({ file, onImported, onChooseAnother, onCancel }: Props) {
    const { reportUnreachable } = useConnection();
    const [state, setState] = useState<PreviewState>({ kind: 'reading' });
    const [roleName, setRoleName] = useState('');
    const [greeting, setGreeting] = useState(0);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const picture = usePicture(file);

    useEffect(() => {
        let current = true;
        cardApi.preview(file).then(
            (preview) => {
                if (!current) return;
                setState({ kind: 'ready', preview });
                if (preview.roleName) setRoleName(preview.roleName);
            },
            (failure: unknown) => {
                if (!current) return;
                if (failure instanceof ApiUnreachableError) reportUnreachable();
                else setState({ kind: 'refused', message: message(failure) });
            },
        );
        return () => {
            current = false;
        };
    }, [file, reportUnreachable]);

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (busy || roleName.trim() === '') return;
        setBusy(true);
        setError(null);
        try {
            onImported(await cardApi.importCard(file, roleName.trim(), greeting));
        } catch (failure) {
            setBusy(false);
            if (failure instanceof ApiUnreachableError) reportUnreachable();
            else setError(message(failure));
        }
    };

    const chooseAnother = (
        <button type="button" className="button button-quiet button-small" onClick={onChooseAnother}>
            Choose another file
        </button>
    );

    if (state.kind === 'reading') {
        return (
            <p className="muted" role="status">
                Reading {file.name}…
            </p>
        );
    }
    if (state.kind === 'refused') {
        return (
            <div>
                <p role="alert" className="field-error">
                    <span>
                        Couldn&apos;t read {file.name}: {state.message}
                    </span>{' '}
                    {chooseAnother}
                </p>
                <div className="actions">
                    <button type="button" className="button button-quiet" onClick={onCancel}>
                        Cancel
                    </button>
                </div>
            </div>
        );
    }

    const { preview } = state;
    return (
        <form onSubmit={(event) => void submit(event)} aria-label="Import a Character card">
            <div className="card-import-head">
                {picture && preview.hasPicture && (
                    // A blob URL of the picked file: the browser decodes it, nothing is sent for it.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="card-import-picture" src={picture} alt={`Picture of ${preview.characterName}`} />
                )}
                <div>
                    <h3 className="card-import-name">{preview.characterName}</h3>
                    {preview.title !== preview.characterName && <p className="muted">{preview.title}</p>}
                    <p className="muted">{preview.creator ? `By ${preview.creator}` : file.name}</p>
                    <p className="muted">
                        {preview.loreEntries === 1 ? '1 Lore entry' : `${preview.loreEntries} Lore entries`}
                    </p>
                </div>
            </div>

            {preview.creatorNotes && (
                <details className="card-import-fold">
                    <summary>Creator&apos;s notes</summary>
                    <p className="card-import-text">{preview.creatorNotes}</p>
                </details>
            )}

            <fieldset className="card-import-greetings">
                <legend>Opening</legend>
                {preview.greetings.map((text, index) => (
                    <label key={index} className="card-import-greeting">
                        <input
                            type="radio"
                            name="card-greeting"
                            value={index}
                            checked={greeting === index}
                            disabled={busy}
                            onChange={() => setGreeting(index)}
                        />
                        <span>
                            <strong>{index === 0 ? 'First message' : `Alternate greeting ${index}`}</strong>
                            <span className="card-import-text">{text || '(empty)'}</span>
                        </span>
                    </label>
                ))}
            </fieldset>

            {preview.leftOut.length > 0 && (
                <details className="card-import-fold">
                    <summary>Won&apos;t come along</summary>
                    <ul aria-label="Won't come along">
                        {preview.leftOut.map((line) => (
                            <li key={line}>{line}</li>
                        ))}
                    </ul>
                </details>
            )}

            <div className="field">
                <label htmlFor="card-role-name">Your name in this Story</label>
                <input
                    id="card-role-name"
                    type="text"
                    required
                    maxLength={200}
                    value={roleName}
                    disabled={busy}
                    aria-describedby="card-role-name-hint"
                    onChange={(event) => setRoleName(event.target.value)}
                />
                <p id="card-role-name-hint" className="hint">
                    The card&apos;s {'{{user}}'} becomes this name everywhere. No AI call is made.
                </p>
            </div>
            {error && (
                <p role="alert" className="field-error">
                    <span>Couldn&apos;t import the card: {error}</span> {chooseAnother}
                </p>
            )}
            <div className="actions">
                <button type="submit" className="button" disabled={busy || roleName.trim() === ''}>
                    {busy ? 'Importing…' : 'Import'}
                </button>
                <button type="button" className="button button-quiet" onClick={onCancel} disabled={busy}>
                    Cancel
                </button>
            </div>
        </form>
    );
}

/** A PNG card's picture, shown from the file itself in the browser; null for a JSON card. */
function usePicture(file: File): string | null {
    const isPng = file.type === 'image/png' || file.name.toLowerCase().endsWith('.png');
    const [url, setUrl] = useState<string | null>(null);
    useEffect(() => {
        if (!isPng) return;
        const objectUrl = URL.createObjectURL(file);
        setUrl(objectUrl);
        return () => {
            URL.revokeObjectURL(objectUrl);
            setUrl(null);
        };
    }, [file, isPng]);
    return url;
}

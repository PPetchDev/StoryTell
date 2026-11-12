'use client';

import { FormEvent, useEffect, useId, useRef, useState } from 'react';

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
    /** Leaves the panel; offered at every step, while reading and importing too (audit M37). */
    onCancel(): void;
    /** The import was cancelled while it was being sent, and the Story was made anyway. */
    onMadeAfterCancel?(): void;
}

type PreviewState = { kind: 'reading' } | { kind: 'ready'; preview: CardPreview } | { kind: 'refused'; message: string };

const message = (failure: unknown) => (failure instanceof Error ? failure.message : 'Something went wrong.');

/**
 * Home's New Story panel once a Character card is picked (spec: "Web"): what the card is and
 * what comes along, the greeting that becomes the Opening, the name the user plays under, then
 * Import. Reading the card writes nothing; the Story is made by a fixed mapping, with no AI call.
 */
/** A fold's summary: a 44px row to tap (audit L20). */
const FOLD = 'my-2 [&>summary]:flex [&>summary]:min-h-11 [&>summary]:cursor-pointer [&>summary]:items-center [&>summary]:font-semibold';
/** One greeting to pick: a raised box, outlined in accent once picked. */
const GREETING = [
    'flex cursor-pointer items-start gap-2 rounded-md border border-transparent bg-surface-raised px-2.5 py-2',
    'has-checked:border-accent-line has-checked:bg-accent-soft',
].join(' ');
/** Text from the card, kept as written. */
const CARD_TEXT = 'block text-md whitespace-pre-wrap [overflow-wrap:anywhere]';

export function CardImport({ file, onImported, onChooseAnother, onCancel, onMadeAfterCancel }: Props) {
    const { reportUnreachable } = useConnection();
    const [state, setState] = useState<PreviewState>({ kind: 'reading' });
    const [roleName, setRoleName] = useState('');
    const [greeting, setGreeting] = useState(0);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const picture = usePicture(file);
    const greetingsId = useId();
    /** Gone from the page: an import still on its way must not open the Story it makes. */
    const left = useRef(false);
    useEffect(() => {
        left.current = false;
        return () => {
            left.current = true;
        };
    }, []);

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
            const story = await cardApi.importCard(file, roleName.trim(), greeting);
            if (left.current) onMadeAfterCancel?.();
            else onImported(story);
        } catch (failure) {
            if (left.current) return;
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

    const cancel = (
        <button type="button" className="button button-quiet" onClick={onCancel}>
            Cancel
        </button>
    );

    if (state.kind === 'reading') {
        return (
            <div>
                <p className="muted" role="status">
                    Reading {file.name}…
                </p>
                <div className="actions mt-3 flex-wrap gap-2">{cancel}</div>
            </div>
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
                <div className="actions mt-3 flex-wrap gap-2">{cancel}</div>
            </div>
        );
    }

    const { preview } = state;
    return (
        <form onSubmit={(event) => void submit(event)} aria-label="Import a Character card">
            <div className="flex items-start gap-3.5">
                {picture && preview.hasPicture && (
                    // A blob URL of the picked file: the browser decodes it, nothing is sent for it.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="mb-3 block aspect-[2/3] h-auto w-32 max-w-[40%] rounded-md object-cover" src={picture} alt={`Picture of ${preview.characterName}`} />
                )}
                <div className="min-w-0 [&>p]:mt-0.5 [&>p]:mb-0">
                    <h3 className="m-0 [overflow-wrap:anywhere]">{preview.characterName}</h3>
                    {preview.title !== preview.characterName && <p className="muted">{preview.title}</p>}
                    <p className="muted [overflow-wrap:anywhere]">{preview.creator ? `By ${preview.creator}` : file.name}</p>
                    <p className="muted">
                        {preview.loreEntries === 1 ? '1 Lore entry' : `${preview.loreEntries} Lore entries`}
                    </p>
                </div>
            </div>

            {preview.creatorNotes && (
                <details className={FOLD}>
                    <summary>Creator&apos;s notes</summary>
                    <p className={`${CARD_TEXT} mt-1 mb-0`}>{preview.creatorNotes}</p>
                </details>
            )}

            <fieldset className="my-3 grid gap-2 border-0 p-0">
                <legend className="mb-1 font-semibold">Opening</legend>
                {preview.greetings.map((text, index) => (
                    // Named by its short title; the greeting itself is its description (audit L19).
                    <label key={index} className={GREETING}>
                        <input
                            type="radio"
                            name="card-greeting"
                            className="mt-1 size-4.5 flex-none accent-accent-fill"
                            value={index}
                            checked={greeting === index}
                            disabled={busy}
                            aria-labelledby={`${greetingsId}-${index}-name`}
                            aria-describedby={`${greetingsId}-${index}-text`}
                            onChange={() => setGreeting(index)}
                        />
                        <span className="min-w-0">
                            <strong id={`${greetingsId}-${index}-name`}>{index === 0 ? 'First message' : `Alternate greeting ${index}`}</strong>
                            <span id={`${greetingsId}-${index}-text`} className={CARD_TEXT}>
                                {text || '(empty)'}
                            </span>
                        </span>
                    </label>
                ))}
            </fieldset>

            {preview.leftOut.length > 0 && (
                <details className={FOLD}>
                    <summary>Won&apos;t come along</summary>
                    <ul className="mt-2 mb-0 pl-5" aria-label="Won't come along">
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
            <div className="actions mt-3 flex-wrap gap-2">
                <button type="submit" className="button" disabled={busy || roleName.trim() === ''} aria-busy={busy || undefined}>
                    {busy ? 'Importing…' : 'Import'}
                </button>
                {cancel}
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

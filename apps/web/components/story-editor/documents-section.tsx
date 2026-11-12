'use client';

import { useEffect, useRef, useState } from 'react';

import { announce } from '@/components/announcer';
import { Sheet } from '@/components/sheet/sheet';
import { useConnection } from '@/components/connection';
import { ApiError, ApiUnreachableError } from '@/lib/api';
import { addEstimate, documentSize, readDocumentFile } from '@/lib/documents';
import { DocumentSource, DocumentSummary, NewDocument, Story, storyApi } from '@/lib/story';
import { ADD_BUTTON } from './add-button';
import { Autosave } from './autosave';
import { ConfirmButton, TextField, Toolbar } from './fields';
import { EDITOR_CARD, NOTE } from './folding-card';

interface DocumentsSectionProps {
    storyId: number;
    documents: DocumentSummary[];
    commit: Autosave['commit'];
    applyWhole(story: Story): void;
    /** A title edit: shown at once, autosaved. */
    onTitle(documentId: number, title: string): void;
}

/** What the Add sheet holds, kept by the section so closing the sheet loses none of it (audit M18). */
interface Draft {
    title: string;
    text: string;
    address: string;
    source: { source: DocumentSource; sourceName: string | null };
}

const EMPTY_DRAFT: Draft = { title: '', text: '', address: '', source: { source: 'pasted', sourceName: null } };

/** An Add under way, or the reason the last one failed while the sheet was closed. */
type Adding = { kind: 'idle' } | { kind: 'adding'; title: string } | { kind: 'failed'; message: string };

const ERROR = 'm-0 text-md text-warning';
const QUIET = 'm-0 text-md text-muted';

/** A name for a Document in a sentence. */
function named(title: string): string {
    return title.trim() === '' ? 'the Document' : `“${title.trim()}”`;
}

/** How a card names where its text came from. */
function SourceLine({ document }: { document: DocumentSummary }) {
    const source =
        document.source === 'pasted' ? (
            'Pasted'
        ) : document.source === 'web' && document.sourceName ? (
            <a href={document.sourceName} target="_blank" rel="noreferrer noopener" className="text-inherit">
                {document.sourceName}
            </a>
        ) : (
            document.sourceName ?? 'File'
        );
    return (
        <p className="m-0 text-sm [overflow-wrap:anywhere] text-muted">
            {source} · {documentSize(document)}
        </p>
    );
}

/**
 * The Lore tab's Documents (.scratch/documents/spec.md: "Story editor"): longer texts the
 * Narrator looks things up in by meaning, a card each, and the sheet that adds one. Adding is
 * the only thing that spends.
 *
 * The sheet can always be closed (audit H6): a page still being fetched is let go, and an Add
 * under way carries on here, saying so, and lands as a card. What the sheet held stays until it
 * is added or cleared, so closing it loses nothing (M18).
 */
export function DocumentsSection({ storyId, documents, commit, applyWhole, onTitle }: DocumentsSectionProps) {
    const [sheetOpen, setSheetOpen] = useState(false);
    const [reading, setReading] = useState<DocumentSummary | null>(null);
    const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
    const [adding, setAdding] = useState<Adding>({ kind: 'idle' });
    /** The sheet's error after a failed Add, shown in the sheet while it is open. */
    const [addError, setAddError] = useState<string | null>(null);
    const sheetOpenRef = useRef(sheetOpen);
    sheetOpenRef.current = sheetOpen;

    const add = async () => {
        const sent = draft;
        setAdding({ kind: 'adding', title: sent.title });
        setAddError(null);
        let failure: string | null = null;
        const saved = await commit(
            () => storyApi.addDocument(storyId, { title: sent.title, text: sent.text, ...sent.source }),
            applyWhole,
            (message) => {
                failure = message;
            },
        );
        if (saved) {
            setDraft(EMPTY_DRAFT);
            setAdding({ kind: 'idle' });
            setSheetOpen(false);
            announce(`Added ${named(saved.documents.at(-1)?.title ?? sent.title)}.`);
        } else if (failure !== null) {
            setAdding(sheetOpenRef.current ? { kind: 'idle' } : { kind: 'failed', message: failure });
            setAddError(failure);
        } else {
            // The API could not be reached: the connection boundary says so; the draft stays.
            setAdding({ kind: 'idle' });
        }
    };

    return (
        <section aria-labelledby="documents-heading" className="mt-6">
            {/* An h2 under the page's h1, like the cards' titles (audit M12). */}
            <h2 id="documents-heading" className="mt-0 mb-1 text-lg">
                Documents
            </h2>
            <p className={NOTE}>Longer texts the Narrator looks things up in by meaning. Adding one costs less than a cent.</p>
            {documents.map((document, index) => (
                <section key={document.id} className={`${EDITOR_CARD} grid gap-2`} aria-label={`Document ${index + 1}`}>
                    <TextField label="Title" value={document.title} onChange={(title) => onTitle(document.id, title)} />
                    <SourceLine document={document} />
                    <Toolbar>
                        <button
                            type="button"
                            className="button button-quiet"
                            aria-label={`Read Document ${index + 1}`}
                            onClick={() => setReading(document)}
                        >
                            Read
                        </button>
                        <ConfirmButton
                            label="Remove"
                            ariaLabel={`Remove Document ${index + 1}`}
                            danger
                            question={`Remove ${document.title.trim() || 'this Document'}?`}
                            warning="The Narrator stops using it. Adding it again costs a call."
                            confirmLabel="Remove"
                            onConfirm={() => commit(() => storyApi.removeDocument(storyId, document.id), applyWhole)}
                            focusAfter={documentsHeading}
                        />
                    </Toolbar>
                </section>
            ))}
            {reading && <ReadDocumentSheet storyId={storyId} document={reading} onClose={() => setReading(null)} />}
            {/* Mounted while empty, so what it says once an Add goes on behind the closed sheet is read out (L12). */}
            <div role="status" className="empty:hidden">
                {adding.kind === 'adding' && !sheetOpen && (
                    <p className={`${QUIET} mb-3`}>Adding {named(adding.title)}… It appears here when it is done.</p>
                )}
            </div>
            {adding.kind === 'failed' && !sheetOpen && (
                <div role="alert" className="notice flex flex-wrap items-center gap-x-3 gap-y-2">
                    <p className="m-0 min-w-0 flex-1 basis-48">Couldn&apos;t add the Document: {adding.message} Its text is kept.</p>
                    <button type="button" className="button button-quiet !ml-0" onClick={() => setSheetOpen(true)}>
                        Open it again
                    </button>
                </div>
            )}
            <button type="button" className={ADD_BUTTON} onClick={() => setSheetOpen(true)}>
                + Add Document
            </button>
            {sheetOpen && (
                <AddDocumentSheet
                    storyId={storyId}
                    draft={draft}
                    onDraft={setDraft}
                    adding={adding.kind === 'adding'}
                    addError={addError}
                    onAdd={() => void add()}
                    onClose={() => {
                        setSheetOpen(false);
                        setAdding((current) => (current.kind === 'failed' ? { kind: 'idle' } : current));
                    }}
                />
            )}
        </section>
    );
}

/** Where focus lands after a Document is removed: the section's heading. */
function documentsHeading(): HTMLElement | null {
    const heading = document.getElementById('documents-heading');
    heading?.setAttribute('tabindex', '-1');
    return heading;
}

/** "Read": the Document's text as added, read-only. */
function ReadDocumentSheet({ storyId, document, onClose }: { storyId: number; document: DocumentSummary; onClose(): void }) {
    const [text, setText] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let live = true;
        storyApi.readDocument(storyId, document.id).then(
            (read) => live && setText(read.text),
            (failure: unknown) => live && setError(failure instanceof ApiUnreachableError ? failure.message : (failure as Error).message),
        );
        return () => {
            live = false;
        };
    }, [storyId, document.id]);

    const name = document.title.trim() || 'Document';
    return (
        <Sheet label={name} title={name} onClose={onClose}>
            <div className="grid gap-3 pb-2">
                <SourceLine document={document} />
                {error ? (
                    <p role="alert" className={ERROR}>
                        {error}
                    </p>
                ) : text === null ? (
                    <p role="status" className={QUIET}>
                        Loading…
                    </p>
                ) : (
                    <pre className="m-0 font-[inherit] text-note leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">{text}</pre>
                )}
            </div>
        </Sheet>
    );
}

interface AddDocumentSheetProps {
    storyId: number;
    draft: Draft;
    onDraft(draft: Draft): void;
    /** An Add is under way: Add waits, and closing lets it carry on behind the sheet. */
    adding: boolean;
    /** Why the last Add failed; the text stays. */
    addError: string | null;
    onAdd(): void;
    onClose(): void;
}

/** How long typing must rest before the estimate is said (audit L12: not on every key). */
const SAY_ESTIMATE_MS = 800;

/**
 * "+ Add Document": paste the text, load a file, or fetch a web page; read and trim it, check
 * the estimate, tap Add. Only Add spends. On an error the text stays. Cancel, Close, Escape and
 * the backdrop always close it (audit H6): a fetch still running is let go, and an Add under way
 * goes on.
 */
function AddDocumentSheet({ storyId, draft, onDraft, adding, addError, onAdd, onClose }: AddDocumentSheetProps) {
    const { reportUnreachable } = useConnection();
    const [fetching, setFetching] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [spokenEstimate, setSpokenEstimate] = useState('');
    const filePicker = useRef<HTMLInputElement>(null);
    /** False once the sheet is closed: a page that arrives after that is let go. */
    const open = useRef(true);
    useEffect(() => {
        open.current = true;
        return () => {
            open.current = false;
        };
    }, []);
    const latest = useRef(draft);
    latest.current = draft;
    const change = (fields: Partial<Draft>) => onDraft({ ...latest.current, ...fields });

    const estimate = draft.text.trim() === '' ? 'Paste some text to see what it makes.' : addEstimate(draft.text);
    useEffect(() => {
        const timer = setTimeout(() => setSpokenEstimate(estimate), SAY_ESTIMATE_MS);
        return () => clearTimeout(timer);
    }, [estimate]);

    const busy = fetching || adding;
    const shownError = error ?? addError;

    /** The API fetches the page and answers its title and text; nothing is stored or spent. */
    const fetchPage = async () => {
        setFetching(true);
        setError(null);
        try {
            const page = await storyApi.fetchPage(storyId, latest.current.address.trim());
            if (!open.current) return;
            change({ title: page.title, text: page.text, source: { source: 'web', sourceName: page.url } });
        } catch (failure) {
            if (!open.current) return;
            if (failure instanceof ApiUnreachableError) reportUnreachable();
            else setError(failure instanceof ApiError ? failure.message : "Couldn't fetch the page. Paste its text instead.");
        } finally {
            if (open.current) setFetching(false);
        }
    };

    /** Read in the browser, with no upload: the text fills the box, and the title comes from the file name. */
    const loadFile = async (file: File | undefined) => {
        if (!file) return;
        const loaded = await readDocumentFile(file);
        if ('error' in loaded) {
            setError(loaded.error);
            return;
        }
        setError(null);
        change({ title: loaded.title, text: loaded.text, source: { source: 'file', sourceName: loaded.fileName } });
    };

    const hasDraft = draft.title !== '' || draft.text !== '' || draft.address !== '';

    return (
        <Sheet label="Add Document" title="Add Document" onClose={onClose}>
            <div className="grid gap-3 pb-2">
                <form
                    className="flex items-end gap-2 [&>:first-child]:m-0 [&>:first-child]:min-w-0 [&>:first-child]:flex-1"
                    onSubmit={(event) => {
                        event.preventDefault();
                        if (draft.address.trim() !== '' && !busy) void fetchPage();
                    }}
                >
                    <TextField
                        label="Web page address"
                        value={draft.address}
                        onChange={(address) => change({ address })}
                        placeholder="https://"
                        type="url"
                        inputMode="url"
                        spellCheck={false}
                        autoCapitalize="off"
                        autoComplete="url"
                    />
                    <button
                        type="submit"
                        className="button button-quiet"
                        aria-disabled={busy || draft.address.trim() === '' || undefined}
                        aria-busy={fetching || undefined}
                    >
                        {fetching ? 'Fetching…' : 'Fetch'}
                    </button>
                </form>
                <div className="flex flex-wrap items-center gap-2">
                    <button type="button" className="button button-quiet" disabled={busy} onClick={() => filePicker.current?.click()}>
                        Load a .txt or .md file
                    </button>
                    <input
                        ref={filePicker}
                        type="file"
                        accept=".txt,.md,text/plain,text/markdown"
                        hidden
                        aria-label="Text file"
                        onChange={(event) => {
                            void loadFile(event.target.files?.[0]);
                            // The same file can be picked again after it is trimmed away.
                            event.target.value = '';
                        }}
                    />
                </div>
                <TextField label="Title" value={draft.title} onChange={(title) => change({ title })} placeholder="From the first line when left empty" />
                <TextField label="Text" value={draft.text} onChange={(text) => change({ text })} multiline rows={6} placeholder="Paste the text here" />
                <p className={QUIET}>{estimate}</p>
                <span className="sr-only" aria-live="polite">
                    {spokenEstimate}
                </span>
                {shownError && (
                    <p role="alert" className={ERROR}>
                        {shownError}
                    </p>
                )}
                {adding && <p className={QUIET}>You can close this sheet: adding goes on, and the Document appears when it is done.</p>}
                <div className="flex flex-wrap items-center justify-end gap-2">
                    {hasDraft && !busy && (
                        <span className="mr-auto">
                            <ConfirmButton
                                label="Clear"
                                question="Clear the address, title and text?"
                                confirmLabel="Clear"
                                onConfirm={() => {
                                    setError(null);
                                    onDraft(EMPTY_DRAFT);
                                }}
                                focusAfter={() => document.querySelector<HTMLElement>('[role="dialog"][aria-label="Add Document"] input')}
                            />
                        </span>
                    )}
                    {/* Always usable (H6): the text is kept, a fetch is let go, an Add goes on. */}
                    <button type="button" className="button button-quiet" onClick={onClose}>
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="button"
                        disabled={!busy && draft.text.trim() === ''}
                        aria-disabled={busy || undefined}
                        aria-busy={adding || undefined}
                        onClick={busy ? undefined : onAdd}
                    >
                        {adding ? 'Adding…' : 'Add'}
                    </button>
                </div>
            </div>
        </Sheet>
    );
}

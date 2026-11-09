'use client';

import { useEffect, useRef, useState } from 'react';

import { Sheet } from '@/components/sheet/sheet';
import { useConnection } from '@/components/connection';
import { ApiError, ApiUnreachableError } from '@/lib/api';
import { addEstimate, documentSize, readDocumentFile } from '@/lib/documents';
import { DocumentSource, DocumentSummary, NewDocument, Story, storyApi } from '@/lib/story';
import { Autosave } from './autosave';
import { ConfirmButton, TextField, Toolbar } from './fields';
import styles from './documents.module.css';
import editorStyles from './story-editor.module.css';

interface DocumentsSectionProps {
    storyId: number;
    documents: DocumentSummary[];
    commit: Autosave['commit'];
    applyWhole(story: Story): void;
    /** A title edit: shown at once, autosaved. */
    onTitle(documentId: number, title: string): void;
}

/** How a card names where its text came from. */
function SourceLine({ document }: { document: DocumentSummary }) {
    const source =
        document.source === 'pasted' ? (
            'Pasted'
        ) : document.source === 'web' && document.sourceName ? (
            <a href={document.sourceName} target="_blank" rel="noreferrer noopener">
                {document.sourceName}
            </a>
        ) : (
            document.sourceName ?? 'File'
        );
    return (
        <p className={styles.meta}>
            {source} · {documentSize(document)}
        </p>
    );
}

/**
 * The Lore tab's Documents (.scratch/documents/spec.md: "Story editor"): longer texts the
 * Narrator looks things up in by meaning, a card each, and the sheet that adds one. Adding is
 * the only thing that spends.
 */
export function DocumentsSection({ storyId, documents, commit, applyWhole, onTitle }: DocumentsSectionProps) {
    const [adding, setAdding] = useState(false);
    const [reading, setReading] = useState<DocumentSummary | null>(null);

    return (
        <section aria-labelledby="documents-heading" className={styles.section}>
            <h3 id="documents-heading" className={styles.heading}>
                Documents
            </h3>
            <p className={editorStyles.note}>Longer texts the Narrator looks things up in by meaning. Adding one costs less than a cent.</p>
            {documents.map((document, index) => (
                <section key={document.id} className={`${editorStyles.card} ${styles.card}`} aria-label={`Document ${index + 1}`}>
                    <TextField label="Title" value={document.title} onChange={(title) => onTitle(document.id, title)} />
                    <SourceLine document={document} />
                    <Toolbar>
                        <button type="button" className="button button-quiet" onClick={() => setReading(document)}>
                            Read
                        </button>
                        <ConfirmButton
                            label="Remove"
                            danger
                            question={`Remove ${document.title.trim() || 'this Document'}?`}
                            warning="The Narrator stops using it. Adding it again costs a call."
                            confirmLabel="Remove"
                            onConfirm={() => void commit(() => storyApi.removeDocument(storyId, document.id), applyWhole)}
                        />
                    </Toolbar>
                </section>
            ))}
            {reading && <ReadDocumentSheet storyId={storyId} document={reading} onClose={() => setReading(null)} />}
            <button type="button" className={editorStyles.add} onClick={() => setAdding(true)}>
                + Add Document
            </button>
            {adding && (
                <AddDocumentSheet
                    storyId={storyId}
                    onAdd={async (document) => {
                        let failure: string | null = null;
                        const saved = await commit(() => storyApi.addDocument(storyId, document), applyWhole, (message) => {
                            failure = message;
                        });
                        if (saved) setAdding(false);
                        return failure;
                    }}
                    onClose={() => setAdding(false)}
                />
            )}
        </section>
    );
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
            <div className={styles.sheet}>
                <SourceLine document={document} />
                {error ? (
                    <p role="alert" className={styles.error}>
                        {error}
                    </p>
                ) : text === null ? (
                    <p className={styles.estimate}>Loading…</p>
                ) : (
                    <pre className={styles.reading}>{text}</pre>
                )}
            </div>
        </Sheet>
    );
}

interface AddDocumentSheetProps {
    storyId: number;
    /** Answers the error to show, or null once added (or when the API could not be reached). */
    onAdd(document: NewDocument): Promise<string | null>;
    onClose(): void;
}

/**
 * "+ Add Document": paste the text, load a file, or fetch a web page; read and trim it, check
 * the estimate, tap Add. Only Add spends. On an error the text stays.
 */
function AddDocumentSheet({ storyId, onAdd, onClose }: AddDocumentSheetProps) {
    const { reportUnreachable } = useConnection();
    const [title, setTitle] = useState('');
    const [text, setText] = useState('');
    const [source, setSource] = useState<{ source: DocumentSource; sourceName: string | null }>({ source: 'pasted', sourceName: null });
    const [address, setAddress] = useState('');
    const [busy, setBusy] = useState<'adding' | 'fetching' | null>(null);
    const [error, setError] = useState<string | null>(null);
    const filePicker = useRef<HTMLInputElement>(null);

    /** The API fetches the page and answers its title and text; nothing is stored or spent. */
    const fetchPage = async () => {
        setBusy('fetching');
        setError(null);
        try {
            const page = await storyApi.fetchPage(storyId, address.trim());
            setTitle(page.title);
            setText(page.text);
            setSource({ source: 'web', sourceName: page.url });
        } catch (failure) {
            if (failure instanceof ApiUnreachableError) reportUnreachable();
            else setError(failure instanceof ApiError ? failure.message : "Couldn't fetch the page. Paste its text instead.");
        } finally {
            setBusy(null);
        }
    };

    const add = async () => {
        setBusy('adding');
        setError(null);
        const failure = await onAdd({ title, text, ...source });
        setBusy(null);
        setError(failure);
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
        setTitle(loaded.title);
        setText(loaded.text);
        setSource({ source: 'file', sourceName: loaded.fileName });
    };

    return (
        <Sheet label="Add Document" title="Add Document" onClose={busy ? () => {} : onClose}>
            <div className={styles.sheet}>
                <form
                    className={styles.address}
                    onSubmit={(event) => {
                        event.preventDefault();
                        if (address.trim() !== '' && !busy) void fetchPage();
                    }}
                >
                    <TextField label="Web page address" value={address} onChange={setAddress} placeholder="https://" />
                    <button type="submit" className="button button-quiet" disabled={busy !== null || address.trim() === ''}>
                        {busy === 'fetching' ? 'Fetching…' : 'Fetch'}
                    </button>
                </form>
                <div className={styles.ways}>
                    <button type="button" className="button button-quiet" disabled={busy !== null} onClick={() => filePicker.current?.click()}>
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
                <TextField label="Title" value={title} onChange={setTitle} placeholder="From the first line when left empty" />
                <TextField label="Text" value={text} onChange={setText} multiline rows={6} placeholder="Paste the text here" />
                <p className={styles.estimate} aria-live="polite">
                    {text.trim() === '' ? 'Paste some text to see what it makes.' : addEstimate(text)}
                </p>
                {error && (
                    <p role="alert" className={styles.error}>
                        {error}
                    </p>
                )}
                <div className={styles.actions}>
                    <button type="button" className="button button-quiet" disabled={busy !== null} onClick={onClose}>
                        Cancel
                    </button>
                    <button type="button" className="button" disabled={busy !== null || text.trim() === ''} onClick={() => void add()}>
                        {busy === 'adding' ? 'Adding…' : 'Add'}
                    </button>
                </div>
            </div>
        </Sheet>
    );
}

// Documents (.scratch/documents/spec.md): helpers for the Lore tab's Documents section.

import { apiFetch } from './api';
import { DocumentSummary } from './story';

/** The API's limit, checked there too (DocumentTooLargeError). */
export const MAX_DOCUMENT_CHARACTERS = 200_000;

/**
 * Roughly how many passages a text makes, for the live estimate under the sheet's text: the
 * API packs about 400 estimated tokens (four characters each) a passage, each after the first
 * opening with about 60 of the one before. "About", so it needs not match the split exactly.
 */
export function estimatePassages(text: string): number {
    const tokens = Math.ceil(text.trim().length / 4);
    if (tokens === 0) return 0;
    return tokens <= 400 ? 1 : 1 + Math.ceil((tokens - 400) / 340);
}

/** The line under the sheet's text: what Add will make and spend. */
export function addEstimate(text: string): string {
    const passages = estimatePassages(text);
    return `About ${passages} ${passages === 1 ? 'passage' : 'passages'} · less than $0.01`;
}

/** A card's size: characters and passages. */
export function documentSize(document: Pick<DocumentSummary, 'characters' | 'passages'>): string {
    const characters = `${document.characters.toLocaleString('en-US')} ${document.characters === 1 ? 'character' : 'characters'}`;
    return `${characters} · ${document.passages} ${document.passages === 1 ? 'passage' : 'passages'}`;
}

/** A passage the last turn sent (mirrors DocumentPassageInPlayDTO). */
export interface DocumentPassageInPlay {
    documentId: number;
    documentTitle: string;
    position: number;
    /** Its first ~160 characters. */
    excerpt: string;
}

/** What the last turn took from the Story's Documents (mirrors DocumentsInPlayResponseBodyDTO). */
export interface DocumentsInPlay {
    hasDocuments: boolean;
    /** `none` until a turn has searched. */
    status: 'none' | 'found' | 'failed';
    passages: DocumentPassageInPlay[];
}

export const documentsApi = {
    /** What the newest AI Message's search used; never a fresh search, so it costs nothing. */
    inPlay: (storyId: number, chatId: number) => apiFetch<DocumentsInPlay>(`/stories/${storyId}/chats/${chatId}/documents`),
};

/** The browser refuses a file over this before reading it (.scratch/documents/spec.md: "Files and web pages"). */
export const MAX_DOCUMENT_FILE_BYTES = 1024 * 1024;

/** A loaded file as the Add sheet takes it, or why it can't be. */
export type LoadedFile = { title: string; text: string; fileName: string } | { error: string };

/**
 * Reads a .txt or .md file on the phone, with no upload: refused over 1 MB or of another type
 * before reading, and refused when it doesn't decode as UTF-8. The title is the file name
 * without its extension.
 */
export async function readDocumentFile(file: File): Promise<LoadedFile> {
    const extension = /\.(txt|md)$/i.exec(file.name);
    if (!extension) return { error: 'Only a .txt or .md file can be loaded.' };
    if (file.size > MAX_DOCUMENT_FILE_BYTES) return { error: 'That file is over 1 MB. Split it, or paste part of it.' };
    let text: string;
    try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
    } catch {
        return { error: "Couldn't read this file as text" };
    }
    return { title: file.name.slice(0, extension.index), text, fileName: file.name };
}

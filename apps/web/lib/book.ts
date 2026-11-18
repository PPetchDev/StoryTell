import { apiFetch, apiSend } from './api';

// Mirrors the API's Book DTO (apps/api/src/api/book/dto/book.dto.ts), .scratch/chat-novel/spec.md.

/** Not written; waiting its turn; being written now; written; the last write failed (old text stays); nothing to write. */
export type BookChapterState = 'unwritten' | 'queued' | 'writing' | 'written' | 'failed' | 'empty';

/** One Book chapter: a Chapter of the Chat retold as novel prose. */
export interface BookChapter {
    number: number;
    sceneName: string;
    title: string | null;
    text: string | null;
    writtenBy: 'ai' | 'user' | null;
    state: BookChapterState;
    /** Its Chapter's Messages changed since it was written, or its Chapter is gone. */
    outOfDate: boolean;
    /** Its Chapter was taken back: it can be removed, not written. */
    chapterGone: boolean;
    /** The text so far while it is being written. */
    draft: string | null;
    failedReason: string | null;
    /** About what writing it costs; null when it can't be written. */
    priceUsd: number | null;
    updatedAt: string | null;
}

export interface Book {
    title: string;
    chatTitle: string;
    identityName: string;
    writing: boolean;
    writeAllCount: number;
    writeAllPriceUsd: number;
    chapters: BookChapter[];
}

const book = (storyId: number | string, chatId: number | string) => `/stories/${storyId}/chats/${chatId}/book`;

export const bookApi = {
    get: (storyId: number | string, chatId: number | string) => apiFetch<Book>(book(storyId, chatId)),
    /** Writes the chapters named, or every one Write all covers, in the background. */
    write: (storyId: number | string, chatId: number | string, numbers?: number[]) => apiSend<Book>('POST', `${book(storyId, chatId)}/write`, numbers ? { numbers } : {}),
    save: (storyId: number | string, chatId: number | string, number: number, title: string, text: string) =>
        apiSend<Book>('PUT', `${book(storyId, chatId)}/chapters/${number}`, { title, text }),
    remove: (storyId: number | string, chatId: number | string, number: number) => apiSend<Book>('DELETE', `${book(storyId, chatId)}/chapters/${number}`),
    /** A plain link: the API answers it as an attachment. */
    epubHref: (storyId: number | string, chatId: number | string) => `/api${book(storyId, chatId)}/epub`,
};

export const bookHref = (storyId: number | string, chatId: number | string) => `/stories/${storyId}/chats/${chatId}/book`;

/** An estimate, so it reads "about": `~$0.012`, `~$0.05`, `~$1.20`. */
export function formatEstimate(usd: number): string {
    if (usd >= 1) return `~$${usd.toFixed(2)}`;
    const cents = Math.round(usd * 100);
    return Math.abs(usd * 100 - cents) < 1e-9 ? `~$${usd.toFixed(2)}` : `~$${usd.toFixed(3)}`;
}

/** A Book chapter's heading: its own title once written, else its Scene's name. */
export function chapterTitle(chapter: BookChapter): string {
    return chapter.title ?? chapter.sceneName;
}

/** Prose split on blank lines, as the EPUB splits it. */
export function paragraphs(text: string): string[] {
    return text
        .replace(/\r\n?/g, '\n')
        .split(/\n\s*\n/)
        .map((paragraph) => paragraph.trim())
        .filter((paragraph) => paragraph !== '');
}

/** Where the user was reading, kept per Chat in this browser. */
export interface BookPlace {
    number: number;
    /** How far down the chapter, from 0 to 1. */
    scroll: number;
}

const placeKey = (chatId: number | string) => `storytell:book:${chatId}`;

export function readPlace(chatId: number | string): BookPlace | null {
    try {
        const raw = window.localStorage.getItem(placeKey(chatId));
        if (!raw) return null;
        const place = JSON.parse(raw) as Partial<BookPlace>;
        if (typeof place.number !== 'number' || !Number.isInteger(place.number)) return null;
        return { number: place.number, scroll: typeof place.scroll === 'number' ? Math.min(1, Math.max(0, place.scroll)) : 0 };
    } catch {
        return null;
    }
}

export function savePlace(chatId: number | string, place: BookPlace): void {
    try {
        window.localStorage.setItem(placeKey(chatId), JSON.stringify(place));
    } catch {
        // No storage (a private window): the Book opens at its first chapter next time.
    }
}

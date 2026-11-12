'use client';

import Link from 'next/link';
import { FormEvent, ReactNode, RefObject, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

import { COLUMN, ICON_BUTTON, LABEL_CAPS, PANEL_NOTE, SEND_BUTTON } from '@/components/chat/chat-classes';
import { useConnection } from '@/components/connection';
import { PencilIcon, PlayIcon, StopIcon, UndoIcon } from '@/components/icons';
import { ApiUnreachableError } from '@/lib/api';
import { backgroundNotice, Chat, chatApi, SuggestedReply } from '@/lib/chat';
import { insertSavedReply, SavedReply, TraySavedReply } from '@/lib/saved-replies';
import { DictateButton, dictationNote, hasDictationStatus, RecordingBar, useDictation } from './dictation';
import { SavedRepliesTray } from './saved-replies-tray';

/**
 * A status region that is there from the first paint and fills when it has something to say
 * (audit L12): a region mounted already holding its words is often never read. Empty, it takes
 * no room.
 */
function Status({ children, className }: { children: ReactNode; className?: string }) {
    return (
        <div role="status" className={className}>
            {children}
        </div>
    );
}

interface NoticesProps {
    chat: Chat;
    /** How many of the Chat's Snapshots failed, their automatic retry too. */
    failedSnapshots: number;
    /** Reruns everything that failed in the background. */
    onRetryBackground(): void;
    retrying: boolean;
}

/** What stands between the user and the next turn, if anything: each in a region of its own, mounted throughout. */
function Notices({ chat, failedSnapshots, onRetryBackground, retrying }: NoticesProps) {
    // One notice, in plain words, for everything that didn't save; one Retry reruns all of it.
    const failed = backgroundNotice(chat, failedSnapshots);
    return (
        <>
            <Status>
                {failed && (
                    <p className="notice">
                        {failed}{' '}
                        <button type="button" className="button button-quiet" disabled={retrying} onClick={onRetryBackground}>
                            {retrying ? 'Retrying…' : 'Retry'}
                        </button>
                    </p>
                )}
            </Status>
            <Status>
                {!chat.playable && (
                    <p className="notice">
                        Sending is blocked: the Story has empty fields. Still to fill in: {chat.missing.map((field) => field.label).join(', ')}.{' '}
                        <Link href={`/stories/${chat.storyId}`}>Edit Story</Link>
                    </p>
                )}
            </Status>
            <Status>
                {chat.textCreditOut && (
                    <p className="notice">
                        Sending is blocked: text credit is used up. <Link href="/usage">See usage</Link>
                    </p>
                )}
            </Status>
            <Status>
                {chat.drift && (
                    <p className="notice">
                        Drift notice: the last reply came from {chat.drift.lastModelLabel}; the play model is now {chat.drift.playModelLabel}. Characters
                        may sound different from here on.
                    </p>
                )}
            </Status>
        </>
    );
}

/** The cards ⚡ shows: nothing, the short wait, the three, or a failed ask. */
type Suggestions =
    | { status: 'closed' }
    | { status: 'loading'; afterMessageId: number | null }
    | { status: 'ready'; afterMessageId: number | null; replies: SuggestedReply[] }
    | { status: 'failed'; afterMessageId: number | null };

/**
 * Spec: "Suggested replies". ⚡ asks for three, and ⚡ again closes them. They are made for
 * the Chat as it stands, so once a new Message arrives (a send, Continue, an edit) they are
 * gone: never cached across turns. An answer that comes back after they were closed is dropped.
 */
function useSuggestedReplies(chat: Chat) {
    const { reportUnreachable } = useConnection();
    const [state, setState] = useState<Suggestions>({ status: 'closed' });
    const asked = useRef(0);
    const newestId = chat.messages[chat.messages.length - 1]?.id ?? null;
    const shown: Suggestions = state.status !== 'closed' && state.afterMessageId === newestId ? state : { status: 'closed' };

    const close = () => {
        asked.current++;
        setState({ status: 'closed' });
    };

    const toggle = async () => {
        if (shown.status !== 'closed') return close();
        const ask = ++asked.current;
        setState({ status: 'loading', afterMessageId: newestId });
        try {
            const { suggestions } = await chatApi.suggest(chat.storyId, chat.id);
            if (asked.current === ask) setState({ status: 'ready', afterMessageId: newestId, replies: suggestions });
        } catch (caught) {
            if (asked.current !== ask) return;
            if (caught instanceof ApiUnreachableError) {
                setState({ status: 'closed' });
                reportUnreachable();
            } else {
                setState({ status: 'failed', afterMessageId: newestId });
            }
        }
    };

    return { shown, toggle, close };
}

/** ✍️ Write for me: nothing to show, the wait, or a failed ask. */
type Writing = 'idle' | 'writing' | 'failed';

/**
 * .scratch/write-for-me/spec.md, "Web". ✍️ sends the box's text as the draft and puts the answer
 * in its place; Undo puts the draft back while the box still holds exactly the answer. A second
 * tap while it waits cancels: the answer is dropped when it arrives (its credit is already spent).
 */
function useWriteForMe(
    chat: Chat,
    draft: string,
    onDraft: (text: string) => void,
    box: RefObject<HTMLTextAreaElement | null>,
    /** A turn or a Chat write started from elsewhere (Retry, ↺ Again, an edit): a late answer is dropped. */
    chatBusy: boolean,
) {
    const { reportUnreachable } = useConnection();
    const [status, setStatus] = useState<Writing>('idle');
    const [undo, setUndo] = useState<{ before: string; written: string } | null>(null);
    const asked = useRef(0);
    // Leaving the Chat drops a late answer too.
    useEffect(() => () => void asked.current++, []);
    // So does a turn or write started from the thread meanwhile: ✍️ is disabled then, so it can't be cancelled.
    useEffect(() => {
        if (!chatBusy) return;
        asked.current++;
        setStatus((current) => (current === 'writing' ? 'idle' : current));
    }, [chatBusy]);
    // Any change to the box (typing, a Suggested reply, a send) ends the Undo, for good.
    const offered = undo !== null && draft === undo.written;
    useEffect(() => {
        if (undo !== null && draft !== undo.written) setUndo(null);
    }, [draft, undo]);
    // A failure says so until the box changes or ⚡ or ✍️ is tapped; the draft itself is untouched.
    useEffect(() => {
        setStatus((current) => (current === 'failed' ? 'idle' : current));
    }, [draft]);

    const cancel = () => {
        asked.current++;
        setStatus('idle');
    };

    const toggle = async () => {
        if (status === 'writing') return cancel();
        const ask = ++asked.current;
        const before = draft;
        // A new Write for me ends the last one's Undo; a tap on it meanwhile would fight the answer.
        setUndo(null);
        setStatus('writing');
        try {
            const { text } = await chatApi.writeForMe(chat.storyId, chat.id, before);
            if (asked.current !== ask) return;
            setStatus('idle');
            setUndo({ before, written: text });
            onDraft(text);
            requestAnimationFrame(() => {
                const el = box.current;
                if (!el) return;
                el.focus();
                el.setSelectionRange(text.length, text.length);
            });
        } catch (caught) {
            if (asked.current !== ask) return;
            if (caught instanceof ApiUnreachableError) {
                setStatus('idle');
                reportUnreachable();
            } else {
                setStatus('failed');
            }
        }
    };

    const restore = () => {
        if (!undo) return;
        setUndo(null);
        onDraft(undo.before);
    };

    /** The failure is the panel's only while nothing else has replaced it. */
    const dismiss = () => setStatus((current) => (current === 'failed' ? 'idle' : current));

    return { status, toggle, cancel, dismiss, offered, restore };
}

const SUGGESTION_KIND_LABEL: Record<SuggestedReply['kind'], string> = {
    action: 'Do',
    speech: 'Say',
    move: 'Bold move',
};

const SUGGESTION_CARD = [
    'bare-button flex w-full flex-col gap-0.5',
    'rounded-lg border border-field-line bg-surface px-3 py-2',
    'text-left text-note leading-snug text-text',
    'cursor-pointer press focus-ring active:bg-surface-raised',
].join(' ');

/** Above the box: the three cards. A tap on a card only fills the box. The wait and a failure are the panel's lines. */
function SuggestionCards({ suggestions, onPick }: { suggestions: Suggestions; onPick(text: string): void }) {
    if (suggestions.status !== 'ready') return null;
    return (
        <ul className="m-0 mb-1 flex list-none flex-col gap-2 p-0" aria-label="Suggested replies">
            {suggestions.replies.map((reply) => (
                <li key={reply.kind}>
                    <button type="button" className={SUGGESTION_CARD} onClick={() => onPick(reply.text)}>
                        <span className={LABEL_CAPS}>{SUGGESTION_KIND_LABEL[reply.kind]}</span>
                        <span>{reply.text}</span>
                    </button>
                </li>
            ))}
        </ul>
    );
}

/**
 * The Saved replies tray's lines and whether it is open (.scratch/saved-replies-and-replace-rules/spec.md:
 * "Composer"). The lines come with the Chat; a draft saved from the tray joins its group at once.
 */
function useSavedRepliesTray(chat: Chat) {
    const [open, setOpen] = useState(false);
    const chatKey = JSON.stringify(chat.savedReplies);
    const [lines, setLines] = useState<{ key: string; lines: TraySavedReply[] }>({ key: chatKey, lines: chat.savedReplies });
    // A fresh Chat answer (after a send, say) carries the lines as stored.
    if (lines.key !== chatKey) setLines({ key: chatKey, lines: chat.savedReplies });

    const saved = (scope: TraySavedReply['scope'], scopeLines: SavedReply[]) =>
        setLines((current) => ({
            key: current.key,
            lines: [
                ...(scope === 'story' ? scopeLines.map((line) => ({ ...line, scope })) : current.lines.filter((line) => line.scope === 'story')),
                ...(scope === 'app' ? scopeLines.map((line) => ({ ...line, scope })) : current.lines.filter((line) => line.scope === 'app')),
            ],
        }));

    return { open, setOpen, lines: lines.lines, saved };
}

/** Sets the box's height to its text's, which the CSS max-height caps. */
function fitToText(box: HTMLTextAreaElement) {
    box.style.height = 'auto';
    const borders = box.offsetHeight - box.clientHeight;
    box.style.height = `${box.scrollHeight + borders}px`;
}

/**
 * Fits the box to its text, from one row up to about five lines, past which it scrolls
 * (spec: "Composer"). A new width (a turned phone) rewraps the text, so it fits again then.
 */
function useAutoGrow(value: string) {
    const ref = useRef<HTMLTextAreaElement>(null);
    useLayoutEffect(() => {
        if (ref.current) fitToText(ref.current);
    }, [value]);
    useEffect(() => {
        const refit = () => {
            if (ref.current) fitToText(ref.current);
        };
        window.addEventListener('resize', refit);
        return () => window.removeEventListener('resize', refit);
    }, []);
    return ref;
}

/**
 * The * button: the selected text becomes `*text*` with the caret after it; with nothing
 * selected, an empty `**` pair opens with the caret inside.
 */
export function wrapAction(text: string, start: number, end: number): { next: string; caret: number } {
    const selected = text.slice(start, end);
    const next = `${text.slice(0, start)}*${selected}*${text.slice(end)}`;
    return { next, caret: selected === '' ? start + 1 : end + 2 };
}

/**
 * Enter sends on a physical keyboard (spec: "Composer"). A phone's on-screen keyboard has no
 * Shift+Enter, so where no fine pointer is present, Enter is a new line and the button sends.
 */
function enterSends(): boolean {
    return window.matchMedia('(any-pointer: fine)').matches;
}

/** A pointer press that leaves focus where it was: the box keeps it, and a phone keeps its keyboard up. */
const keepFocus = (event: { preventDefault(): void }) => event.preventDefault();

/** ■ Stop, in the send button's place while a reply is written: quieter, so it reads as "end", not "go". */
const STOP_BUTTON = [
    'bare-button grid shrink-0 place-items-center',
    'size-11 rounded-full bg-surface-raised inset-ring inset-ring-muted',
    'text-text',
    'cursor-pointer press focus-ring',
].join(' ');

/** The box: one row that grows to about five lines, then scrolls; 1rem text keeps a phone from zooming in. */
const BOX = [
    'min-w-0 flex-1 resize-none overflow-y-auto',
    // One line is 44px tall, a phone's smallest comfortable field; five lines at most.
    'max-h-[calc(5*1.4em_+_1.25rem_+_2px)]',
    'rounded-2xl border border-field-line bg-surface px-3.5 py-2.5',
    'font-[inherit] text-base leading-[1.4] text-text',
    'focus-ring',
].join(' ');

interface ChatComposerProps {
    chat: Chat;
    draft: string;
    /** A turn is being written. */
    writing: boolean;
    /** A write that runs no turn is in flight (an edit, Reset, a retry). */
    busy: boolean;
    /** Sending is blocked: the Story isn't playable or text credit is out. */
    blocked: boolean;
    error: string | null;
    rollback: string | null;
    snapshotError: string | null;
    /** The Chat's failed Snapshots, for the background notice. */
    failedSnapshots: number;
    onDraft(text: string): void;
    onSend(): void;
    /** ▶ on an empty box: the story goes on without a line from the user. */
    onContinue(): void;
    /** ■ Stop, in place of the send button while a reply is written. */
    onStop(): void;
    onRetry(): void;
    /** The background notice's one Retry: the failed judge, extraction and Snapshots again. */
    onRetryBackground(): void;
    /** The composer's second band: the Character row (Nudge), or nothing. */
    characterRow?: (writingForMe: boolean) => ReactNode;
}

/**
 * Under the thread: what blocks or failed, and the box the user writes in. The box stays
 * writable while a reply is written (audit H8): the next line can be drafted, only sending
 * waits, and focus never leaves it for Send or comes back to nothing after a turn.
 */
export function ChatComposer({
    chat,
    draft,
    writing,
    busy,
    blocked,
    error,
    rollback,
    snapshotError,
    failedSnapshots,
    onDraft,
    onSend,
    onContinue,
    onStop,
    onRetry,
    onRetryBackground,
    characterRow,
}: ChatComposerProps) {
    const box = useAutoGrow(draft);
    const boxId = useId();
    const suggestions = useSuggestedReplies(chat);
    const tray = useSavedRepliesTray(chat);
    /** Whether the box has been focused since the Chat opened: until then a Saved reply goes at the end. */
    const boxFocused = useRef(false);
    const writer = useWriteForMe(chat, draft, onDraft, box, writing || busy);
    /** ✍️ is waiting: the box is read-only and nothing else may change or send it. */
    const writingForMe = writer.status === 'writing';
    const dictation = useDictation(chat.storyId, chat.id, draft, onDraft);
    /** A recording or its transcription is under way: ⚡ and ✍️ wait, and the box takes nothing new. */
    const dictating = dictation.active;
    const micRef = useRef<HTMLButtonElement>(null);
    // .scratch/dictation/spec.md: 🎤 waits like the box does, and says why when the Venice pool is out.
    const micDisabledReason = chat.imageCreditOut
        ? 'Venice credit is used up'
        : writing || busy || writingForMe
          ? 'Wait for the current write to finish'
          : null;
    const empty = draft.trim() === '';
    /** Sending waits on every write in flight (audit M28), not only on a turn. */
    const cantSend = writing || busy || blocked || writingForMe || dictating;
    const send = (event: FormEvent) => {
        event.preventDefault();
        // Enter on an empty box does nothing; only a tap on ▶ lets the story go on.
        if (empty || cantSend) return;
        suggestions.close();
        tray.setOpen(false);
        onSend();
    };
    /** A Saved reply goes in at the caret (spec: "Composer"); nothing is sent. */
    const pickSavedReply = (line: string) => {
        const el = box.current;
        const selection = el && boxFocused.current ? { start: el.selectionStart, end: el.selectionEnd } : { start: draft.length, end: draft.length };
        const { next, caret } = insertSavedReply(draft, line, chat.identityName, selection);
        onDraft(next);
        requestAnimationFrame(() => {
            if (!el) return;
            el.focus();
            el.setSelectionRange(caret, caret);
        });
    };

    // Whether the user was last in the composer: a tap anywhere else, or focus elsewhere, says not.
    const footerRef = useRef<HTMLElement>(null);
    const ownsFocus = useRef(false);
    useEffect(() => {
        const onDown = (event: Event) => {
            if (!footerRef.current?.contains(event.target as Node)) ownsFocus.current = false;
        };
        document.addEventListener('pointerdown', onDown, true);
        document.addEventListener('focusin', onDown, true);
        return () => {
            document.removeEventListener('pointerdown', onDown, true);
            document.removeEventListener('focusin', onDown, true);
        };
    }, []);

    // A turn that ends with focus nowhere (■ Stop or ▶ went with it) gives it back to the box (audit H8).
    const wasWriting = useRef(writing);
    useEffect(() => {
        const ended = wasWriting.current && !writing;
        wasWriting.current = writing;
        if (!ended || !ownsFocus.current) return;
        const active = document.activeElement;
        if (!active || active === document.body) box.current?.focus({ preventScroll: true });
    }, [writing, box]);

    // The recording bar going (Done, Cancel) hands focus back to 🎤 (audit H9), not the box, which would raise a phone's keyboard.
    const wasRecording = useRef(dictation.recording);
    useEffect(() => {
        const ended = wasRecording.current && !dictation.recording;
        wasRecording.current = dictation.recording;
        if (!ended) return;
        requestAnimationFrame(() => {
            const active = document.activeElement;
            if (!active || active === document.body) micRef.current?.focus({ preventScroll: true });
        });
    }, [dictation.recording]);

    // The panel holds one thing at a time: dictation's line, then Write for me's, then the tray, then ⚡'s cards.
    const panel = hasDictationStatus(dictation) ? 'dictation' : writer.status !== 'idle' ? 'writer' : tray.open ? 'tray' : 'suggestions';
    const panelStatus =
        panel === 'dictation'
            ? dictationNote(dictation)
            : panel === 'writer'
              ? writer.status === 'writing'
                  ? 'Writing for you…'
                  : null
              : panel === 'suggestions' && suggestions.shown.status === 'loading'
                ? 'Thinking up replies…'
                : null;
    const panelAlert =
        panel === 'dictation' && dictation.phase.kind === 'failed' ? (
            <p role="alert" className="turn-error">
                {dictation.phase.message}{' '}
                <button type="button" className="button button-quiet" onClick={dictation.retry}>
                    Retry
                </button>{' '}
                <button type="button" className="button button-quiet" onClick={dictation.discard}>
                    Discard
                </button>
            </p>
        ) : panel === 'writer' && writer.status === 'failed' ? (
            <p role="alert" className="turn-error">
                Couldn&apos;t write it, try again
            </p>
        ) : panel === 'suggestions' && suggestions.shown.status === 'failed' ? (
            <p role="alert" className="turn-error">
                Couldn&apos;t suggest replies, try again
            </p>
        ) : null;

    return (
        <footer
            ref={footerRef}
            className={`shrink-0 border-t border-line bg-bg pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] ${COLUMN}`}
            onFocus={(event) => {
                ownsFocus.current = footerRef.current?.contains(event.target as Node) ?? false;
            }}
        >
            <Status>{rollback && <p className="notice border-rollback-line bg-rollback-surface">{rollback}</p>}</Status>
            <Notices chat={chat} failedSnapshots={failedSnapshots} onRetryBackground={onRetryBackground} retrying={busy} />
            {error && (
                <p role="alert" className="turn-error">
                    {error}
                </p>
            )}
            <Status>
                {chat.awaitingReply && !writing && (
                    <p className="notice">
                        The last turn failed. Your message is kept.{' '}
                        <button type="button" className="button button-quiet" disabled={blocked} onClick={onRetry}>
                            Retry
                        </button>
                    </p>
                )}
            </Status>
            {snapshotError && (
                <p role="alert" className="turn-error">
                    {snapshotError}
                </p>
            )}
            {/* Integration, "The composer, top to bottom": panel · Character row · tool row · box row. */}
            <form className="flex flex-col gap-1" onSubmit={send} aria-label="Composer">
                {/* Band 1, the panel: one thing at a time. Its status line is a region of its own, there throughout. */}
                <Status>{panelStatus && <p className={PANEL_NOTE}>{panelStatus}</p>}</Status>
                {panelAlert}
                {panel === 'tray' && (
                    <SavedRepliesTray
                        storyId={chat.storyId}
                        lines={tray.lines}
                        draft={draft}
                        locked={writing || blocked || writingForMe || dictating}
                        onPick={pickSavedReply}
                        onSaved={tray.saved}
                    />
                )}
                {panel === 'suggestions' && <SuggestionCards suggestions={suggestions.shown} onPick={onDraft} />}
                {/* Band 2: the Nudge Portraits plug in here; it takes no height while empty. */}
                <div className="empty:hidden" data-band="characters">
                    {characterRow?.(writingForMe || dictating)}
                </div>
                {/* Band 3: round tools, 44px and 8px apart (audit H28), and at the right end who the box writes as (L14). */}
                <div className="flex min-w-0 items-center gap-2" role="toolbar" aria-label="Composer tools">
                    {/* Spec: "Suggested replies". Asks only when tapped, so they never spend credit unasked. */}
                    <button
                        type="button"
                        className={ICON_BUTTON}
                        aria-label="Suggest replies"
                        title="Suggest replies"
                        aria-pressed={suggestions.shown.status !== 'closed'}
                        aria-busy={suggestions.shown.status === 'loading'}
                        disabled={writing || busy || blocked || writingForMe || dictating}
                        onClick={() => {
                            writer.dismiss();
                            tray.setOpen(false);
                            void suggestions.toggle();
                        }}
                    >
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
                            <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
                        </svg>
                    </button>
                    {/* .scratch/write-for-me/spec.md: the draft, Thai or notes or nothing, becomes the worn identity's next Message. A second tap cancels. */}
                    <button
                        type="button"
                        className={ICON_BUTTON}
                        aria-label="Write for me"
                        title="Write for me"
                        aria-pressed={writingForMe}
                        aria-busy={writingForMe}
                        disabled={writing || busy || blocked || dictating}
                        onClick={() => {
                            suggestions.close();
                            void writer.toggle();
                        }}
                    >
                        <PencilIcon size={20} />
                    </button>
                    {/* .scratch/saved-replies-and-replace-rules/spec.md: lines kept for this Story or all; opening it closes ⚡'s cards. */}
                    <button
                        type="button"
                        className={ICON_BUTTON}
                        aria-label="Saved replies"
                        title="Saved replies"
                        aria-pressed={tray.open}
                        disabled={dictation.recording}
                        // Keep the box's caret, where a Saved reply goes in.
                        onPointerDown={keepFocus}
                        onClick={() => {
                            writer.dismiss();
                            suggestions.close();
                            tray.setOpen(!tray.open);
                        }}
                    >
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
                            <path d="M6 3.5h12a1 1 0 0 1 1 1V21l-7-4.5L5 21V4.5a1 1 0 0 1 1-1z" />
                        </svg>
                    </button>
                    {/* Wraps the selection in *…* (an action, shown in italics), or opens an empty pair at the caret. */}
                    <button
                        type="button"
                        className={ICON_BUTTON}
                        aria-label="Write an action"
                        title="Action: *like this*"
                        disabled={writing || blocked || writingForMe || dictating}
                        // Keep the box's focus and selection: a tap on a button would otherwise take them.
                        onPointerDown={keepFocus}
                        onClick={() => {
                            const el = box.current;
                            if (!el) return;
                            const { next, caret } = wrapAction(draft, el.selectionStart, el.selectionEnd);
                            onDraft(next);
                            requestAnimationFrame(() => {
                                el.focus();
                                el.setSelectionRange(caret, caret);
                            });
                        }}
                    >
                        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                            <path d="M12 4v16M5.1 8l13.8 8M5.1 16l13.8-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                    </button>
                    <span className="ml-auto flex min-w-0 items-center gap-2" data-slot="tools-end">
                        {/* Only while the box holds exactly what ✍️ wrote; puts the draft back, empty included. */}
                        {writer.offered && (
                            <button
                                type="button"
                                className="bare-button inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-2.5 text-md text-muted press focus-ring"
                                onClick={writer.restore}
                            >
                                <UndoIcon size={16} />
                                Undo
                            </button>
                        )}
                        {!dictation.recording && (
                            <label htmlFor={boxId} className="truncate text-xs text-muted">
                                Write as {chat.identityName}
                            </label>
                        )}
                    </span>
                </div>
                {/* Band 4: the box, 🎤 and the send slot; while recording, the recording bar. */}
                {dictation.recording ? (
                    <RecordingBar dictation={dictation} />
                ) : (
                    <div className="flex items-end gap-2">
                        <textarea
                            ref={box}
                            id={boxId}
                            className={BOX}
                            aria-label={`Write as ${chat.identityName}`}
                            placeholder={`Write as ${chat.identityName}…`}
                            value={draft}
                            rows={1}
                            disabled={blocked}
                            readOnly={writingForMe || dictating}
                            onChange={(event) => onDraft(event.target.value)}
                            onFocus={() => {
                                boxFocused.current = true;
                            }}
                            onKeyDown={(event) => {
                                if (event.key !== 'Enter' || event.shiftKey || !enterSends()) return;
                                // An Enter that confirms an input method's word (Thai, say) only confirms it; Safari reports it as 229.
                                if (event.nativeEvent.isComposing || event.keyCode === 229) return;
                                event.preventDefault();
                                event.currentTarget.form?.requestSubmit();
                            }}
                        />
                        {/* .scratch/dictation/spec.md: only where the browser can record. */}
                        {dictation.supported && <DictateButton ref={micRef} dictation={dictation} disabledReason={micDisabledReason} />}
                        {writing ? (
                            // Spec: streaming replies. Ends the reply; the API keeps nothing of it.
                            <button
                                type="button"
                                className={STOP_BUTTON}
                                aria-label="Stop"
                                title="Stop the reply"
                                onPointerDown={keepFocus}
                                onClick={onStop}
                            >
                                <StopIcon size={18} />
                            </button>
                        ) : empty ? (
                            // Spec: "Continue". Refused while a User Message awaits its reply: Retry is the way on.
                            <button
                                type="button"
                                className={SEND_BUTTON}
                                aria-label="Continue"
                                title="Let the story go on"
                                disabled={writing || busy || blocked || chat.awaitingReply || writingForMe || dictating}
                                onPointerDown={keepFocus}
                                onClick={() => {
                                    suggestions.close();
                                    onContinue();
                                }}
                            >
                                <PlayIcon size={20} />
                            </button>
                        ) : (
                            <button type="submit" className={SEND_BUTTON} aria-label="Send" disabled={cantSend} onPointerDown={keepFocus}>
                                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
                                    <path d="M3.4 20.4l17.4-7.5c.8-.4.8-1.5 0-1.8L3.4 3.6c-.7-.3-1.4.3-1.3 1l1.5 6.1c.1.4.5.7.9.8L12 12l-7.5.5c-.4 0-.8.4-.9.8l-1.5 6.1c-.1.7.6 1.3 1.3 1z" />
                                </svg>
                            </button>
                        )}
                    </div>
                )}
            </form>
        </footer>
    );
}

'use client';

import Link from 'next/link';
import { FormEvent, ReactNode, RefObject, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

import { COLUMN, ICON_BUTTON, LABEL_CAPS, PANEL_NOTE, SEND_BUTTON, TOOL_CHIP } from '@/components/chat/chat-classes';
import { useConnection } from '@/components/connection';
import type { Expression, FaceEmotion } from '@/lib/expressions';
import { FacePicker } from '@/components/chat/face-picker';
import { CloseIcon, DiceIcon, PencilIcon, PlayIcon, StopIcon, UndoIcon, ChevronDownIcon } from '@/components/icons';
import { ApiUnreachableError } from '@/lib/api';
import { backgroundNotice, Chat, chatApi, SuggestedReply, RollStat, signedStat } from '@/lib/chat';
import { insertSavedReply, SavedReply, TraySavedReply } from '@/lib/saved-replies';
import { SCROLL_FADES, useScrollFade } from '@/lib/scroll-fade';
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
                        Text credit is used up. <Link href="/usage">See usage</Link>
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

/**
 * Sets the box's height to its text's, which the CSS max-height caps. The box scrolls only once
 * the text is taller than that: left to scroll whenever it could, a phone whose pixels don't
 * divide evenly rounded the fitted height a hair short and drew a scrollbar down the side of an
 * empty box (seen on a 360px phone, 2026-11-15).
 */
function fitToText(box: HTMLTextAreaElement) {
    box.style.height = 'auto';
    const borders = box.offsetHeight - box.clientHeight;
    box.style.height = `${box.scrollHeight + borders}px`;
    box.style.overflowY = box.scrollHeight > box.clientHeight + 1 ? 'auto' : 'hidden';
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
/**
 * The longest name the box's placeholder says ("Write as Petch…"): a longer one was cut off with no
 * "…" on a phone (docs/ui-audit-2026-11-16.md L5), so the placeholder is just "Write…" then. The top
 * bar says who the user plays, and the box's name for a screen reader keeps the whole of it.
 */
const PLACEHOLDER_NAME_MAX = 12;
const BOX = [
    'min-w-0 flex-1 resize-none overflow-y-auto',
    // One line is 44px tall, a phone's smallest comfortable field; five lines at most.
    'max-h-[calc(5*1.4em_+_1.25rem_+_2px)]',
    'order-first basis-full rounded-xl border border-transparent bg-transparent px-2.5 py-2',
    'font-[inherit] text-base leading-[1.4] text-text',
    // The placeholder stays on its one line: the box is sized by its text, so a wrapped placeholder was cut in half.
    'placeholder:overflow-hidden placeholder:text-ellipsis placeholder:whitespace-nowrap',
    // The card shows where the focus is (below): a ring round the box alone ran into the card's edge.
    'outline-none',
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
    /**
     * Reading in the Visual novel view (.scratch/novel-reading/spec.md): the composer has ⌄ to put it
     * away (with `onTuck`).
     */
    compact?: boolean;
    /**
     * Put away while reading: the whole composer is out of sight until the user asks for it (the
     * stage's ✎), unless something is under way in it (a draft, a panel, a Cue or Roll, Write for me,
     * Dictation). `onTuck` puts it away again.
     */
    tucked?: boolean;
    onTuck?(): void;
    /** The Cue set for the next reply (CONTEXT.md, "Cue"), or null. */
    cue: string | null;
    /** Opens the Cue sheet. */
    onCue(): void;
    onClearCue(): void;
    /** The face picked for the next Message (.scratch/your-faces/spec.md), or null. */
    face?: FaceEmotion | null;
    onFace?(next: FaceEmotion | null): void;
    /** The worn Role's or Persona's Expressions, for the face picker's pictures. */
    faces?: Expression[];
    /** Whether the next Message is sent with a Roll (CONTEXT.md, "Roll"). */
    roll: boolean;
    onRoll(next: boolean): void;
    /** The Stat the armed Roll adds, from a Roll offer taken (.scratch/judge-rolls/spec.md); null or left out for none. */
    rollStat?: RollStat | null;
    /** The Roll offer band (.scratch/judge-rolls/spec.md), above what is set for the next turn; nothing while none is pending. */
    rollOfferBand?: ReactNode;
    /**
     * Watch runs (.scratch/watch-mode/spec.md): the box and Send stay free, since a send stops Watch;
     * ▶, Suggest, Write, the Cue and the Roll wait.
     */
    watching?: boolean;
    /** Watch's band: how far it has got and Stop, or how it ended; nothing without one. */
    watchBand?: ReactNode;
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
    compact = false,
    tucked = false,
    onTuck,
    cue,
    onCue,
    onClearCue,
    roll,
    onRoll,
    face = null,
    onFace,
    faces = [],
    rollStat = null,
    rollOfferBand,
    watching = false,
    watchBand,
}: ChatComposerProps) {
    const box = useAutoGrow(draft);
    /** Focus is in the composer (the box or one of its tools): the user is writing. */
    const [focusWithin, setFocusWithin] = useState(false);
    // Asked for from the novel view: the box takes the focus, ready to write.
    const wasTucked = useRef(tucked);
    useEffect(() => {
        if (wasTucked.current && !tucked) box.current?.focus();
        wasTucked.current = tucked;
    }, [tucked, box]);
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
    // The tool row scrolls sideways where a phone is too narrow for all five tools; it fades at an end that hides more.
    const toolRow = useRef<HTMLDivElement>(null);
    const toolFade = useScrollFade(toolRow);
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

    // Put away while reading in the novel view, unless something is under way in it.
    const underWay = draft.trim() !== '' || panel !== 'suggestions' || suggestions.shown.status !== 'closed' || cue !== null || roll || writingForMe || dictating;
    const away = tucked && !underWay;
    return (
        <footer
            ref={footerRef}
            // Edge to edge on a phone (the user, 2026-11-20): inside the page's 16px sides, the Backdrop showed beside it.
            className={`shrink-0 max-lg:-mx-4 max-lg:px-4 ${away ? 'pb-[env(safe-area-inset-bottom)]' : 'border-t border-line pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]'} bg-bg ${COLUMN}`}
            data-tucked={away ? '' : undefined}
            onFocus={(event) => {
                ownsFocus.current = footerRef.current?.contains(event.target as Node) ?? false;
                setFocusWithin(true);
            }}
            onBlur={(event) => {
                // Still writing while focus moves to another of its own controls.
                if (!footerRef.current?.contains(event.relatedTarget as Node | null)) setFocusWithin(false);
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
            <form className="composer-icons flex flex-col gap-1" onSubmit={send} aria-label="Composer" hidden={away}>
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
                {rollOfferBand}
                {watchBand}
                {/*
                 * What is set for the next turn, on one row (docs/ui-audit-2026-11-16.md M2): the Cue and the Roll each
                 * had a band, 104px between them on a 360px phone. The Cue gives way and the Roll keeps its few words.
                 */}
                {(cue !== null || roll) && (
                    <div className="flex min-w-0 items-stretch gap-1" data-band="next">
                        {/* The Cue set for the next reply (CONTEXT.md, "Cue"), in sight until it is used or cleared. */}
                        {cue !== null && (
                            <div
                                className="flex min-w-0 flex-1 items-center gap-1 rounded-md bg-accent-soft pl-3 text-sm"
                                role="group"
                                aria-label="Cue for the next reply"
                                data-band="cue"
                            >
                                <span className="min-w-0 flex-1 truncate" title={cue}>
                                    <span className="font-semibold text-rewrite-text">Cue</span> {cue}
                                </span>
                                <button type="button" className={ICON_BUTTON} aria-label="Clear the Cue" disabled={writing} onClick={onClearCue}>
                                    <CloseIcon size={18} />
                                </button>
                            </div>
                        )}
                        {/* The Roll armed for the next Message (CONTEXT.md, "Roll"): what it will need, in sight until it is sent or turned off. */}
                        {roll && (
                            <p
                                className={`m-0 flex min-h-11 items-center gap-1.5 rounded-md bg-accent-soft px-3 text-sm ${cue !== null ? 'shrink-0' : 'min-w-0 flex-1'}`}
                                data-band="roll"
                            >
                                <DiceIcon size={16} className="shrink-0 text-rewrite-text" />
                                <span className="min-w-0 truncate">
                                    <span className="font-semibold text-rewrite-text">Roll</span> {chat.rollTarget}
                                    {rollStat ? (
                                        // From a Roll offer taken (.scratch/judge-rolls/spec.md): what its Stat adds, in place of the words.
                                        <>
                                            <span className="sr-only"> or more succeeds,</span> · {signedStat(rollStat.bonus)} {rollStat.name}
                                        </>
                                    ) : cue !== null ? (
                                        <>
                                            <span aria-hidden="true">+</span>
                                            <span className="sr-only"> or more succeeds</span>
                                        </>
                                    ) : (
                                        ' or more succeeds'
                                    )}
                                </span>
                            </p>
                        )}
                    </div>
                )}
                {/* Write for me's way back, only while the box holds exactly what it wrote; puts the draft back, empty included. */}
                {writer.offered && (
                    <div className="flex min-w-0 items-center justify-between gap-2 rounded-md bg-accent-soft pl-3 text-sm" data-band="undo">
                        <span className="min-w-0 truncate font-semibold text-rewrite-text">Written for you</span>
                        <button
                            type="button"
                            className="bare-button inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3 text-md text-text press focus-ring"
                            onClick={writer.restore}
                        >
                            <UndoIcon size={16} />
                            Undo
                        </button>
                    </div>
                )}
                {!dictation.recording && (
                    <label htmlFor={boxId} className="sr-only">
                        Write as {chat.identityName}
                    </label>
                )}
                {/*
                 * Band 3: the tools, icons in 36px rings with 44px to tap (audit H28; docs/ui-audit-2026-11-13.md M3).
                 * Always one row, from the left with 8px between, like the Character row above, so the two
                 * rows' rings stand in the same columns (the user, 2026-11-19: spread across, they stood
                 * crooked under the portraits). It never wraps: a second row took 48px from the Chat on a 360px
                 * phone; on a phone too narrow for it the row scrolls sideways and fades at the end that hides more. Who the box writes as is its placeholder and name (L14); the label stays for screen readers.
                 */}
                <div
                    ref={toolRow}
                    className={`flex min-w-0 flex-nowrap items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${SCROLL_FADES[toolFade]}`}
                    role="toolbar"
                    aria-label="Composer tools"
                    data-fade={toolFade}
                >
                    {/* Spec: "Suggested replies". Asks only when tapped, so they never spend credit unasked. */}
                    <button
                        type="button"
                        className={TOOL_CHIP}
                        aria-label="Suggest replies"
                        title="Suggest replies"
                        aria-pressed={suggestions.shown.status !== 'closed'}
                        aria-busy={suggestions.shown.status === 'loading'}
                        disabled={writing || busy || blocked || writingForMe || dictating || watching}
                        onClick={() => {
                            writer.dismiss();
                            tray.setOpen(false);
                            void suggestions.toggle();
                        }}
                    >
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                            <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
                        </svg>
                        <span>Suggest</span>
                    </button>
                    {/* .scratch/write-for-me/spec.md: the draft, Thai or notes or nothing, becomes the worn identity's next Message. A second tap cancels. */}
                    <button
                        type="button"
                        className={TOOL_CHIP}
                        aria-label="Write for me"
                        title="Write for me"
                        aria-pressed={writingForMe}
                        aria-busy={writingForMe}
                        disabled={writing || busy || blocked || dictating || watching}
                        onClick={() => {
                            suggestions.close();
                            void writer.toggle();
                        }}
                    >
                        <PencilIcon size={18} />
                        <span>Write</span>
                    </button>
                    {/* .scratch/saved-replies-and-replace-rules/spec.md: lines kept for this Story or all; opening it closes ⚡'s cards. */}
                    <button
                        type="button"
                        className={TOOL_CHIP}
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
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
                            <path d="M6 3.5h12a1 1 0 0 1 1 1V21l-7-4.5L5 21V4.5a1 1 0 0 1 1-1z" />
                        </svg>
                        <span>Saved</span>
                    </button>
                    {/* Wraps the selection in *…* (an action, shown in italics), or opens an empty pair at the caret. */}
                    <button
                        type="button"
                        className={TOOL_CHIP}
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
                        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                            <path d="M12 4v16M5.1 8l13.8 8M5.1 16l13.8-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                        <span>Action</span>
                    </button>
                    {/* CONTEXT.md, "Cue": a few words to the Narrator for the next reply only; it rides on the next Send, Continue or Again. */}
                    <button
                        type="button"
                        className={TOOL_CHIP}
                        aria-label="Cue the Narrator"
                        title="Cue the Narrator for the next reply"
                        aria-pressed={cue !== null}
                        disabled={writing || busy || blocked || writingForMe || dictating || watching}
                        onClick={onCue}
                    >
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M4 10v4h3l6 4V6l-6 4H4z" />
                            <path d="M16.5 9.5a3.5 3.5 0 0 1 0 5" />
                        </svg>
                        <span>Cue</span>
                    </button>
                </div>
                {/* Band 4: the box, 🎤 and the send slot; while recording, the recording bar. */}
                {dictation.recording ? (
                    <RecordingBar dictation={dictation} />
                ) : (
                    // One card (the user, 2026-11-19, with a picture of another app's): the box across the top at the
                    // whole width, so a long draft doesn't wrap every few words, and under it ⌄, 🎲 and 🎤, Send at the end.
                    <div className="flex flex-wrap items-center gap-x-1 rounded-2xl border border-field-line bg-surface p-1 has-[textarea:focus-visible]:outline-2 has-[textarea:focus-visible]:outline-offset-2 has-[textarea:focus-visible]:outline-accent has-[textarea:focus-visible]:outline-solid" data-band="box">
                        {compact && onTuck && (
                            // Back to reading (.scratch/novel-reading/spec.md).
                            <button type="button" className={ICON_BUTTON} aria-label="Hide the composer" title="Hide the composer" onClick={onTuck}>
                                <ChevronDownIcon size={20} />
                            </button>
                        )}
                        <textarea
                            ref={box}
                            id={boxId}
                            // The card's top: the card draws the edge.
                            className={BOX}
                            aria-label={`Write as ${chat.identityName}`}
                            placeholder={chat.identityName.length > PLACEHOLDER_NAME_MAX ? 'Write…' : `Write as ${chat.identityName}…`}
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
                        {/* CONTEXT.md, "Roll": arms the dice for the Message about to be sent; the app throws them, never the browser. */}
                        <button
                            type="button"
                            className={ICON_BUTTON}
                            aria-label="Roll the dice for this message"
                            title={`Roll the dice for this message (${chat.rollTarget} or more succeeds)`}
                            aria-pressed={roll}
                            disabled={writing || busy || blocked || writingForMe || dictating || watching}
                            onPointerDown={keepFocus}
                            onClick={() => onRoll(!roll)}
                        >
                            <DiceIcon size={20} />
                        </button>
                        {/* .scratch/your-faces/spec.md: the face the user makes as they send; the Narrator is told it. */}
                        {onFace && (
                            <FacePicker
                                face={face}
                                onFace={onFace}
                                faces={faces}
                                name={chat.identityName}
                                disabled={writing || busy || blocked || writingForMe || dictating || watching}
                            />
                        )}
                        {/* .scratch/dictation/spec.md: only where the browser can record. */}
                        {dictation.supported && <DictateButton ref={micRef} dictation={dictation} disabledReason={micDisabledReason} />}
                        <span className="flex-1" aria-hidden="true" />
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
                                disabled={writing || busy || blocked || chat.awaitingReply || writingForMe || dictating || watching}
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

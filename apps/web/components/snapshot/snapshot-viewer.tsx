'use client';

import Link from 'next/link';
import { PointerEvent, useEffect, useId, useRef, useState } from 'react';

import { ArrowRightIcon, ChevronLeftIcon, ChevronRightIcon, CloseIcon } from '@/components/icons';
import { keepFocusIn } from '@/components/sheet/sheet';
import { ConfirmButton } from '@/components/story-editor/fields';
import { formatWhen, messageHref } from '@/lib/chat';
import { EARLIER_VERSION, Snapshot, snapshotDownloadUrl, snapshotImageUrl } from '@/lib/snapshot';

/** How far a finger must travel before a swipe counts, in CSS pixels. */
const SWIPE_STEP_PX = 50;
const SWIPE_CLOSE_PX = 80;
/** How far a drag past the first or the last Snapshot follows the finger. */
const EDGE_GIVE = 0.3;

interface SnapshotViewerProps<T extends Snapshot> {
    /** The list a swipe moves through: the Chat's Snapshots in thread order, or the Gallery's filter. */
    snapshots: T[];
    /** The Snapshot that was tapped. */
    openId: number;
    onClose(): void;
    /**
     * Deletes it. A promise that rejects keeps the viewer open with its message (audit L25); the
     * viewer closes itself once the Snapshot leaves `snapshots`.
     */
    onDelete(snapshot: T): void | Promise<unknown>;
    /** Shown in the Gallery: a jump to the Message, or the "earlier version" mark. */
    showLink?: boolean;
    /** In the Chat: a retake of the same moment, offered while its Message is still in the Chat. */
    onRetake?(snapshot: T): void;
}

type Drag = { pointerId: number; x: number; y: number; dx: number; dy: number };

/** The picture on screen: loading, shown, or failed with a way to try again (audit M41). */
type Load = { id: number; tries: number; state: 'loading' | 'shown' | 'failed' };

const VIEWER = [
    'fixed inset-0 z-dialog flex flex-col bg-viewer-stage text-viewer-text',
    // The viewer takes every gesture itself: no page scroll or pull-to-refresh behind it.
    'touch-none overscroll-contain select-none',
].join(' ');

/** A round button on the black stage: 44px, its press and focus a light wash. */
const ROUND = [
    'bare-button grid size-11 flex-none place-items-center rounded-full text-viewer-text',
    'active:bg-viewer-press focus-visible:bg-viewer-press',
    'aria-disabled:cursor-not-allowed aria-disabled:opacity-40',
].join(' ');

/** Prev and next, over the picture's sides: a dark disc so it reads on any picture. */
const STEP = `${ROUND} absolute top-1/2 z-raised -translate-y-1/2 border border-viewer-muted bg-viewer-stage/60`;

const IMAGE = 'absolute inset-0 block size-full object-contain [-webkit-user-drag:none] motion-safe:animate-fade-in';
/** Back into place after a drag; none while the finger holds it. */
const SETTLE = 'motion-safe:transition-transform motion-safe:duration-base motion-safe:ease-out';

/**
 * Snapshots full screen (spec: "Snapshot viewer", stories 13–16): each image whole on black.
 * The ‹ › buttons, a horizontal swipe or the arrow keys move through the list (audit H13); a
 * downward swipe, Escape or × close it. Below the image: when and who, the prompt on request,
 * download, delete after confirming, and, where offered, a retake.
 */
export function SnapshotViewer<T extends Snapshot>({ snapshots, openId, onClose, onDelete, showLink, onRetake }: SnapshotViewerProps<T>) {
    const [currentId, setCurrentId] = useState(openId);
    const [showPrompt, setShowPrompt] = useState(false);
    const [drag, setDrag] = useState<Drag | null>(null);
    const [load, setLoad] = useState<Load>({ id: openId, tries: 0, state: 'loading' });
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const closeRef = useRef<HTMLButtonElement>(null);
    const promptId = useId();

    const index = snapshots.findIndex((snapshot) => snapshot.id === currentId);
    const snapshot = index === -1 ? null : snapshots[index];
    const atFirst = index <= 0;
    const atLast = index === snapshots.length - 1;

    const step = (by: -1 | 1) => {
        const next = snapshots[index + by];
        if (!next) return;
        setCurrentId(next.id);
        setShowPrompt(false);
        setDeleteError(null);
        setLoad({ id: next.id, tries: 0, state: 'loading' });
    };

    // The keys act on the latest list and position.
    const keys = useRef({ step, onClose });
    useEffect(() => {
        keys.current = { step, onClose };
    });

    // Focus moves in on open, stays in while open, and goes back to the opener on close, if it is
    // still there: a deleted Snapshot's tile is not, and the page that deleted it places focus (M50).
    useEffect(() => {
        const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        closeRef.current?.focus();
        const onKey = (event: KeyboardEvent) => {
            const panel = panelRef.current;
            // Escape while the delete question is up leaves the viewer open.
            if (event.key === 'Escape' && !panel?.querySelector('.confirm')) keys.current.onClose();
            else if (event.key === 'ArrowLeft') keys.current.step(-1);
            else if (event.key === 'ArrowRight') keys.current.step(1);
            else if (event.key === 'Tab' && panel) keepFocusIn(panel, event);
        };
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('keydown', onKey);
            if (opener?.isConnected) opener.focus({ preventScroll: true });
        };
    }, []);

    // "Loading" shows only for a picture that is slow to come, not a flash for one already kept.
    const [slow, setSlow] = useState(false);
    useEffect(() => {
        setSlow(false);
        const timer = setTimeout(() => setSlow(true), 300);
        return () => clearTimeout(timer);
    }, [currentId, load.tries]);

    // The Snapshot on screen left the list (deleted, or its Chat re-read without it).
    useEffect(() => {
        if (snapshot === null) onClose();
    }, [snapshot, onClose]);
    if (snapshot === null) return null;

    const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
        // One finger, or the main mouse button; not on the ‹ › buttons.
        if (!event.isPrimary || event.button !== 0 || drag || (event.target as HTMLElement).closest('button')) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        setDrag({ pointerId: event.pointerId, x: event.clientX, y: event.clientY, dx: 0, dy: 0 });
    };
    const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
        if (drag?.pointerId !== event.pointerId) return;
        setDrag({ ...drag, dx: event.clientX - drag.x, dy: event.clientY - drag.y });
    };
    const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
        if (drag?.pointerId !== event.pointerId) return;
        const dx = event.clientX - drag.x;
        const dy = event.clientY - drag.y;
        setDrag(null);
        if (dy > SWIPE_CLOSE_PX && Math.abs(dy) > Math.abs(dx)) onClose();
        else if (dx < -SWIPE_STEP_PX && Math.abs(dx) > Math.abs(dy)) step(1);
        else if (dx > SWIPE_STEP_PX && Math.abs(dx) > Math.abs(dy)) step(-1);
    };
    // The gesture ended some other way (cancelled, or capture lost): the image goes back.
    const dropDrag = () => setDrag(null);

    // The image follows the finger: sideways to move on (with less give past either end), down to close.
    let offsetX = 0;
    let offsetY = 0;
    if (drag) {
        if (Math.abs(drag.dx) >= Math.abs(drag.dy)) {
            const atEdge = (drag.dx > 0 && atFirst) || (drag.dx < 0 && atLast);
            offsetX = atEdge ? drag.dx * EDGE_GIVE : drag.dx;
        } else {
            offsetY = Math.max(0, drag.dy);
        }
    }
    // The stage fades as it is dragged down and away; at rest it is the stage colour itself.
    const fade = Math.max(0.35, 1 - offsetY / 400);
    const stageStyle = fade < 1 ? { backgroundColor: `color-mix(in srgb, var(--viewer-stage) ${Math.round(fade * 100)}%, transparent)` } : undefined;

    const loadState = load.id === snapshot.id ? load : { id: snapshot.id, tries: 0, state: 'loading' as const };
    const remove = async () => {
        setDeleteError(null);
        try {
            await onDelete(snapshot);
        } catch (failure) {
            setDeleteError(failure instanceof Error ? failure.message : 'The Snapshot could not be deleted.');
        }
    };

    return (
        <div ref={panelRef} className={VIEWER} role="dialog" aria-modal="true" aria-label="Snapshot" style={stageStyle}>
            <div className="flex flex-none items-center justify-between gap-2 pt-[max(0.5rem,env(safe-area-inset-top))] pr-2 pb-1 pl-4">
                {/* Read as "Snapshot 1 of 3"; shown as 1 / 3 (audit L11). */}
                <p className="m-0 text-sm text-viewer-muted tabular-nums">
                    <span aria-hidden="true">
                        {index + 1} / {snapshots.length}
                    </span>
                    <span className="sr-only">
                        Snapshot {index + 1} of {snapshots.length}
                    </span>
                </p>
                <button ref={closeRef} type="button" className={ROUND} aria-label="Close" onClick={onClose}>
                    <CloseIcon size={24} strokeWidth={2} />
                </button>
            </div>
            <div
                className="relative grid min-h-0 flex-1 cursor-grab place-items-center overflow-hidden"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={dropDrag}
                onLostPointerCapture={dropDrag}
            >
                {/*
                 * Fills the stage, the picture inside it whole: pinned to the stage's box, because a
                 * percentage height can't resolve in the grid's auto row.
                 */}
                {/* eslint-disable-next-line @next/next/no-img-element -- served by the API from the image folder */}
                <img
                    key={`${snapshot.id}-${loadState.tries}`}
                    className={`${IMAGE} ${drag ? 'cursor-grabbing' : SETTLE}`}
                    src={snapshotImageUrl(snapshot)}
                    alt={snapshotAlt(snapshot)}
                    draggable={false}
                    hidden={loadState.state === 'failed'}
                    style={{ transform: `translate(${offsetX}px, ${offsetY}px)` }}
                    onLoad={() => setLoad({ ...loadState, state: 'shown' })}
                    onError={() => setLoad({ ...loadState, state: 'failed' })}
                />
                {loadState.state === 'loading' && slow && (
                    <p role="status" className="pointer-events-none m-0 rounded-sm bg-viewer-panel px-3 py-1.5 text-sm text-viewer-panel-text motion-safe:animate-pulse-soft">
                        Loading the picture…
                    </p>
                )}
                {loadState.state === 'failed' && (
                    <div role="alert" className="mx-4 grid justify-items-center gap-2 rounded-md bg-viewer-panel px-4 py-3 text-center text-viewer-panel-text">
                        <p className="m-0">Couldn&apos;t load this picture.</p>
                        <button
                            type="button"
                            className="button button-quiet"
                            onClick={() => setLoad({ id: snapshot.id, tries: loadState.tries + 1, state: 'loading' })}
                        >
                            Try again
                        </button>
                    </div>
                )}
                {snapshots.length > 1 && (
                    <>
                        <button
                            type="button"
                            className={`${STEP} left-2`}
                            aria-label="Previous Snapshot"
                            aria-disabled={atFirst || undefined}
                            onClick={() => step(-1)}
                        >
                            <ChevronLeftIcon size={24} strokeWidth={2.2} />
                        </button>
                        <button
                            type="button"
                            className={`${STEP} right-2`}
                            aria-label="Next Snapshot"
                            aria-disabled={atLast || undefined}
                            onClick={() => step(1)}
                        >
                            <ChevronRightIcon size={24} strokeWidth={2.2} />
                        </button>
                    </>
                )}
            </div>
            <div className="grid max-h-[45dvh] flex-none touch-pan-y gap-2 overflow-y-auto overscroll-contain px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
                <p className="m-0 text-sm text-viewer-muted">
                    {formatWhen(snapshot.createdAt)}
                    {snapshot.characters.length > 0 && ` · ${snapshot.characters.map((character) => character.name).join(', ')}`}
                    {snapshot.hint && ` · Hint: ${snapshot.hint}`}
                </p>
                {showLink &&
                    (snapshot.messageId !== null && snapshot.chatId !== null ? (
                        <Link
                            className="inline-flex min-h-11 items-center gap-1 self-start text-md text-viewer-link"
                            href={messageHref(snapshot.storyId, snapshot.chatId, snapshot.messageId)}
                        >
                            Go to its Message <ArrowRightIcon size={16} />
                        </Link>
                    ) : (
                        <p className="m-0 text-sm text-viewer-muted">{EARLIER_VERSION}.</p>
                    ))}
                {/* 44px buttons 8px apart, Delete kept apart at the end (audit H24). */}
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        className="button button-quiet"
                        aria-expanded={showPrompt}
                        aria-controls={promptId}
                        onClick={() => setShowPrompt((shown) => !shown)}
                    >
                        {showPrompt ? 'Hide prompt' : 'Show prompt'}
                    </button>
                    <a className="button button-quiet" href={snapshotDownloadUrl(snapshot)} download>
                        Download
                    </a>
                    {onRetake && snapshot.messageId !== null && (
                        <button type="button" className="button button-quiet" onClick={() => onRetake(snapshot)}>
                            Retake
                        </button>
                    )}
                    <span className="ml-auto pl-4">
                        <ConfirmButton
                            key={snapshot.id}
                            label="Delete"
                            danger
                            ariaLabel="Delete this Snapshot"
                            question="Delete this Snapshot and its image?"
                            confirmLabel="Delete"
                            onConfirm={remove}
                        />
                    </span>
                </div>
                {deleteError && (
                    <p role="alert" className="m-0 rounded-sm bg-viewer-panel px-3 py-2 text-md text-viewer-panel-text">
                        Couldn&apos;t delete it: {deleteError}
                    </p>
                )}
                <div id={promptId} hidden={!showPrompt}>
                    {showPrompt && (
                        <pre
                            role="region"
                            aria-label="Prompt used"
                            className="m-0 rounded-sm bg-viewer-panel p-3 font-[family-name:inherit] text-md whitespace-pre-wrap text-viewer-panel-text select-text"
                        >
                            {snapshot.prompt}
                        </pre>
                    )}
                </div>
            </div>
        </div>
    );
}

/**
 * A Snapshot's alt text: who is in it and when it was taken, so the pictures of one Chat are
 * told apart (audit L26).
 */
export function snapshotAlt(snapshot: Snapshot): string {
    const who = snapshot.characters.map((character) => character.name).join(', ');
    const when = formatWhen(snapshot.createdAt);
    return who ? `Snapshot with ${who}, ${when}` : `Snapshot, ${when}`;
}

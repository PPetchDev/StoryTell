'use client';

import Link from 'next/link';
import { PointerEvent, useEffect, useRef, useState } from 'react';

import { keepFocusIn } from '@/components/sheet/sheet';
import { ConfirmButton } from '@/components/story-editor/fields';
import { formatWhen, messageHref } from '@/lib/chat';
import { EARLIER_VERSION, Snapshot, snapshotDownloadUrl, snapshotImageUrl } from '@/lib/snapshot';

import styles from './snapshot-viewer.module.css';

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
    onDelete(snapshot: T): void;
    /** Shown in the Gallery: a jump to the Message, or the "earlier version" mark. */
    showLink?: boolean;
    /** In the Chat: a retake of the same moment, offered while its Message is still in the Chat. */
    onRetake?(snapshot: T): void;
}

type Drag = { pointerId: number; x: number; y: number; dx: number; dy: number };

/**
 * Snapshots full screen (spec: "Snapshot viewer", stories 13–16): each image whole on black.
 * A horizontal swipe or the arrow keys move through the list; a downward swipe, Escape or ×
 * close it. Below the image: when and who, the prompt on request, download, delete after
 * confirming, and, where offered, a retake.
 */
export function SnapshotViewer<T extends Snapshot>({ snapshots, openId, onClose, onDelete, showLink, onRetake }: SnapshotViewerProps<T>) {
    const [currentId, setCurrentId] = useState(openId);
    const [showPrompt, setShowPrompt] = useState(false);
    const [drag, setDrag] = useState<Drag | null>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const closeRef = useRef<HTMLButtonElement>(null);

    const index = snapshots.findIndex((snapshot) => snapshot.id === currentId);
    const snapshot = index === -1 ? null : snapshots[index];

    const step = (by: -1 | 1) => {
        const next = snapshots[index + by];
        if (!next) return;
        setCurrentId(next.id);
        setShowPrompt(false);
    };

    // The keys act on the latest list and position.
    const keys = useRef({ step, onClose });
    useEffect(() => {
        keys.current = { step, onClose };
    });

    // Focus moves in on open, stays in while open, and goes back to the opener on close.
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
            opener?.focus({ preventScroll: true });
        };
    }, []);

    // The Snapshot on screen left the list (deleted, or its Chat re-read without it).
    useEffect(() => {
        if (snapshot === null) onClose();
    }, [snapshot, onClose]);
    if (snapshot === null) return null;

    const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
        // One finger, or the main mouse button.
        if (!event.isPrimary || event.button !== 0 || drag) return;
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
            const atEdge = (drag.dx > 0 && index === 0) || (drag.dx < 0 && index === snapshots.length - 1);
            offsetX = atEdge ? drag.dx * EDGE_GIVE : drag.dx;
        } else {
            offsetY = Math.max(0, drag.dy);
        }
    }
    const fade = Math.max(0.35, 1 - offsetY / 400);

    return (
        <div
            ref={panelRef}
            className={styles.viewer}
            role="dialog"
            aria-modal="true"
            aria-label="Snapshot"
            style={{ backgroundColor: `rgba(0, 0, 0, ${fade})` }}
        >
            <div className={styles.top}>
                <span className={styles.count} aria-label={`Snapshot ${index + 1} of ${snapshots.length}`}>
                    {index + 1} / {snapshots.length}
                </span>
                <button ref={closeRef} type="button" className={styles.close} aria-label="Close" onClick={onClose}>
                    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
                        <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                </button>
            </div>
            <div
                className={styles.stage}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={dropDrag}
                onLostPointerCapture={dropDrag}
            >
                {/* eslint-disable-next-line @next/next/no-img-element -- served by the API from the image folder */}
                <img
                    key={snapshot.id}
                    className={drag ? styles.dragging : undefined}
                    src={snapshotImageUrl(snapshot)}
                    alt={snapshotAlt(snapshot)}
                    draggable={false}
                    style={{ transform: `translate(${offsetX}px, ${offsetY}px)` }}
                />
            </div>
            <div className={styles.details}>
                <p className={styles.meta}>
                    {formatWhen(snapshot.createdAt)}
                    {snapshot.characters.length > 0 && ` · ${snapshot.characters.map((character) => character.name).join(', ')}`}
                    {snapshot.hint && ` · Hint: ${snapshot.hint}`}
                </p>
                {showLink &&
                    (snapshot.messageId !== null && snapshot.chatId !== null ? (
                        <Link className={styles.link} href={messageHref(snapshot.storyId, snapshot.chatId, snapshot.messageId)}>
                            Go to its Message →
                        </Link>
                    ) : (
                        <p className={styles.meta}>{EARLIER_VERSION}.</p>
                    ))}
                <div className={styles.actions}>
                    <button type="button" className="button button-quiet button-small" onClick={() => setShowPrompt((shown) => !shown)}>
                        {showPrompt ? 'Hide prompt' : 'Show prompt'}
                    </button>
                    <a className="button button-quiet button-small" href={snapshotDownloadUrl(snapshot)} download>
                        Download
                    </a>
                    {onRetake && snapshot.messageId !== null && (
                        <button type="button" className="button button-quiet button-small" onClick={() => onRetake(snapshot)}>
                            Retake
                        </button>
                    )}
                    <ConfirmButton
                        key={snapshot.id}
                        label="Delete"
                        danger
                        question="Delete this Snapshot and its image?"
                        confirmLabel="Delete"
                        onConfirm={() => onDelete(snapshot)}
                    />
                </div>
                {showPrompt && (
                    <pre className={styles.prompt} aria-label="Prompt used">
                        {snapshot.prompt}
                    </pre>
                )}
            </div>
        </div>
    );
}

export function snapshotAlt(snapshot: Snapshot): string {
    const who = snapshot.characters.map((character) => character.name).join(', ');
    return who ? `Snapshot with ${who}` : 'Snapshot';
}

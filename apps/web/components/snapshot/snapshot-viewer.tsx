'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { ConfirmButton } from '@/components/story-editor/fields';
import { formatWhen, messageHref } from '@/lib/chat';
import { EARLIER_VERSION, Snapshot, snapshotDownloadUrl, snapshotImageUrl } from '@/lib/snapshot';

interface SnapshotViewerProps {
    snapshot: Snapshot;
    onClose(): void;
    onDelete(): void;
    /** Shown in the Gallery: a jump to the Message, or the "earlier version" mark. */
    showLink?: boolean;
    /** In the Chat: a retake of the same moment, while its Message still has the camera. */
    onRetake?(): void;
}

/**
 * A Snapshot full screen (spec: stories 115–116, 120): the image, the prompt it was drawn
 * from on request, download, delete after confirming, and, where offered, a retake.
 */
export function SnapshotViewer({ snapshot, onClose, onDelete, showLink, onRetake }: SnapshotViewerProps) {
    const [showPrompt, setShowPrompt] = useState(false);

    useEffect(() => {
        const close = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
        window.addEventListener('keydown', close);
        return () => window.removeEventListener('keydown', close);
    }, [onClose]);

    return (
        <div className="snapshot-viewer" role="dialog" aria-modal="true" aria-label="Snapshot">
            <div className="snapshot-viewer-head toolbar">
                <button type="button" className="button button-quiet button-small" onClick={onClose}>
                    Close
                </button>
                <button type="button" className="button button-quiet button-small" onClick={() => setShowPrompt((shown) => !shown)}>
                    {showPrompt ? 'Hide prompt' : 'Show prompt'}
                </button>
                <a className="button button-quiet button-small" href={snapshotDownloadUrl(snapshot)} download>
                    Download
                </a>
                {onRetake && (
                    <button type="button" className="button button-quiet button-small" onClick={onRetake}>
                        Retake
                    </button>
                )}
                <ConfirmButton label="Delete" question="Delete this Snapshot and its image?" confirmLabel="Delete" onConfirm={onDelete} />
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element -- served by the API from the image folder */}
            <img className="snapshot-full" src={snapshotImageUrl(snapshot)} alt={snapshotAlt(snapshot)} />
            <p className="muted small">
                {formatWhen(snapshot.createdAt)}
                {snapshot.characters.length > 0 && ` · ${snapshot.characters.map((character) => character.name).join(', ')}`}
                {snapshot.hint && ` · Hint: ${snapshot.hint}`}
            </p>
            {showLink &&
                (snapshot.messageId !== null && snapshot.chatId !== null ? (
                    <Link href={messageHref(snapshot.storyId, snapshot.chatId, snapshot.messageId)}>Go to its Message →</Link>
                ) : (
                    <p className="muted small">{EARLIER_VERSION}.</p>
                ))}
            {showPrompt && (
                <pre className="snapshot-prompt" aria-label="Prompt used">
                    {snapshot.prompt}
                </pre>
            )}
        </div>
    );
}

export function snapshotAlt(snapshot: Snapshot): string {
    const who = snapshot.characters.map((character) => character.name).join(', ');
    return who ? `Snapshot with ${who}` : 'Snapshot';
}

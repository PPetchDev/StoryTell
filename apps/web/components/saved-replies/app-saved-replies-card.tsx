'use client';

import { useApiQuery } from '@/components/connection';
import { ErrorState, Loading } from '@/components/query-state';
import type { Autosave } from '@/components/story-editor/autosave';
import { appSavedReplies, SavedReplyList as SavedReplyListAnswer } from '@/lib/saved-replies';
import { SavedReplyList } from './saved-reply-list';

/** Settings' "Saved replies" card: the lines for every Story (.scratch/saved-replies-and-replace-rules/spec.md). */
export function AppSavedRepliesCard({ autosave }: { autosave: Autosave }) {
    const lines = useApiQuery<SavedReplyListAnswer>('/saved-replies');
    return (
        <section className="card" aria-label="Saved replies">
            <h2>Saved replies</h2>
            <p className="muted">
                Lines you send often, for every Story. Tap one in the composer&apos;s Saved replies tray to put it in the box;{' '}
                <code>{'{user}'}</code> becomes the name you wear in that Chat.
            </p>
            {lines.status === 'loading' && <Loading label="Loading Saved replies…" lines={2} />}
            {lines.status === 'error' && <ErrorState title="Couldn't load the Saved replies." error={lines.error} onRetry={lines.retry} />}
            {lines.status === 'ready' && (
                <SavedReplyList initial={lines.data.savedReplies} store={appSavedReplies} autosave={autosave} saveKey="savedReplies.app" />
            )}
        </section>
    );
}

'use client';

import { useApiQuery } from '@/components/connection';
import { ErrorState, Loading } from '@/components/query-state';
import { Gallery } from '@/components/snapshot/gallery';
import { StorySummary } from '@/lib/story';

/** The main menu's Gallery: every Story's Snapshots, grouped by Story and then by Chat. */
export default function GalleryPage() {
    const stories = useApiQuery<{ stories: StorySummary[] }>('/stories');

    return (
        <main className="wide">
            <h1>Gallery</h1>
            {stories.status === 'loading' && <Loading label="Loading the Gallery…" />}
            {stories.status === 'error' && <ErrorState title="Couldn't load the Gallery." error={stories.error} onRetry={stories.retry} />}
            {stories.status === 'ready' &&
                (stories.data.stories.length === 0 ? (
                    <p className="muted">No Stories yet. Snapshots you take in a Chat show up here.</p>
                ) : (
                    <Gallery stories={stories.data.stories} byStory />
                ))}
        </main>
    );
}

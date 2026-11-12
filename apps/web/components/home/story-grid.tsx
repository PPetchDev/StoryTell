'use client';

import { useId, useState } from 'react';

import { CoverPicture } from '@/components/home/cover-picture';
import { playedAgo } from '@/lib/home';
import { StorySummary, storyTitle } from '@/lib/story';
import { useSettled } from '@/lib/use-settled';

/** From this many Stories, Home offers a search and the Draft / Playable filter (audit L17). */
export const FIND_FROM = 4;

type Show = 'all' | 'playable' | 'draft';

const SHOW: Array<{ value: Show; label: string }> = [
    { value: 'all', label: 'All' },
    { value: 'playable', label: 'Playable' },
    { value: 'draft', label: 'Drafts' },
];

const CARD = [
    'bare-button flex w-full flex-col gap-1 rounded-lg text-left',
    'focus-visible:outline-offset-4',
].join(' ');

const stories = (count: number) => `${count} ${count === 1 ? 'Story' : 'Stories'}`;

/**
 * Home's Stories as picture cards, two to a row on a phone (spec stories 47–51). With a handful
 * or more, a search by title and hook and a Draft / Playable filter sit above them (audit L17).
 */
export function StoryGrid({ stories: all, onOpen }: { stories: StorySummary[]; onOpen(story: StorySummary): void }) {
    const [query, setQuery] = useState('');
    const [show, setShow] = useState<Show>('all');
    const findable = all.length >= FIND_FROM;
    const words = query.trim().toLowerCase();
    const shown = !findable
        ? all
        : all.filter(
              (story) =>
                  (show === 'all' || (show === 'playable') === story.playable) &&
                  (words === '' || `${storyTitle(story)} ${story.hook}`.toLowerCase().includes(words)),
          );
    const filtered = shown.length !== all.length;
    const summary = useSettled(filtered ? `${stories(shown.length)} of ${all.length}` : '');
    const searchId = useId();

    return (
        <>
            {findable && (
                <div role="search" aria-label="Find a Story" className="mb-4 flex flex-wrap items-end gap-x-4 gap-y-2">
                    <div className="field my-0 min-w-0 flex-1 basis-56">
                        <label htmlFor={searchId}>Search Stories</label>
                        <input
                            id={searchId}
                            type="search"
                            enterKeyHint="search"
                            autoComplete="off"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                        />
                    </div>
                    <fieldset className="m-0 flex flex-wrap gap-2 border-0 p-0">
                        <legend className="sr-only">Show</legend>
                        {SHOW.map((option) => (
                            <label key={option.value} className="chip chip-pick">
                                <input
                                    type="radio"
                                    name={`${searchId}-show`}
                                    value={option.value}
                                    checked={show === option.value}
                                    onChange={() => setShow(option.value)}
                                />
                                {option.label}
                            </label>
                        ))}
                    </fieldset>
                </div>
            )}
            {/* Always there, so what it says is read when it changes. */}
            <p aria-live="polite" className={filtered ? 'mt-0 mb-3 text-sm text-muted' : 'sr-only'}>
                {summary}
            </p>
            {shown.length === 0 ? (
                <div className="notice flex flex-wrap items-center gap-3">
                    <p className="m-0 flex-1 basis-48">No Stories match. Try other words, or show them all.</p>
                    <button
                        type="button"
                        className="button button-quiet"
                        onClick={() => {
                            setQuery('');
                            setShow('all');
                        }}
                    >
                        Show all Stories
                    </button>
                </div>
            ) : (
                <ul className="m-0 grid list-none grid-cols-2 gap-x-3 gap-y-4 p-0 md:grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] md:gap-x-5 md:gap-y-7" aria-label="Stories">
                    {shown.map((story) => (
                        <li key={story.id}>
                            <StoryCard story={story} onOpen={onOpen} />
                        </li>
                    ))}
                </ul>
            )}
        </>
    );
}

function StoryCard({ story, onOpen }: { story: StorySummary; onOpen(story: StorySummary): void }) {
    const id = `story-card-${story.id}`;
    return (
        // Named by its title and badge; the hook and last played are its description.
        <button
            type="button"
            className={CARD}
            aria-labelledby={`${id}-title ${id}-badge`}
            aria-describedby={`${id}-hook ${id}-meta`}
            onClick={() => onOpen(story)}
        >
            <CoverPicture story={story} className="mb-1 aspect-[3/4] w-full rounded-lg">
                {!story.playable && (
                    <span
                        id={`${id}-badge`}
                        className="absolute top-2 left-2 rounded-full bg-picture-badge px-2 text-xs font-bold text-on-picture-warning"
                    >
                        Draft
                    </span>
                )}
            </CoverPicture>
            <strong id={`${id}-title`} className="text-note leading-snug [overflow-wrap:anywhere]">
                {storyTitle(story)}
            </strong>
            {story.hook && (
                <span id={`${id}-hook`} className="line-clamp-2 text-sm leading-snug text-muted">
                    {story.hook}
                </span>
            )}
            <span id={`${id}-meta`} className="text-xs text-muted">
                {story.lastPlayedAt ? `Played ${playedAgo(story.lastPlayedAt)}` : 'Not played yet'}
            </span>
        </button>
    );
}

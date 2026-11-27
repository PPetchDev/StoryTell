'use client';

import { ReactNode, useId, useState } from 'react';

import { ChevronDownIcon } from '@/components/icons';
import { MessageThought } from '@/lib/chat';

/**
 * What each Character thought just before this reply (.scratch/character-minds/spec.md), behind a
 * quiet "Thoughts" button, and what Characters away from the moment did after it
 * (.scratch/meanwhile/spec.md), behind a quiet "Meanwhile" button: never shown until asked for,
 * since either can give the story away. Nothing for a reply with neither. `after` sits in the same
 * row (the reply's cost, .scratch/cost-view/spec.md), so they take one line, not two.
 */
export function MessageThoughts({
    thoughts,
    meanwhile,
    after,
}: {
    thoughts: readonly MessageThought[] | undefined;
    meanwhile?: readonly MessageThought[] | undefined;
    after?: ReactNode;
}) {
    const [open, setOpen] = useState<'thoughts' | 'meanwhile' | null>(null);
    const listId = useId();
    const anyThoughts = thoughts !== undefined && thoughts.length > 0;
    const anyMeanwhile = meanwhile !== undefined && meanwhile.length > 0;
    if (!anyThoughts && !anyMeanwhile && !after) return null;
    const shown = open === 'thoughts' && anyThoughts ? thoughts : open === 'meanwhile' && anyMeanwhile ? meanwhile : null;
    const toggle = (which: 'thoughts' | 'meanwhile') => setOpen((was) => (was === which ? null : which));
    return (
        <div className="mt-1 flex flex-wrap items-center gap-x-1" data-thoughts>
            {anyThoughts && (
                <button
                    type="button"
                    className="bare-button inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-md px-1.5 text-sm text-muted press focus-ring"
                    aria-expanded={open === 'thoughts'}
                    aria-controls={open === 'thoughts' ? listId : undefined}
                    onClick={() => toggle('thoughts')}
                >
                    <ChevronDownIcon size={14} className={`shrink-0 ${open === 'thoughts' ? 'rotate-180' : ''}`} />
                    Thoughts
                </button>
            )}
            {anyMeanwhile && (
                <button
                    type="button"
                    className="bare-button inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-md px-1.5 text-sm text-muted press focus-ring"
                    aria-expanded={open === 'meanwhile'}
                    aria-controls={open === 'meanwhile' ? listId : undefined}
                    onClick={() => toggle('meanwhile')}
                    data-meanwhile
                >
                    <ChevronDownIcon size={14} className={`shrink-0 ${open === 'meanwhile' ? 'rotate-180' : ''}`} />
                    Meanwhile
                </button>
            )}
            {after}
            {shown && (
                <ul
                    id={listId}
                    className="m-0 mt-0.5 grid basis-full list-none gap-1.5 p-0 pl-1.5 text-sm leading-normal text-muted"
                    aria-label={open === 'meanwhile' ? 'What they did meanwhile' : 'What they thought'}
                >
                    {shown.map((entry) => (
                        <li key={entry.characterId} className="[overflow-wrap:anywhere]">
                            <span className="font-semibold text-text">{entry.characterName}</span>{' '}
                            <span className={open === 'meanwhile' ? undefined : 'italic'}>{entry.text}</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

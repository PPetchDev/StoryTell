'use client';

import { ReactNode, useId, useState } from 'react';

import { ChevronDownIcon } from '@/components/icons';
import { MessageThought } from '@/lib/chat';

/**
 * What each Character thought just before this reply (.scratch/character-minds/spec.md), behind a
 * quiet "Thoughts" button: never shown until asked for, since a thought can tell what a Character
 * means to do before they do it. Nothing for a reply written without any. `after` sits in the same
 * row (the reply's cost, .scratch/cost-view/spec.md), so the two take one line, not two.
 */
export function MessageThoughts({ thoughts, after }: { thoughts: readonly MessageThought[] | undefined; after?: ReactNode }) {
    const [open, setOpen] = useState(false);
    const listId = useId();
    const any = thoughts !== undefined && thoughts.length > 0;
    if (!any && !after) return null;
    return (
        <div className="mt-1 flex flex-wrap items-center gap-x-1" data-thoughts>
            {any && (
                <button
                    type="button"
                    className="bare-button inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-md px-1.5 text-sm text-muted press focus-ring"
                    aria-expanded={open}
                    aria-controls={open ? listId : undefined}
                    onClick={() => setOpen((was) => !was)}
                >
                    <ChevronDownIcon size={14} className={`shrink-0 ${open ? 'rotate-180' : ''}`} />
                    Thoughts
                </button>
            )}
            {after}
            {any && open && (
                <ul id={listId} className="m-0 mt-0.5 grid basis-full list-none gap-1.5 p-0 pl-1.5 text-sm leading-normal text-muted" aria-label="What they thought">
                    {thoughts.map((thought) => (
                        <li key={thought.characterId} className="[overflow-wrap:anywhere]">
                            <span className="font-semibold text-text">{thought.characterName}</span> <span className="italic">{thought.text}</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

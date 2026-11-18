'use client';

import { useId, useState } from 'react';

import { ChevronDownIcon } from '@/components/icons';
import { cachedPercent, ReplyCost, replyUsd } from '@/lib/reply-cost';
import { CALL_KIND_LABEL } from '@/lib/types';

/**
 * What a reply cost (.scratch/cost-view/spec.md), as a quiet "Cost $0.0123" beside Thoughts: a tap
 * shows each kind of call it caused, its amount, and how much of its prompt was read from cache.
 * Its button and its list are siblings in the row they sit in, so the list wraps under the buttons.
 */
export function ReplyCostLine({ cost }: { cost: ReplyCost | null }) {
    const [open, setOpen] = useState(false);
    const listId = useId();
    if (!cost || cost.calls === 0) return null;
    const amount = replyUsd(cost.costUsd);
    return (
        <>
            <button
                type="button"
                className="bare-button inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-md px-1.5 text-sm text-muted tabular-nums press focus-ring"
                aria-expanded={open}
                aria-controls={open ? listId : undefined}
                data-reply-cost
                onClick={() => setOpen((was) => !was)}
            >
                <ChevronDownIcon size={14} className={`shrink-0 ${open ? 'rotate-180' : ''}`} />
                Cost {amount}
            </button>
            {open && (
                <ul id={listId} className="m-0 mt-0.5 grid basis-full list-none gap-1 p-0 pl-1.5 text-sm leading-normal text-muted" aria-label="What this reply cost">
                    {cost.byKind.map((kind) => {
                        const cached = cachedPercent(kind.cache);
                        return (
                            <li key={kind.kind} className="flex items-baseline justify-between gap-3">
                                <span className="min-w-0 [overflow-wrap:anywhere]">
                                    <span className="text-text">{CALL_KIND_LABEL[kind.kind] ?? kind.kind}</span>
                                    {kind.calls > 1 && <> × {kind.calls}</>}
                                    {cached !== null && <> · {cached}% cached</>}
                                </span>
                                <span className="shrink-0 tabular-nums">{replyUsd(kind.costUsd)}</span>
                            </li>
                        );
                    })}
                </ul>
            )}
        </>
    );
}

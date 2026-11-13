import { ReactNode } from 'react';

import { ChevronDownIcon } from '@/components/icons';

interface SummaryProps {
    children: ReactNode;
    /** Text and chevron at the top, for a summary of several lines; one line is centred. */
    top?: boolean;
    /**
     * What says it opens, in place of the chevron: words such as "History ›" inside a fold that
     * already has a chevron of its own (docs/ui-audit-2026-11-13.md, M7).
     */
    cue?: ReactNode;
    className?: string;
}

/**
 * A <details> summary that shows it opens (audit H21, M56): 44px tall, with the chevron the
 * folding cards use, down while closed and up while open, or the `cue` given. Put `group` on the
 * <details>. The browser's own marker is hidden, so it never shows beside the chevron.
 */
export function Summary({ children, top = false, cue, className }: SummaryProps) {
    return (
        <summary
            className={[
                'flex min-h-11 cursor-pointer list-none gap-2 rounded-sm [&::-webkit-details-marker]:hidden',
                top ? 'items-start' : 'items-center',
                className,
            ]
                .filter(Boolean)
                .join(' ')}
        >
            <span className="min-w-0 flex-1">{children}</span>
            {cue ?? (
                <ChevronDownIcon
                    size={20}
                    strokeWidth={2.2}
                    className="mt-0.5 flex-none text-muted group-open:rotate-180 motion-safe:transition-transform motion-safe:duration-base"
                />
            )}
        </summary>
    );
}

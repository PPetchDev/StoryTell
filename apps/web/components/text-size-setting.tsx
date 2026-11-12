'use client';

import { CSSProperties, useId } from 'react';

import { setTextSize, STORY_TEXT_SIZE, TEXT_SIZES, useTextSize } from '@/lib/text-size';


/**
 * A row of tap-to-pick segments (radios), shared with the Theme setting: each 44px tall, the
 * picked one filled with the accent, a darker fill under the finger, the focus ring around the
 * segment whose radio has focus.
 */
export const SEGMENTS = 'inline-flex gap-1 rounded-full border border-line bg-bg p-1';
export const SEGMENT = [
    'relative grid min-h-11 min-w-12 cursor-pointer place-items-center rounded-full font-bold text-muted',
    'has-checked:bg-accent-fill has-checked:text-accent-text not-has-checked:active:bg-surface-raised',
    'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent',
].join(' ');
/** The radio itself: invisible over the whole segment, so the segment is what is tapped. */
export const SEGMENT_INPUT = 'absolute inset-0 m-0 cursor-pointer opacity-0';

/** Settings' text size choice (spec: stories 11–12). It applies at once and only on this device. */
export function TextSizeSetting() {
    const size = useTextSize();
    const headingId = useId();
    return (
        <section className="card">
            <h2 id={headingId}>Text size</h2>
            <p className="muted">The size of the story in a Chat. It is kept on this device only.</p>
            <div className={SEGMENTS} role="radiogroup" aria-labelledby={headingId}>
                {TEXT_SIZES.map((option) => (
                    <label key={option.value} className={SEGMENT}>
                        <input
                            className={SEGMENT_INPUT}
                            type="radio"
                            name="text-size"
                            value={option.value}
                            aria-label={option.label}
                            checked={size === option.value}
                            onChange={() => setTextSize(option.value)}
                        />
                        <span aria-hidden="true">{option.value}</span>
                    </label>
                ))}
            </div>
            <p className="mt-3 mb-0 text-(length:--story-size) leading-normal" style={{ '--story-size': STORY_TEXT_SIZE[size] } as CSSProperties}>
                The lamp went out an hour ago, and the sea kept talking.
            </p>
        </section>
    );
}

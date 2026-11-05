'use client';

import { CSSProperties, useId } from 'react';

import { setTextSize, STORY_TEXT_SIZE, TEXT_SIZES, useTextSize } from '@/lib/text-size';

import styles from './text-size-setting.module.css';

/** Settings' text size choice (spec: stories 11–12). It applies at once and only on this device. */
export function TextSizeSetting() {
    const size = useTextSize();
    const headingId = useId();
    return (
        <section className="card">
            <h2 id={headingId}>Text size</h2>
            <p className="muted">The size of the story in a Chat. It is kept on this device only.</p>
            <div className={styles.segments} role="radiogroup" aria-labelledby={headingId}>
                {TEXT_SIZES.map((option) => (
                    <label key={option.value} className={styles.segment}>
                        <input
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
            <p className={styles.sample} style={{ '--story-size': STORY_TEXT_SIZE[size] } as CSSProperties}>
                The lamp went out an hour ago, and the sea kept talking.
            </p>
        </section>
    );
}

'use client';

import { useId } from 'react';

import { setThemeChoice, THEME_CHOICES, useThemeChoice } from '@/lib/theme';

import { SEGMENT, SEGMENT_INPUT, SEGMENTS } from './text-size-setting';

/** Settings' Theme choice (spec: Chat looks, "Light theme"): it applies at once and only on this device. */
export function ThemeSetting() {
    const choice = useThemeChoice();
    const headingId = useId();
    return (
        <section className="card">
            <h3 id={headingId} className="card-title">Theme</h3>
            <p className="muted">Dark, light, or whichever your phone is set to. It is kept on this device only.</p>
            <div className={SEGMENTS} role="radiogroup" aria-labelledby={headingId}>
                {THEME_CHOICES.map((option) => (
                    <label key={option.value} className={`${SEGMENT} px-3.5`}>
                        <input
                            className={SEGMENT_INPUT}
                            type="radio"
                            name="theme"
                            value={option.value}
                            aria-label={option.label}
                            checked={choice === option.value}
                            onChange={() => setThemeChoice(option.value)}
                        />
                        <span aria-hidden="true">{option.label}</span>
                    </label>
                ))}
            </div>
        </section>
    );
}

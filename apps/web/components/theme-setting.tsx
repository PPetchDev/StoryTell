'use client';

import { useId } from 'react';

import { setThemeChoice, THEME_CHOICES, useThemeChoice } from '@/lib/theme';

import styles from './text-size-setting.module.css';

/** Settings' Theme choice (spec: Chat looks, "Light theme"): it applies at once and only on this device. */
export function ThemeSetting() {
    const choice = useThemeChoice();
    const headingId = useId();
    return (
        <section className="card">
            <h2 id={headingId}>Theme</h2>
            <p className="muted">Dark, light, or whichever your phone is set to. It is kept on this device only.</p>
            <div className={styles.segments} role="radiogroup" aria-labelledby={headingId}>
                {THEME_CHOICES.map((option) => (
                    <label key={option.value} className={`${styles.segment} ${styles.wide}`}>
                        <input
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

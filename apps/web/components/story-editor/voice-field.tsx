'use client';

import { useEffect, useId, useRef, useState } from 'react';

import { ApiError } from '@/lib/api';
import { VOICE_GROUPS, voiceName, voiceSample, VoiceList } from '@/lib/voices';
import styles from './fields.module.css';

const OUT_OF_VENICE_CREDIT = '402.001.004';

/** The select's value for null: the default, or "same as narration". */
const NONE = '';

interface VoiceFieldProps {
    label: string;
    /** A voice id, or null for the default this field names in `noneLabel`. */
    value: string | null;
    /** What null reads as, e.g. "Default (Sky)" or "Same as narration". */
    noneLabel: string;
    /** The voice list; null while it loads. */
    voices: VoiceList | null;
    /** The voice ▶ Sample plays: the chosen one, or what null stands for. */
    sampleVoice: string;
    onChange(voice: string | null): void;
    /** Shown under the field: the cost hint goes under the first sample button on a page. */
    hint?: string;
}

/**
 * A Kokoro voice for Read aloud (.scratch/read-aloud/spec.md, "Story editor"): a select grouped
 * by accent and gender, and ▶ Sample, which plays the voice's kept sample or makes it once.
 * A sample only ever plays from this tap.
 */
export function VoiceField({ label, value, noneLabel, voices, sampleVoice, onChange, hint }: VoiceFieldProps) {
    const id = useId();
    const [state, setState] = useState<'idle' | 'loading' | 'playing'>('idle');
    const [error, setError] = useState<string | null>(null);
    const audio = useRef<HTMLAudioElement | null>(null);
    const url = useRef<string | null>(null);
    /** False once the field is gone (the editor left): a sample that arrives late then never plays. */
    const mounted = useRef(true);

    const stop = () => {
        audio.current?.pause();
        audio.current = null;
        if (url.current) URL.revokeObjectURL(url.current);
        url.current = null;
    };
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
            stop();
        };
    }, []);

    const playSample = async () => {
        stop();
        setError(null);
        setState('loading');
        try {
            const blob = await voiceSample(sampleVoice);
            if (!mounted.current) return;
            const player = new Audio((url.current = URL.createObjectURL(blob)));
            audio.current = player;
            player.onended = () => {
                stop();
                setState('idle');
            };
            await player.play();
            setState('playing');
        } catch (caught) {
            stop();
            setState('idle');
            setError(sampleError(caught));
        }
    };

    const listed = voices?.voices ?? [];
    // A stored voice Venice no longer lists stays selectable, so the field never shows a wrong choice.
    const unlisted = value !== null && voices !== null && !listed.some((voice) => voice.id === value);

    return (
        <div className={styles.field}>
            <div className={styles.head}>
                <span className={styles.label}>
                    <label htmlFor={id}>{label}</label>
                </span>
            </div>
            <div className={styles.voiceRow}>
                <select
                    id={id}
                    className={styles.input}
                    value={value ?? NONE}
                    disabled={voices === null}
                    aria-describedby={hint ? `${id}-hint` : undefined}
                    onChange={(event) => onChange(event.target.value === NONE ? null : event.target.value)}
                >
                    <option value={NONE}>{noneLabel}</option>
                    {unlisted && value !== null && <option value={value}>{voiceName(value, listed)}</option>}
                    {VOICE_GROUPS.map((group) => {
                        const inGroup = listed.filter((voice) => voice.accent === group.accent && voice.gender === group.gender);
                        if (inGroup.length === 0) return null;
                        return (
                            <optgroup key={group.label} label={group.label}>
                                {inGroup.map((voice) => (
                                    <option key={voice.id} value={voice.id}>
                                        {voiceName(voice.id, listed)}
                                    </option>
                                ))}
                            </optgroup>
                        );
                    })}
                </select>
                <button
                    type="button"
                    className="button button-quiet"
                    aria-label={state === 'playing' ? `Playing ${label}: tap to stop` : `Sample ${label}`}
                    disabled={state === 'loading'}
                    onClick={() => (state === 'playing' ? (stop(), setState('idle')) : void playSample())}
                >
                    {state === 'playing' ? 'Playing…' : state === 'loading' ? 'Loading…' : '▶ Sample'}
                </button>
            </div>
            {error && (
                <p role="alert" className={styles.error}>
                    {error}
                </p>
            )}
            {hint && (
                <p id={`${id}-hint`} className={styles.hint}>
                    {hint}
                </p>
            )}
        </div>
    );
}

function sampleError(error: unknown): string {
    if (error instanceof ApiError && error.code === OUT_OF_VENICE_CREDIT) return "Couldn't play a sample: out of Venice credit.";
    if (error instanceof Error && error.name === 'NotAllowedError') return "Couldn't play a sample: the browser didn't allow it. Tap again.";
    const reason = error instanceof Error ? error.message : 'something went wrong.';
    return `Couldn't play a sample: ${reason}`;
}

'use client';

import { useState } from 'react';

import { FoldTitle, useFoldedState } from '@/components/fold/fold-button';
import { Autosave } from '@/components/story-editor/autosave';
import { apiSend } from '@/lib/api';
import { PlayModelOption, SamplerOption, SamplerParam, SamplerValues, SettingsResponse } from '@/lib/types';

import styles from './sampling-fold.module.css';

const FOLD_KEY = 'settings.samplingOpen';

/** Each parameter's name and what it does, in plain words. */
const SAMPLER_TEXT: Record<SamplerParam, { label: string; explanation: string }> = {
    temperature: { label: 'Temperature', explanation: 'Higher is more surprising, lower more predictable.' },
    minP: { label: 'Min-p', explanation: 'Trims unlikely word choices; higher trims more.' },
    topP: { label: 'Top-p', explanation: 'Keeps only the likeliest words; lower is narrower.' },
    repetitionPenalty: { label: 'Repetition penalty', explanation: 'Above 1 pushes back on repeated words and details.' },
};

/** The autosave key of one field's edits. */
const samplerKey = (model: string, param: SamplerParam) => `settings.samplers.${model}.${param}`;

const ALL_DEFAULT: Record<SamplerParam, null> = { temperature: null, minP: null, topP: null, repetitionPenalty: null };

/** Ignores the answer: the fields keep what the user typed. */
const keepTyped = () => {};

/**
 * Blank is null (reset to default); otherwise a number in range with at most two decimals, as
 * the API takes it. Checked as typed, so 0.07 stays 0.07.
 */
function checkSampler(text: string, badInput: boolean, option: SamplerOption): number | null | string {
    const error = `Enter a number from ${option.min} to ${option.max}, with at most two decimals.`;
    if (badInput) return error;
    if (text.trim() === '') return null;
    if (!/^(\d+(\.\d{0,2})?|\.\d{1,2})$/.test(text.trim())) return error;
    const value = Number(text);
    return value < option.min || value > option.max ? error : value;
}

function SamplerField({
    model,
    option,
    initial,
    autosave,
    onSaved,
}: {
    model: string;
    option: SamplerOption;
    initial: number | undefined;
    autosave: Autosave;
    /** The value now held for this parameter: a number, or undefined for default. */
    onSaved(value: number | undefined): void;
}) {
    const [text, setText] = useState(initial === undefined ? '' : String(initial));
    const [error, setError] = useState<string | null>(null);
    const { label, explanation } = SAMPLER_TEXT[option.param];
    const id = `sampler-${option.param}`;
    const key = samplerKey(model, option.param);
    const describedBy = [`${id}-about`, option.suggested !== null && `${id}-suggests`, error && `${id}-error`]
        .filter(Boolean)
        .join(' ');

    const change = (next: string, badInput: boolean) => {
        setText(next);
        const checked = checkSampler(next, badInput, option);
        if (typeof checked === 'string') {
            setError(checked);
            autosave.cancel(key);
            return;
        }
        setError(null);
        onSaved(checked ?? undefined);
        autosave.queue(
            key,
            () => apiSend<SettingsResponse>('PUT', `/settings/samplers/${model}`, { [option.param]: checked }),
            keepTyped,
        );
    };

    return (
        <div className="field">
            <label htmlFor={id}>{label}</label>
            <input
                id={id}
                type="number"
                inputMode="decimal"
                placeholder="Default"
                value={text}
                min={option.min}
                max={option.max}
                step={option.step}
                aria-invalid={error !== null}
                aria-describedby={describedBy}
                onChange={(event) => change(event.target.value, event.target.validity.badInput)}
            />
            <p id={`${id}-about`} className="muted small">
                {explanation}
            </p>
            {option.suggested !== null && (
                <p id={`${id}-suggests`} className="muted small">
                    Maker suggests {option.suggested}
                </p>
            )}
            {error && (
                <p id={`${id}-error`} role="alert" className="field-error">
                    {error}
                </p>
            )}
        </div>
    );
}

/**
 * Sampling for the chosen play model (spec: "Settings page"). Blank is the host's default and
 * is never sent; each field saves as it is typed. Switching the play model shows its values.
 */
export function SamplingFold({
    option,
    initial,
    autosave,
}: {
    option: PlayModelOption;
    /** The values saved per play model when the page opened. */
    initial: Record<string, SamplerValues>;
    autosave: Autosave;
}) {
    const folded = useFoldedState(FOLD_KEY, true);
    // What each model holds now, so switching back shows what was typed for it.
    const [values, setValues] = useState<Record<string, SamplerValues>>(initial);
    const model = option.id;
    const current = values[model] ?? {};
    // Bumped by Reset, so every field starts again from blank.
    const [resets, setResets] = useState(0);

    const hold = (param: SamplerParam, value: number | undefined) =>
        setValues((all) => {
            const next = { ...all[model] };
            if (value === undefined) delete next[param];
            else next[param] = value;
            return { ...all, [model]: next };
        });

    /** Clears every value of this model: edits still waiting are dropped, then all four are reset. */
    const reset = () => {
        for (const param of Object.keys(ALL_DEFAULT) as SamplerParam[]) autosave.cancel(samplerKey(model, param));
        setValues((all) => ({ ...all, [model]: {} }));
        setResets((count) => count + 1);
        void autosave.commit(() => apiSend<SettingsResponse>('PUT', `/settings/samplers/${model}`, ALL_DEFAULT), keepTyped);
    };

    return (
        <div className={styles.sampling}>
            <FoldTitle foldKey={FOLD_KEY} controls="sampling-body" startsFolded>
                Sampling
            </FoldTitle>
            <div id="sampling-body" hidden={folded}>
                <p className="muted small">
                    Blank uses the host&apos;s default and sends nothing. Used for turns, Suggested replies and Write for
                    me.
                </p>
                {/* Keyed by model: a switch shows that model's own values. */}
                <div key={`${model}-${resets}`}>
                    {option.samplers.map((sampler) => (
                        <SamplerField
                            key={sampler.param}
                            model={model}
                            option={sampler}
                            initial={current[sampler.param]}
                            autosave={autosave}
                            onSaved={(value) => hold(sampler.param, value)}
                        />
                    ))}
                </div>
                <button
                    type="button"
                    className="button button-quiet button-small"
                    disabled={Object.keys(current).length === 0}
                    onClick={reset}
                >
                    Reset to defaults
                </button>
            </div>
        </div>
    );
}

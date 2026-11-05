'use client';

import { useState } from 'react';

import { BackupBanner } from '@/components/backup-banner';
import { useApiQuery } from '@/components/connection';
import { useAutosave } from '@/components/story-editor/autosave';
import { SaveStatus } from '@/components/story-editor/save-status';
import { TextSizeSetting } from '@/components/text-size-setting';
import { apiSend } from '@/lib/api';
import { ModelOption, Settings, SettingsResponse } from '@/lib/types';

type Queue = ReturnType<typeof useAutosave>['queue'];
type ModelKey = 'playModel' | 'imageModel';
type NumberKey = 'textCreditCapUsd' | 'textLowCreditPercent' | 'imageCreditCapUsd' | 'imageLowCreditPercent';

/** Sends one changed setting; the API changes only the fields it is sent. */
const saveSetting = (fields: Partial<Omit<Settings, 'updatedAt'>>) => () =>
    apiSend<SettingsResponse>('PUT', '/settings', fields);

/** Ignores the answer: the fields keep what the user typed. */
const keepTyped = () => {};

/** A percent of a pool: a whole number from 0 to 100, as the API takes it. */
function checkPercent(text: string): number | string {
    const value = Number(text);
    if (text.trim() === '' || !Number.isInteger(value) || value < 0 || value > 100) {
        return 'Enter a whole number from 0 to 100.';
    }
    return value;
}

/** A pool's size in USD: 0 or more, to the cent, as the API takes it. Checked as typed, so 0.07 stays 0.07. */
function checkUsd(text: string): number | string {
    if (!/^(\d+(\.\d{0,2})?|\.\d{1,2})$/.test(text.trim())) return 'Enter an amount of 0 or more, to the cent.';
    return Number(text);
}

const NUMBER_KINDS = {
    percent: { check: checkPercent, max: 100, step: 1 },
    usd: { check: checkUsd, max: undefined, step: 0.01 },
};

function ModelSelect({
    id,
    label,
    value,
    options,
    onChange,
}: {
    id: string;
    label: string;
    value: string;
    options: ModelOption[];
    onChange(value: string): void;
}) {
    return (
        <div className="field">
            <label htmlFor={id}>{label}</label>
            <select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
                {options.map((option) => (
                    <option key={option.id} value={option.id}>
                        {option.label}
                    </option>
                ))}
            </select>
        </div>
    );
}

/**
 * A numeric setting, saved once it holds a valid value (spec: "Saving"). An invalid value
 * shows its error here and is not sent; the field keeps what was typed either way.
 */
function NumberField({
    id,
    label,
    initial,
    min,
    max,
    step,
    check,
    onValid,
}: {
    id: string;
    label: string;
    initial: number;
    min: number;
    max?: number;
    step: number;
    check(text: string): number | string;
    onValid(value: number): void;
}) {
    const [text, setText] = useState(String(initial));
    const [error, setError] = useState<string | null>(null);
    const errorId = `${id}-error`;

    const change = (next: string) => {
        setText(next);
        const checked = check(next);
        if (typeof checked === 'string') {
            setError(checked);
            return;
        }
        setError(null);
        onValid(checked);
    };

    return (
        <div className="field">
            <label htmlFor={id}>{label}</label>
            <input
                id={id}
                type="number"
                inputMode="decimal"
                value={text}
                min={min}
                max={max}
                step={step}
                required
                aria-invalid={error !== null}
                aria-describedby={error ? errorId : undefined}
                onChange={(event) => change(event.target.value)}
            />
            {error && (
                <p id={errorId} role="alert" className="field-error">
                    {error}
                </p>
            )}
        </div>
    );
}

/** Every setting saves as it changes, with the status in the page header. */
function SettingsForm({ initial, queue }: { initial: SettingsResponse; queue: Queue }) {
    // The play model when the page opened: a different one now is a Drift risk.
    const [loadedPlayModel] = useState(initial.settings.playModel);
    const [models, setModels] = useState<Record<ModelKey, string>>({
        playModel: initial.settings.playModel,
        imageModel: initial.settings.imageModel,
    });

    const changeModel = (key: ModelKey, value: string) => {
        setModels((current) => ({ ...current, [key]: value }));
        queue(`settings.${key}`, saveSetting({ [key]: value }), keepTyped);
    };

    const numberField = (key: NumberKey, id: string, label: string, kind: keyof typeof NUMBER_KINDS) => (
        <NumberField
            id={id}
            label={label}
            initial={initial.settings[key]}
            min={0}
            max={NUMBER_KINDS[kind].max}
            step={NUMBER_KINDS[kind].step}
            check={NUMBER_KINDS[kind].check}
            onValid={(value) => queue(`settings.${key}`, saveSetting({ [key]: value }), keepTyped)}
        />
    );

    return (
        <>
            <section className="card">
                <h2>Models</h2>
                <ModelSelect
                    id="play-model"
                    label="Play model"
                    value={models.playModel}
                    options={initial.playModels}
                    onChange={(value) => changeModel('playModel', value)}
                />
                {models.playModel !== loadedPlayModel && (
                    <p role="alert" className="warning">
                        <strong>Drift warning.</strong> A different model plays Characters
                        differently. Chats whose last reply came from the old model will show a
                        Drift notice before the next send.
                    </p>
                )}
                <ModelSelect
                    id="image-model"
                    label="Snapshot model"
                    value={models.imageModel}
                    options={initial.imageModels}
                    onChange={(value) => changeModel('imageModel', value)}
                />
            </section>

            <section className="card">
                <h2>Credit</h2>
                <p className="muted">
                    Warn when a pool&apos;s remaining credit is at or below this share of what it
                    holds when topped up.
                </p>
                <div className="field-row">
                    {numberField('textCreditCapUsd', 'text-cap', 'Text pool (USD)', 'usd')}
                    {numberField('textLowCreditPercent', 'text-threshold', 'Text warning (%)', 'percent')}
                </div>
                <div className="field-row">
                    {numberField('imageCreditCapUsd', 'image-cap', 'Image pool (USD)', 'usd')}
                    {numberField('imageLowCreditPercent', 'image-threshold', 'Image warning (%)', 'percent')}
                </div>
            </section>
        </>
    );
}

export default function SettingsPage() {
    const settings = useApiQuery<SettingsResponse>('/settings');
    const { state, queue } = useAutosave();

    return (
        <main>
            <div className="page-header">
                <h1>Settings</h1>
                {settings.status === 'ready' && <SaveStatus state={state} />}
            </div>
            <BackupBanner />
            {settings.status === 'loading' && <p className="muted">Loading…</p>}
            {settings.status === 'error' && <p role="alert">{settings.error.message}</p>}
            {settings.status === 'ready' && <SettingsForm initial={settings.data} queue={queue} />}
            <TextSizeSetting />
        </main>
    );
}

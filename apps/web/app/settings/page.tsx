'use client';

import { FormEvent, useEffect, useState } from 'react';

import { useApiQuery } from '@/components/connection';
import { ApiError, apiFetch } from '@/lib/api';
import { ModelOption, Settings, SettingsResponse } from '@/lib/types';

type Form = Omit<Settings, 'updatedAt'>;

function toForm(settings: Settings): Form {
    const { updatedAt: _updatedAt, ...form } = settings;
    return form;
}

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

function NumberField({
    id,
    label,
    value,
    min,
    max,
    step,
    onChange,
}: {
    id: string;
    label: string;
    value: number;
    min: number;
    max?: number;
    step: number;
    onChange(value: number): void;
}) {
    return (
        <div className="field">
            <label htmlFor={id}>{label}</label>
            <input
                id={id}
                type="number"
                inputMode="decimal"
                value={value}
                min={min}
                max={max}
                step={step}
                required
                onChange={(event) => onChange(Number(event.target.value))}
            />
        </div>
    );
}

function SettingsForm({ initial }: { initial: SettingsResponse }) {
    const [saved, setSaved] = useState(initial.settings);
    const [form, setForm] = useState<Form>(toForm(initial.settings));
    const [saving, setSaving] = useState(false);
    const [notice, setNotice] = useState<string | undefined>();
    const [error, setError] = useState<string | undefined>();

    const set = <K extends keyof Form>(key: K, value: Form[K]) =>
        setForm((current) => ({ ...current, [key]: value }));
    const playModelChanged = form.playModel !== saved.playModel;

    useEffect(() => setNotice(undefined), [form]);

    const save = async (event: FormEvent) => {
        event.preventDefault();
        setSaving(true);
        setError(undefined);
        try {
            const response = await apiFetch<SettingsResponse>('/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            });
            setSaved(response.settings);
            setForm(toForm(response.settings));
            setNotice('Saved.');
        } catch (caught) {
            setError(caught instanceof ApiError ? caught.message : 'Could not save.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <form onSubmit={save}>
            <section className="card">
                <h2>Models</h2>
                <ModelSelect
                    id="play-model"
                    label="Play model"
                    value={form.playModel}
                    options={initial.playModels}
                    onChange={(value) => set('playModel', value)}
                />
                {playModelChanged && (
                    <p role="alert" className="warning">
                        <strong>Drift warning.</strong> A different model plays Characters
                        differently. Chats whose last reply came from the old model will show a
                        Drift notice before the next send.
                    </p>
                )}
                <ModelSelect
                    id="image-model"
                    label="Snapshot model"
                    value={form.imageModel}
                    options={initial.imageModels}
                    onChange={(value) => set('imageModel', value)}
                />
            </section>

            <section className="card">
                <h2>Credit</h2>
                <p className="muted">
                    Warn when a pool&apos;s remaining credit is at or below this share of what it
                    holds when topped up.
                </p>
                <div className="field-row">
                    <NumberField
                        id="text-cap"
                        label="Text pool (USD)"
                        value={form.textCreditCapUsd}
                        min={0}
                        step={0.01}
                        onChange={(value) => set('textCreditCapUsd', value)}
                    />
                    <NumberField
                        id="text-threshold"
                        label="Text warning (%)"
                        value={form.textLowCreditPercent}
                        min={0}
                        max={100}
                        step={1}
                        onChange={(value) => set('textLowCreditPercent', value)}
                    />
                </div>
                <div className="field-row">
                    <NumberField
                        id="image-cap"
                        label="Image pool (USD)"
                        value={form.imageCreditCapUsd}
                        min={0}
                        step={0.01}
                        onChange={(value) => set('imageCreditCapUsd', value)}
                    />
                    <NumberField
                        id="image-threshold"
                        label="Image warning (%)"
                        value={form.imageLowCreditPercent}
                        min={0}
                        max={100}
                        step={1}
                        onChange={(value) => set('imageLowCreditPercent', value)}
                    />
                </div>
            </section>

            <div className="actions">
                <button type="submit" className="button" disabled={saving}>
                    {saving ? 'Saving…' : 'Save'}
                </button>
                {notice && <span className="muted">{notice}</span>}
                {error && <span role="alert">{error}</span>}
            </div>
        </form>
    );
}

export default function SettingsPage() {
    const settings = useApiQuery<SettingsResponse>('/settings');

    return (
        <main>
            <h1>Settings</h1>
            {settings.status === 'loading' && <p className="muted">Loading…</p>}
            {settings.status === 'error' && <p role="alert">{settings.error.message}</p>}
            {settings.status === 'ready' && <SettingsForm initial={settings.data} />}
        </main>
    );
}

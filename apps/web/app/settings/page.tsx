'use client';

import { useState } from 'react';

import { BackupBannerView, useBackupStatus } from '@/components/backup-banner';
import { useApiQuery } from '@/components/connection';
import { ErrorState, Loading } from '@/components/query-state';
import { STICKY_HEADER } from '@/components/settings/sticky-header';
import { Autosave, useAutosave } from '@/components/story-editor/autosave';
import { SamplingFold } from '@/components/settings/sampling-fold';
import { AppSavedRepliesCard } from '@/components/saved-replies/app-saved-replies-card';
import { AppReplaceRulesCard } from '@/components/replace-rules/app-replace-rules-card';
import { SaveStatus } from '@/components/story-editor/save-status';
import { PeopleCard } from '@/components/settings/people-card';
import { SignOutSetting } from '@/components/sign-in-gate';
import { useAccount } from '@/lib/account';
import { TextSizeSetting } from '@/components/text-size-setting';
import { ThemeSetting } from '@/components/theme-setting';
import { apiSend } from '@/lib/api';
import { ImageModelOption, ModelOption, PlayModelOption, Settings, SettingsResponse, SnapshotSize } from '@/lib/types';
import { useLaterError } from '@/lib/use-settled';

type ModelKey = 'playModel' | 'imageModel';

/** "$0.56 in / $2.50 out per million tokens · a long turn about $0.01" */
function priceLine(option: PlayModelOption): string {
    const { input, output } = option.priceUsdPerMillion;
    return `$${input.toFixed(2)} in / $${output.toFixed(2)} out per million tokens · a long turn about $${option.longTurnUsd.toFixed(2)}`;
}

/** The size kept when the Snapshot model changes: the same one if the new model has it, else its smallest. */
function sizeFor(option: ImageModelOption | undefined, size: SnapshotSize): SnapshotSize {
    if (!option || option.sizes.some((entry) => entry.size === size)) return size;
    return option.sizes[0]?.size ?? '1K';
}
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
    note,
    onChange,
}: {
    id: string;
    label: string;
    value: string;
    options: ModelOption[];
    /** A line under the select, read with it. */
    note?: string;
    onChange(value: string): void;
}) {
    const noteId = `${id}-note`;
    return (
        <div className="field">
            <label htmlFor={id}>{label}</label>
            <select
                id={id}
                value={value}
                aria-describedby={note ? noteId : undefined}
                onChange={(event) => onChange(event.target.value)}
            >
                {options.map((option) => (
                    <option key={option.id} value={option.id}>
                        {option.label}
                    </option>
                ))}
            </select>
            {note && (
                <p id={noteId} className="muted">
                    {note}
                </p>
            )}
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
    onInvalid,
}: {
    id: string;
    label: string;
    initial: number;
    min: number;
    max?: number;
    step: number;
    check(text: string): number | string;
    onValid(value: number): void;
    /** The field holds a value that must not be sent, nor the one typed before it. */
    onInvalid(): void;
}) {
    const [text, setText] = useState(String(initial));
    const [error, setError] = useLaterError();
    const errorId = `${id}-error`;

    const change = (next: string) => {
        setText(next);
        const checked = check(next);
        if (typeof checked === 'string') {
            setError(checked);
            onInvalid();
            return;
        }
        setError(null);
        onValid(checked);
    };

    return (
        <div className="field my-0">
            <label htmlFor={id}>{label}</label>
            <input
                id={id}
                type="number"
                inputMode="decimal"
                value={text}
                min={min}
                max={max}
                step={step}
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
function SettingsForm({ initial, autosave }: { initial: SettingsResponse; autosave: Autosave }) {
    const { isOwner } = useAccount();
    // The play model when the page opened: a different one now is a Drift risk.
    const [loadedPlayModel] = useState(initial.settings.playModel);
    const [models, setModels] = useState<Record<ModelKey, string>>({
        playModel: initial.settings.playModel,
        imageModel: initial.settings.imageModel,
    });
    const [snapshotSize, setSnapshotSize] = useState<SnapshotSize>(initial.settings.snapshotSize);
    const imageOption = initial.imageModels.find((option) => option.id === models.imageModel);
    const playOption = initial.playModels.find((option) => option.id === models.playModel);

    const changeModel = (key: ModelKey, value: string) => {
        setModels((current) => ({ ...current, [key]: value }));
        if (key === 'imageModel') {
            changeSnapshot(value, sizeFor(initial.imageModels.find((option) => option.id === value), snapshotSize));
            return;
        }
        autosave.queue(`settings.${key}`, saveSetting({ [key]: value }), keepTyped);
    };

    // The model and its size go together: the API refuses a size the model is not drawn at.
    const changeSnapshot = (imageModel: string, size: SnapshotSize) => {
        setSnapshotSize(size);
        autosave.queue('settings.snapshot', saveSetting({ imageModel, snapshotSize: size }), keepTyped);
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
            onValid={(value) => autosave.queue(`settings.${key}`, saveSetting({ [key]: value }), keepTyped)}
            onInvalid={() => autosave.cancel(`settings.${key}`)}
        />
    );

    return (
        <>
            {/* The Owner chooses the Models, Sampling and credit settings for everyone (.scratch/accounts/spec.md). */}
            {isOwner && (
                <section className="card">
                    <h2>Models</h2>
                    <ModelSelect
                        id="play-model"
                        label="Play model"
                        value={models.playModel}
                        options={initial.playModels}
                        note={playOption && priceLine(playOption)}
                        onChange={(value) => changeModel('playModel', value)}
                    />
                    {models.playModel !== loadedPlayModel && (
                        <p role="alert" className="warning">
                            <strong>Drift warning.</strong> A different model plays Characters
                            differently. Chats whose last reply came from the old model will show a
                            Drift notice before the next send.
                        </p>
                    )}
                    {playOption && <SamplingFold option={playOption} initial={initial.settings.samplers} autosave={autosave} />}
                    <ModelSelect
                        id="image-model"
                        label="Snapshot model"
                        value={models.imageModel}
                        options={initial.imageModels}
                        onChange={(value) => changeModel('imageModel', value)}
                    />
                    <div className="field">
                        <label htmlFor="snapshot-size">Snapshot size</label>
                        <select
                            id="snapshot-size"
                            value={snapshotSize}
                            aria-describedby={imageOption && imageOption.sizes.length < 2 ? 'snapshot-size-note' : undefined}
                            onChange={(event) => changeSnapshot(models.imageModel, event.target.value as SnapshotSize)}
                        >
                            {(imageOption?.sizes ?? [{ size: snapshotSize, priceUsd: 0 }]).map((entry) => (
                                <option key={entry.size} value={entry.size}>
                                    {`${entry.size} · $${entry.priceUsd.toFixed(2)}`}
                                </option>
                            ))}
                        </select>
                        {imageOption && imageOption.sizes.length < 2 && (
                            <p id="snapshot-size-note" className="muted">
                                This model draws at 1K only.
                            </p>
                        )}
                    </div>
                </section>
            )}

            <AppSavedRepliesCard autosave={autosave} />
            <AppReplaceRulesCard autosave={autosave} />

            {isOwner && <PeopleCard />}

            {isOwner && (
                <section className="card">
                    <h2>Credit</h2>
                    <p className="muted">
                        Warn when a pool&apos;s remaining credit is at or below this share of what it
                        holds when topped up.
                    </p>
                    {/* The boxes of a row line up whatever their labels' lengths (audit L22). */}
                    <div className="field-row mb-3 items-end">
                        {numberField('textCreditCapUsd', 'text-cap', 'Text pool (USD)', 'usd')}
                        {numberField('textLowCreditPercent', 'text-threshold', 'Text warning (%)', 'percent')}
                    </div>
                    <div className="field-row items-end">
                        {numberField('imageCreditCapUsd', 'image-cap', 'Images and audio (Venice) pool (USD)', 'usd')}
                        {numberField('imageLowCreditPercent', 'image-threshold', 'Images and audio (Venice) warning (%)', 'percent')}
                    </div>
                </section>
            )}
        </>
    );
}

export default function SettingsPage() {
    const settings = useApiQuery<SettingsResponse>('/settings');
    const autosave = useAutosave();
    const backup = useBackupStatus();

    return (
        <main>
            <div className={STICKY_HEADER}>
                <h1>Settings</h1>
                {settings.status === 'ready' && (
                    <div className="flex items-center gap-2">
                        <SaveStatus state={autosave.state} />
                    </div>
                )}
            </div>
            {/*
             * This device's settings come first: they are there at once, so nothing that loads after
             * them (the form, the backup banner) pushes them down under a finger. The banner and the
             * form wait for each other, so neither arrives above the other once it shows (audit M38).
             */}
            <ThemeSetting />
            <TextSizeSetting />
            <SignOutSetting />
            {(settings.status === 'loading' || backup === undefined) && settings.status !== 'error' && (
                <Loading label="Loading Settings…" className="card" />
            )}
            {backup !== undefined && settings.status !== 'loading' && <BackupBannerView status={backup} />}
            {settings.status === 'error' && <ErrorState title="Couldn't load Settings." error={settings.error} onRetry={settings.retry} />}
            {settings.status === 'ready' && backup !== undefined && <SettingsForm initial={settings.data} autosave={autosave} />}
        </main>
    );
}

'use client';

import { ChangeEvent, useEffect, useRef, useState } from 'react';

import { useConnection } from '@/components/connection';
import { PortraitImage } from '@/components/portrait/portrait-image';
import { ApiError, apiFetch, ApiUnreachableError } from '@/lib/api';
import { preparedForUpload } from '@/lib/cover';
import { EMOTION_LABEL, Expression, EXPRESSION_EMOTIONS, ExpressionEmotion } from '@/lib/expressions';
import { Character, PortraitCrop, referenceImageUrl, Story, storyApi } from '@/lib/story';
import { SettingsResponse, usd } from '@/lib/types';
import { ConfirmButton } from './fields';
import { PortraitCropper } from './portrait-cropper';
import styles from './expressions.module.css';

/** Runs a write that answers with the whole Story, after pending edits; a failure goes to `onError`. */
type Commit = (run: () => Promise<Story>, onError: (message: string) => void) => Promise<Story | undefined>;

/** The error codes a draw is routed on (docs/error-codes.md). */
const OUT_OF_IMAGE_CREDIT = '402.001.004';

let drawPrice: Promise<number | null> | undefined;

/** What one drawing costs: the Settings Snapshot model's 1K price, read once per page load. */
function loadDrawPrice(): Promise<number | null> {
    drawPrice ??= apiFetch<SettingsResponse>('/settings').then(
        ({ settings, imageModels }) =>
            imageModels.find((model) => model.id === settings.imageModel)?.sizes.find((size) => size.size === '1K')?.priceUsd ?? null,
        (error: unknown) => {
            drawPrice = undefined;
            throw error;
        },
    );
    return drawPrice;
}

function useDrawPrice(): number | null {
    const [price, setPrice] = useState<number | null>(null);
    useEffect(() => {
        let live = true;
        loadDrawPrice().then(
            (loaded) => live && setPrice(loaded),
            () => {},
        );
        return () => {
            live = false;
        };
    }, []);
    return price;
}

interface ExpressionsProps {
    storyId: number;
    character: Character;
    commit: Commit;
    /** Sends pending field edits first, so a drawing uses the Name and Appearance just typed. */
    flush(): Promise<void>;
    /** Takes a drawn Expression from a Story answer without the rest of it, which may be older than what was typed since. */
    onDrawn(story: Story): void;
}

/**
 * A Character's Expressions (.scratch/expressions/spec.md, "In the Story editor"): one row per
 * emotion with a picture, after the Reference image on the Character card. Each row is its own
 * request; a drawing goes outside the editor's save queue, so the other rows and fields stay
 * usable while it draws.
 */
export function Expressions({ storyId, character, commit, flush, onDrawn }: ExpressionsProps) {
    const heading = character.name.trim() === '' ? 'this Character' : character.name;
    const byEmotion = new Map(character.expressions.map((expression) => [expression.emotion, expression]));
    const price = useDrawPrice();
    return (
        <fieldset className="subsection">
            <legend>Expressions</legend>
            <p className="hint">
                A picture for each feeling. In a Chat, a line that shows one has this picture in place of the Portrait; the
                others keep the Portrait.
            </p>
            {character.referenceImagePath === null && <p className="hint">Add a Reference image to draw Expressions.</p>}
            <ul className={styles.rows}>
                {EXPRESSION_EMOTIONS.map((emotion) => (
                    <ExpressionRow
                        key={emotion}
                        storyId={storyId}
                        character={character}
                        heading={heading}
                        emotion={emotion}
                        expression={byEmotion.get(emotion)}
                        price={price}
                        commit={commit}
                        flush={flush}
                        onDrawn={onDrawn}
                    />
                ))}
            </ul>
        </fieldset>
    );
}

interface ExpressionRowProps extends Omit<ExpressionsProps, 'character'> {
    character: Character;
    heading: string;
    emotion: ExpressionEmotion;
    expression: Expression | undefined;
    price: number | null;
}

function ExpressionRow({ storyId, character, heading, emotion, expression, price, commit, flush, onDrawn }: ExpressionRowProps) {
    const { reportUnreachable } = useConnection();
    const [busy, setBusy] = useState<string | null>(null);
    /** Shown in the row as it is. */
    const [error, setError] = useState<string | null>(null);
    /** Why the last square failed to save, shown in the cropper. */
    const [cropError, setCropError] = useState<string | null>(null);
    const [cropping, setCropping] = useState(false);
    const fileInput = useRef<HTMLInputElement>(null);
    const label = EMOTION_LABEL[emotion];
    const src = expression ? referenceImageUrl(expression.imagePath) : null;
    const canDraw = character.referenceImagePath !== null;
    const drawLabel = price === null ? 'Draw' : `Draw · ${usd(price)}`;

    /** One write of this row at a time; `what` says what is being saved. */
    const save = async (
        what: string,
        run: () => Promise<Story>,
        onError = (message: string) => setError(`Couldn't save the ${label} Expression: ${message}`),
    ): Promise<boolean> => {
        setBusy(what);
        setError(null);
        setCropError(null);
        const saved = await commit(run, onError);
        setBusy(null);
        return saved !== undefined;
    };

    const draw = async () => {
        setBusy('Drawing…');
        setError(null);
        try {
            await flush();
            onDrawn(await storyApi.drawExpression(storyId, character.id, emotion));
        } catch (caught) {
            if (caught instanceof ApiUnreachableError) reportUnreachable();
            else if (caught instanceof ApiError && caught.code === OUT_OF_IMAGE_CREDIT) {
                setError('Out of image credit, so no Expression can be drawn until it is topped up. Play is unaffected.');
            } else {
                setError(`Couldn't draw the ${label} Expression: ${caught instanceof Error ? caught.message : 'Something went wrong.'}`);
            }
        }
        setBusy(null);
    };

    const upload = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        await save('Uploading…', async () => {
            const { picture, filename } = await preparedForUpload(file);
            return storyApi.uploadExpression(storyId, character.id, emotion, picture, filename);
        });
    };

    const saveCrop = (crop: PortraitCrop) => {
        void save('Saving…', () => storyApi.setExpressionCrop(storyId, character.id, emotion, crop), setCropError).then((saved) => {
            if (saved) setCropping(false);
        });
    };

    return (
        <li className={styles.row} role="group" aria-label={`${label} Expression`}>
            {src ? (
                <PortraitImage portrait={{ src, crop: expression!.crop ?? character.portraitCrop }} className={styles.thumb} />
            ) : (
                <span className={`${styles.thumb} ${styles.empty}`} aria-hidden="true" />
            )}
            <div className={styles.text}>
                <span className={styles.label}>{label}</span>
                {busy && (
                    <span className="hint" role="status">
                        {busy}
                    </span>
                )}
                {!busy && expression?.outdated && <span className="hint">Drawn from an earlier Reference image.</span>}
                {!busy && expression && !expression.outdated && (
                    <span className="hint">{expression.crop ? 'Its own face square.' : "The Portrait's face square."}</span>
                )}
            </div>
            <div className={styles.tools}>
                {canDraw && !expression && (
                    <button type="button" className="button button-small" disabled={busy !== null} onClick={() => void draw()}>
                        {drawLabel}
                    </button>
                )}
                {canDraw && expression && (
                    <ConfirmButton
                        label="Draw again"
                        disabled={busy !== null}
                        question={`Draw a new ${label} Expression?`}
                        warning="It replaces the current one."
                        confirmLabel={drawLabel}
                        onConfirm={() => void draw()}
                    />
                )}
                <button type="button" className="button button-quiet button-small" disabled={busy !== null} onClick={() => fileInput.current?.click()}>
                    Upload
                </button>
                {expression && (
                    <button type="button" className="button button-quiet button-small" disabled={busy !== null} onClick={() => setCropping(true)}>
                        Pick the face
                    </button>
                )}
                {expression?.crop && (
                    <button
                        type="button"
                        className="button button-quiet button-small"
                        disabled={busy !== null}
                        onClick={() => void save('Saving…', () => storyApi.clearExpressionCrop(storyId, character.id, emotion))}
                    >
                        Reset
                    </button>
                )}
                {expression && (
                    <ConfirmButton
                        label="Remove"
                        danger
                        disabled={busy !== null}
                        question={`Remove the ${label} Expression?`}
                        warning="Its picture is deleted, and lines that show it get the Portrait."
                        confirmLabel="Remove"
                        onConfirm={() => void save('Removing…', () => storyApi.removeExpression(storyId, character.id, emotion))}
                    />
                )}
            </div>
            <input
                ref={fileInput}
                className="visually-hidden"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                aria-label={`Picture for ${label}`}
                tabIndex={-1}
                onChange={(event) => void upload(event)}
            />
            {error && (
                <p className={`field-error ${styles.error}`} role="alert">
                    {error}
                </p>
            )}
            {cropping && src && (
                <PortraitCropper
                    name={heading}
                    src={src}
                    initial={expression!.crop ?? character.portraitCrop}
                    saving={busy !== null}
                    error={cropError}
                    onSave={saveCrop}
                    onClose={() => {
                        setCropping(false);
                        setCropError(null);
                    }}
                    sheetLabel={`${label} Expression of ${heading}`}
                    title={`${label} Expression`}
                    imageAlt={`${label} Expression of ${heading}`}
                />
            )}
        </li>
    );
}

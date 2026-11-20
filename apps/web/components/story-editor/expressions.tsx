'use client';

import { ChangeEvent, useEffect, useRef, useState } from 'react';

import { announce } from '@/components/announcer';
import { useConnection } from '@/components/connection';
import { PortraitImage } from '@/components/portrait/portrait-image';
import { ApiError, apiFetch, ApiUnreachableError } from '@/lib/api';
import { preparedForUpload } from '@/lib/cover';
import { EMOTION_LABEL, EVERYDAY_EMOTIONS, Expression, ExpressionDrawing, EXPRESSION_EMOTIONS, ExpressionEmotion, INTIMATE_EMOTIONS } from '@/lib/expressions';
import { Character, PortraitCrop, referenceImageUrl, Story, storyApi } from '@/lib/story';
import { SettingsResponse, usd } from '@/lib/types';
import { ConfirmButton, FIELD_HINT } from './fields';
import { SUBSECTION, SUBSECTION_LEGEND } from './folding-card';
import { PortraitCropper } from './portrait-cropper';
import { UndoNotice, useUndo } from './undo-notice';

/** Runs a write that answers with the whole Story, after pending edits; a failure goes to `onError`. */
type Commit = (run: () => Promise<Story>, onError: (message: string) => void) => Promise<Story | undefined>;

/** The error codes a draw is routed on (docs/error-codes.md). */
const OUT_OF_IMAGE_CREDIT = '402.001.004';

/** What cutting one picture out costs, an estimate as the API records it (.scratch/stage-pictures/spec.md). */
const CUTOUT_PRICE_USD = 0.01;

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
    /** The one emotion whose actions show; the rest are a tile each (docs/ui-audit-2026-11-13.md, H2). */
    const [open, setOpen] = useState<ExpressionEmotion | null>(null);
    const { reportUnreachable } = useConnection();
    /** The Draw all run on the server, while one is going (.scratch/expression-drawing/spec.md). */
    const [run, setRun] = useState<ExpressionDrawing | null>(null);
    const [drawAllError, setDrawAllError] = useState<string | null>(null);
    const canDraw = character.referenceImagePath !== null;
    // Draw all draws only what has no picture or an outdated one; with all thirteen there it redraws them.
    const missing = EXPRESSION_EMOTIONS.filter((emotion) => byEmotion.get(emotion)?.outdated !== false);
    const redraw = missing.length === 0;
    const toDraw = redraw ? EXPRESSION_EMOTIONS.length : missing.length;
    // Each drawing is cut out for the stage too (.scratch/stage-pictures/spec.md): about a cent more.
    const allPrice = price === null ? null : toDraw * (price + CUTOUT_PRICE_USD);
    const allLabel =
        redraw ? `Redraw all ${toDraw}` : toDraw === EXPRESSION_EMOTIONS.length ? `Draw all ${toDraw}` : `Draw the ${toDraw} missing`;
    const drawingAll = run?.running
        ? `Drawing ${run.current ? EMOTION_LABEL[run.current] : '…'}, ${Math.min(run.drawn.length + 1, run.emotions.length)} of ${run.emotions.length}. It goes on if you leave this page.`
        : null;

    /** A run that ended: take in its last pictures and say how it went. */
    const ended = (last: ExpressionDrawing) => {
        setRun(null);
        if (last.failed === null) announce(`Drew ${last.drawn.length} Expressions.`);
        else if (last.failed.code === OUT_OF_IMAGE_CREDIT) setDrawAllError('Out of image credit, so the rest were not drawn. Play is unaffected.');
        else setDrawAllError(`Stopped: ${last.failed.message}`);
    };

    // A run started earlier, from this page or another, shows where it is.
    useEffect(() => {
        let live = true;
        storyApi.expressionDrawing(storyId, character.id).then(
            (state) => live && state.running && setRun(state),
            () => {},
        );
        return () => {
            live = false;
        };
    }, [storyId, character.id]);

    // Follows a running run: each new picture shows as it lands. A failed check is not an outage: it asks again.
    const running = run?.running === true;
    useEffect(() => {
        if (!running) return;
        let seen = -1;
        let live = true;
        const check = async () => {
            try {
                const state = await storyApi.expressionDrawing(storyId, character.id);
                if (!live) return;
                if (state.drawn.length !== seen || !state.running) {
                    seen = state.drawn.length;
                    const story = await storyApi.get(storyId);
                    if (live) onDrawn(story);
                }
                if (!live) return;
                if (state.running) setRun(state);
                else ended(state);
            } catch {
                // Offline for a moment: the run goes on on the server; the next check catches up.
            }
        };
        const timer = window.setInterval(() => void check(), 3000);
        return () => {
            live = false;
            window.clearInterval(timer);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- follows the run, not each render's callbacks
    }, [running, storyId, character.id]);

    /** Starts the run on the server: it draws one after another by itself and stops at the first failure. */
    const drawAll = async () => {
        setDrawAllError(null);
        try {
            await flush();
            const state = await storyApi.startExpressionDrawing(storyId, character.id, redraw);
            if (state.running) setRun(state);
            else ended(state);
        } catch (caught) {
            if (caught instanceof ApiUnreachableError) reportUnreachable();
            else if (caught instanceof ApiError && caught.code === OUT_OF_IMAGE_CREDIT) setDrawAllError('Out of image credit, so none were drawn. Play is unaffected.');
            else setDrawAllError(`Not started: ${caught instanceof Error ? caught.message : 'Something went wrong.'}`);
        }
    };

    const tiles = (emotions: readonly ExpressionEmotion[]) =>
        emotions.map((emotion) => (
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
                open={open === emotion}
                locked={drawingAll !== null}
                onToggle={() => setOpen((current) => (current === emotion ? null : emotion))}
            />
        ));
    return (
        <fieldset className={`${SUBSECTION} lg:col-span-2`}>
            <legend className={SUBSECTION_LEGEND}>Expressions</legend>
            <p className={`${FIELD_HINT} mb-2`}>
                A picture for each feeling. In a Chat, a line that shows one has this picture in place of the Portrait; the
                others keep the Portrait. Tap a feeling to draw, upload or change it.
            </p>
            {character.referenceImagePath === null && <p className={`${FIELD_HINT} mb-2`}>Add a Reference image to draw Expressions.</p>}
            {canDraw && (
                <div className="mb-2 flex flex-wrap items-center gap-2">
                    <ConfirmButton
                        label={allLabel}
                        ariaLabel={`${allLabel} Expressions of ${heading}`}
                        disabled={drawingAll !== null}
                        question={`${allLabel} Expressions of ${heading}?`}
                        warning={
                            (redraw
                                ? 'Each one replaces the one there'
                                : 'Only those with no picture, or one drawn from an older Reference image; uploads stay') +
                            ', and each is cut out to stand on the Backdrop in the novel view. It goes on if you leave this page.'
                        }
                        confirmLabel={allPrice === null ? allLabel : `${allLabel} · ~${usd(allPrice)}`}
                        onConfirm={() => void drawAll()}
                    />
                    {drawingAll && (
                        <span className="hint mt-0" role="status">
                            {drawingAll}
                        </span>
                    )}
                </div>
            )}
            {drawAllError && (
                <p className="field-error m-0 mb-2" role="alert">
                    {drawAllError}
                </p>
            )}
            {/* Dense, so an open feeling's actions take a whole row under it and the tiles after it close the gap. */}
            <ul className="m-0 mt-2 grid list-none grid-flow-row-dense grid-cols-4 gap-2 p-0 sm:grid-cols-7" aria-label="Everyday feelings">
                {tiles(EVERYDAY_EMOTIONS)}
            </ul>
            <h3 className="m-0 mt-4 text-base font-semibold">Intimate scenes (18+)</h3>
            <p className={`${FIELD_HINT} mt-0.5 mb-2`}>Shown only in an intimate moment between adults. Without one, the nearest feeling above shows.</p>
            <ul className="m-0 grid list-none grid-flow-row-dense grid-cols-4 gap-2 p-0 sm:grid-cols-7" aria-label="Intimate feelings">
                {tiles(INTIMATE_EMOTIONS)}
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
    /** Its actions show, in a row of their own under its tile. */
    open: boolean;
    /** Draw all is running: no write of its own meanwhile. */
    locked: boolean;
    onToggle(): void;
}

function ExpressionRow({ storyId, character, heading, emotion, expression, price, commit, flush, onDrawn, open, locked, onToggle }: ExpressionRowProps) {
    const { reportUnreachable } = useConnection();
    const [ownBusy, setBusy] = useState<string | null>(null);
    const busy = ownBusy ?? (locked ? 'Waiting for Draw all…' : null);
    /** Shown in the row as it is. */
    const [error, setError] = useState<string | null>(null);
    /** Why the last square failed to save, shown in the cropper. */
    const [cropError, setCropError] = useState<string | null>(null);
    const [cropping, setCropping] = useState(false);
    const fileInput = useRef<HTMLInputElement>(null);
    const row = useRef<HTMLDivElement>(null);
    const undo = useUndo();
    const label = EMOTION_LABEL[emotion];
    // A status mounted with its words is often not read: say each write as it starts too (audit H12).
    useEffect(() => {
        if (busy) announce(`${label}: ${busy}`);
    }, [busy, label]);
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
            // The picture changes out of sight of a screen reader (audit H12).
            announce(`Drew the ${label} Expression.`);
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

    /** Reset acts at once, with an Undo that puts the picked square back (audit H3). */
    const resetCrop = () => {
        const before = expression?.crop;
        void save('Saving…', () => storyApi.clearExpressionCrop(storyId, character.id, emotion)).then((saved) => {
            if (!saved || !before) return;
            undo.offer({
                message: `Reset the ${label} Expression to the Portrait's face square.`,
                undo: () => void save('Saving…', () => storyApi.setExpressionCrop(storyId, character.id, emotion, before)),
                focusAfterUndo: () => row.current?.querySelector<HTMLElement>('[data-reset-face]'),
            });
        });
    };

    const saveCrop = (crop: PortraitCrop) => {
        void save('Saving…', () => storyApi.setExpressionCrop(storyId, character.id, emotion, crop), setCropError).then((saved) => {
            if (saved) setCropping(false);
        });
    };

    // A write that runs or failed keeps its actions in view, so its status and error stay readable.
    const shown = open || busy !== null || error !== null;
    const panelId = `expression-${character.id}-${emotion}`;

    return (
        <>
        <li>
            <button
                type="button"
                className={[
                    'bare-button flex min-h-11 w-full flex-col items-center gap-1 rounded-lg px-1 py-1.5 text-sm',
                    shown ? 'bg-surface-raised outline-2 outline-accent' : 'active:bg-surface-raised',
                ].join(' ')}
                aria-expanded={shown}
                aria-controls={panelId}
                aria-label={`${label} Expression${expression ? '' : ', none yet'}`}
                onClick={onToggle}
            >
                {src ? (
                    <PortraitImage portrait={{ src, crop: expression!.crop ?? character.portraitCrop }} className="size-12 flex-none" />
                ) : (
                    <span className="grid size-12 flex-none place-items-center rounded-full border border-dashed border-faint text-lg text-muted" aria-hidden="true">
                        +
                    </span>
                )}
                <span className="max-w-full truncate">{busy ? '…' : label}</span>
            </button>
        </li>
        <li id={panelId} hidden={!shown} className="col-span-full">
        <div ref={row} className="flex flex-wrap items-center gap-x-2.5 gap-y-2 rounded-lg bg-surface-raised p-3" role="group" aria-label={`${label} Expression`}>
            <div className="flex min-w-24 flex-1 flex-col gap-0.5">
                <span className="font-semibold">{label}</span>
                {busy && (
                    <span className="hint mt-0" role="status">
                        {busy}
                    </span>
                )}
                {!busy && expression?.outdated && <span className="hint mt-0">Drawn from an earlier Reference image.</span>}
                {!busy && expression && !expression.outdated && (
                    <span className="hint mt-0">{expression.crop ? 'Its own face square.' : "The Portrait's face square."}</span>
                )}
                {!busy && expression && (
                    <span className="hint mt-0">
                        {expression.cutoutPath ? 'Cut out: stands on the Backdrop in the novel view.' : 'Not cut out: shows with its own background in the novel view.'}
                    </span>
                )}
            </div>
            {/* Full-size buttons, 8px apart (audit H25), each named for its row (M11). */}
            <div className="flex flex-wrap gap-2">
                {canDraw && !expression && (
                    <button type="button" className="button" disabled={busy !== null} onClick={() => void draw()}>
                        {drawLabel}
                    </button>
                )}
                {canDraw && expression && (
                    <ConfirmButton
                        label="Draw again"
                        ariaLabel={`Draw again: ${label}`}
                        disabled={busy !== null}
                        question={`Draw a new ${label} Expression?`}
                        warning="It replaces the current one."
                        confirmLabel={drawLabel}
                        onConfirm={() => void draw()}
                    />
                )}
                <button
                    type="button"
                    className="button button-quiet"
                    aria-label={`Upload ${label}`}
                    disabled={busy !== null}
                    onClick={() => fileInput.current?.click()}
                >
                    Upload
                </button>
                {expression && (
                    <button
                        type="button"
                        className="button button-quiet"
                        aria-label={`Pick the face for ${label}`}
                        disabled={busy !== null}
                        onClick={() => setCropping(true)}
                    >
                        Pick the face
                    </button>
                )}
                {expression && !expression.cutoutPath && (
                    <button
                        type="button"
                        className="button button-quiet"
                        aria-label={`Cut out ${label}`}
                        disabled={busy !== null}
                        onClick={() =>
                            void save('Cutting out…', () => storyApi.cutOutExpression(storyId, character.id, emotion), (message) =>
                                setError(`Couldn't cut out the ${label} Expression: ${message}`),
                            )
                        }
                    >
                        {`Cut out · ~${usd(CUTOUT_PRICE_USD)}`}
                    </button>
                )}
                {expression?.crop && (
                    <button
                        type="button"
                        className="button button-quiet"
                        data-reset-face=""
                        aria-label={`Reset ${label}`}
                        disabled={busy !== null}
                        onClick={resetCrop}
                    >
                        Reset
                    </button>
                )}
                {expression && (
                    <ConfirmButton
                        label="Remove"
                        ariaLabel={`Remove ${label}`}
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
                <p className="field-error m-0 basis-full" role="alert">
                    {error}
                </p>
            )}
            <div className="basis-full empty:hidden">
                <UndoNotice undo={undo} />
            </div>
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
        </div>
        </li>
        </>
    );
}

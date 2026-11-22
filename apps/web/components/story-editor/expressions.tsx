'use client';

import { ChangeEvent, useEffect, useRef, useState } from 'react';

import { announce } from '@/components/announcer';
import { useConnection } from '@/components/connection';
import { EMOTION_GRID, TILE_LABEL, tileLabel } from '@/components/portrait/emotion-tiles';
import { PortraitImage } from '@/components/portrait/portrait-image';
import { ApiError, apiFetch, ApiUnreachableError } from '@/lib/api';
import { ExpressionEndpoints, expressionEndpoints } from '@/lib/expression-endpoints';
import { preparedCutout, preparedForUpload } from '@/lib/cover';
import { EMOTION_LABEL, EVERYDAY_EMOTIONS, Expression, ExpressionDrawing, EXPRESSION_EMOTIONS, FaceEmotion, INTIMATE_EMOTIONS } from '@/lib/expressions';
import { Character, PortraitCrop, referenceImageUrl, Story, storyApi } from '@/lib/story';
import { SettingsResponse, usd } from '@/lib/types';
import { ConfirmButton, FIELD_HINT } from './fields';
import { SUBSECTION, SUBSECTION_LEGEND } from './folding-card';
import { PortraitCropper } from './portrait-cropper';
import { UndoNotice, useUndo } from './undo-notice';

/** Runs a write that answers with the whole Story (or the Persona), after pending edits; a failure goes to `onError`. */
type Commit<T = Story> = (run: () => Promise<T>, onError: (message: string) => void) => Promise<T | undefined>;

/** The error codes a draw is routed on (docs/error-codes.md). */
const OUT_OF_IMAGE_CREDIT = '402.001.004';

/** What cutting one picture out costs until the API has said: Venice's price (.scratch/stage-pictures/spec.md). */
const CUTOUT_PRICE_USD = 0.03;

interface Prices {
    draw: number | null;
    /** What a cut-out costs by default, as Draw all pays it. */
    cutout: number;
    /** Whether the free cut-out can be asked for, and what Venice's costs. */
    freeCutout: boolean;
    veniceCutout: number;
}

let prices: Promise<Prices> | undefined;

/**
 * What one drawing costs (the Settings Snapshot model's 1K price) and what one cut-out costs (nothing
 * with the app's own background remover, .scratch/own-cutout/spec.md), read once per page load.
 */
function loadPrices(): Promise<Prices> {
    prices ??= apiFetch<SettingsResponse>('/settings').then(
        ({ settings, imageModels, cutoutPriceUsd, freeCutout, veniceCutoutPriceUsd }) => ({
            draw: imageModels.find((model) => model.id === settings.imageModel)?.sizes.find((size) => size.size === '1K')?.priceUsd ?? null,
            cutout: cutoutPriceUsd ?? CUTOUT_PRICE_USD,
            freeCutout: freeCutout ?? false,
            veniceCutout: veniceCutoutPriceUsd ?? CUTOUT_PRICE_USD,
        }),
        (error: unknown) => {
            prices = undefined;
            throw error;
        },
    );
    return prices;
}

export function loadDrawPrice(): Promise<number | null> {
    return loadPrices().then((loaded) => loaded.draw);
}

/** The cut-out's makers and prices: Venice alone, at its price, until the API has said otherwise. */
export function useCutoutPrices(): Pick<Prices, 'cutout' | 'freeCutout' | 'veniceCutout'> {
    const [loaded, setLoaded] = useState<Pick<Prices, 'cutout' | 'freeCutout' | 'veniceCutout'>>({ cutout: CUTOUT_PRICE_USD, freeCutout: false, veniceCutout: CUTOUT_PRICE_USD });
    useEffect(() => {
        let live = true;
        loadPrices().then(
            (answer) => live && setLoaded(answer),
            () => {},
        );
        return () => {
            live = false;
        };
    }, []);
    return loaded;
}

export function useDrawPrice(): number | null {
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
 * A Character's Expressions (.scratch/expressions/spec.md, "In the Story editor"), after the
 * Reference image on the Character card.
 */
export function Expressions({ storyId, character, commit, flush, onDrawn }: ExpressionsProps) {
    return (
        <ExpressionSet<Story>
            owner={{
                key: `character-${character.id}`,
                name: character.name.trim() === '' ? 'this Character' : character.name,
                expressions: character.expressions,
                picturePath: character.referenceImagePath,
                defaultCrop: character.portraitCrop,
                pictureName: 'Reference image',
                squareName: "the Portrait's face square",
                plainName: 'the Portrait',
            }}
            api={expressionEndpoints<Story>(`/stories/${storyId}/characters/${character.id}`)}
            commit={commit}
            flush={flush}
            onDrawn={onDrawn}
            reload={() => storyApi.get(storyId)}
        />
    );
}

/** Whose Expressions a set shows: a Character, the Role or a Persona (.scratch/your-faces/spec.md). */
export interface ExpressionOwner {
    /** Unique on the page, for the rows' ids. */
    key: string;
    /** As the questions and labels name it. */
    name: string;
    expressions: Expression[];
    /** The picture an Expression is drawn from; none, nothing can be drawn. */
    picturePath: string | null;
    /** The square an Expression without its own uses. */
    defaultCrop: PortraitCrop | null;
    /** What that picture is called: "Reference image", "Role image". */
    pictureName: string;
    /** What that square is called. */
    squareName: string;
    /** What a feeling without an Expression shows. */
    plainName: string;
}

interface ExpressionSetProps<T> {
    owner: ExpressionOwner;
    api: ExpressionEndpoints<T>;
    commit: Commit<T>;
    /** Sends pending field edits first. */
    flush(): Promise<void>;
    /** Takes a drawn Expression from an answer. */
    onDrawn(answer: T): void;
    /** The owner's answer as saved, to take in what a Draw all run drew. */
    reload(): Promise<T>;
}

/**
 * One owner's Expressions: one row per emotion with a picture. Each row is its own request; a
 * drawing goes outside the editor's save queue, so the other rows and fields stay usable while it
 * draws.
 */
export function ExpressionSet<T>({ owner, api, commit, flush, onDrawn, reload }: ExpressionSetProps<T>) {
    const heading = owner.name;
    const byEmotion = new Map(owner.expressions.map((expression) => [expression.emotion, expression]));
    const price = useDrawPrice();
    const cutoutPrice = useCutoutPrices().cutout;
    /** The one emotion whose actions show; the rest are a tile each (docs/ui-audit-2026-11-13.md, H2). */
    const [open, setOpen] = useState<FaceEmotion | null>(null);
    const { reportUnreachable } = useConnection();
    /** The Draw all run on the server, while one is going (.scratch/expression-drawing/spec.md). */
    const [run, setRun] = useState<ExpressionDrawing | null>(null);
    /** The run as last shown, for an answer that lands after a check already ended it. */
    const runRef = useRef(run);
    runRef.current = run;
    /** Stop was asked of this run: a check sent before it must not bring Stop back. */
    const stopAsked = useRef(false);
    const [drawAllError, setDrawAllError] = useState<string | null>(null);
    /** How a run the user stopped ended: news, not an error. */
    const [drawAllNote, setDrawAllNote] = useState<string | null>(null);
    const canDraw = owner.picturePath !== null;
    const all = EXPRESSION_EMOTIONS;
    // Draw all draws only what has no picture or an outdated one; with all of them there it redraws them.
    const missing = all.filter((emotion) => byEmotion.get(emotion)?.outdated !== false);
    const redraw = missing.length === 0;
    const toDraw = redraw ? all.length : missing.length;
    // Each drawing is cut out for the stage too (.scratch/stage-pictures/spec.md): about a cent more.
    const allPrice = price === null ? null : toDraw * (price + cutoutPrice);
    const allLabel =
        redraw ? `Redraw all ${toDraw}` : toDraw === all.length ? `Draw all ${toDraw}` : `Draw the ${toDraw} missing`;
    const drawingAll = run?.running
        ? run.stopped
            ? `Stopping after ${run.current ? EMOTION_LABEL[run.current] : 'this one'}…`
            : `Drawing ${run.current ? EMOTION_LABEL[run.current] : '…'}, ${Math.min(run.drawn.length + 1, run.emotions.length)} of ${run.emotions.length}. It goes on if you leave this page.`
        : null;

    /** A run that ended: take in its last pictures and say how it went. */
    const ended = (last: ExpressionDrawing) => {
        setRun(null);
        // Stop that landed on the last drawing stopped nothing: the run drew them all.
        if (last.stopped && last.failed === null && last.drawn.length < last.emotions.length) {
            setDrawAllNote(`Stopped after ${last.drawn.length} of ${last.emotions.length}. Draw again to draw the rest.`);
            announce(`Stopped after ${last.drawn.length} of ${last.emotions.length}.`);
        }
        else if (last.failed === null) announce(`Drew ${last.drawn.length} Expressions.`);
        else if (last.failed.code === OUT_OF_IMAGE_CREDIT) setDrawAllError('Out of image credit, so the rest were not drawn. Play is unaffected.');
        else setDrawAllError(`Stopped: ${last.failed.message}`);
    };

    // A run started earlier, from this page or another, shows where it is.
    useEffect(() => {
        let live = true;
        api.drawing().then(
            (state) => live && state.running && setRun(state),
            () => {},
        );
        return () => {
            live = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- once per owner
    }, [owner.key]);

    // Follows a running run: each new picture shows as it lands. A failed check is not an outage: it asks again.
    const running = run?.running === true;
    useEffect(() => {
        if (!running) return;
        let seen = -1;
        let live = true;
        const check = async () => {
            try {
                const state = await api.drawing();
                if (!live) return;
                if (state.drawn.length !== seen || !state.running) {
                    seen = state.drawn.length;
                    const answer = await reload();
                    if (live) onDrawn(answer);
                }
                if (!live) return;
                if (state.running) setRun(stopAsked.current ? { ...state, stopped: true } : state);
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
    }, [running, owner.key]);

    /** Stop (docs/ui-audit-2026-11-21.md, M4): the drawing under way finishes, being paid for already; none of the rest starts. */
    const stopAll = async () => {
        stopAsked.current = true;
        setRun((current) => (current ? { ...current, stopped: true } : current));
        try {
            const state = await api.stopDrawing();
            // A check ended it meanwhile: it has taken in the pictures and said so.
            if (!runRef.current) return;
            if (state.running) setRun(state);
            else {
                // It ended before the next check: take in its last pictures, which only a check would.
                const answer = await reload();
                onDrawn(answer);
                ended(state);
            }
        } catch (caught) {
            if (caught instanceof ApiUnreachableError) reportUnreachable();
            else setDrawAllError(`Not stopped: ${caught instanceof Error ? caught.message : 'Something went wrong.'}`);
        }
    };

    /** Starts the run on the server: it draws one after another by itself and stops at the first failure. */
    const drawAll = async () => {
        setDrawAllError(null);
        setDrawAllNote(null);
        stopAsked.current = false;
        try {
            await flush();
            const state = await api.startDrawing(redraw);
            if (state.running) setRun(state);
            else ended(state);
        } catch (caught) {
            if (caught instanceof ApiUnreachableError) reportUnreachable();
            else if (caught instanceof ApiError && caught.code === OUT_OF_IMAGE_CREDIT) setDrawAllError('Out of image credit, so none were drawn. Play is unaffected.');
            else setDrawAllError(`Not started: ${caught instanceof Error ? caught.message : 'Something went wrong.'}`);
        }
    };

    const tiles = (emotions: readonly FaceEmotion[]) =>
        emotions.map((emotion) => (
            <ExpressionRow<T>
                key={emotion}
                owner={owner}
                api={api}
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
                A picture for each feeling. In a Chat, a line that shows one has this picture in place of {owner.plainName}; the
                others keep {owner.plainName}. Tap a feeling to draw, upload or change it.
            </p>
            {owner.picturePath === null && <p className={`${FIELD_HINT} mb-2`}>Add a {owner.pictureName} to draw Expressions.</p>}
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
                                : `Only those with no picture, or one drawn from an older ${owner.pictureName}; uploads stay`) +
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
                    {run?.running && !run.stopped && (
                        <button type="button" className="button button-quiet" aria-label={`Stop drawing the Expressions of ${heading}`} onClick={() => void stopAll()}>
                            Stop
                        </button>
                    )}
                </div>
            )}
            {drawAllNote && <p className={`${FIELD_HINT} mt-0 mb-2`}>{drawAllNote}</p>}
            {drawAllError && (
                <p className="field-error m-0 mb-2" role="alert">
                    {drawAllError}
                </p>
            )}
            {/* Dense, so an open feeling's actions take a whole row under it and the tiles after it close the gap. */}
            <ul className={`m-0 mt-2 grid list-none grid-flow-row-dense gap-2 p-0 ${EMOTION_GRID}`} aria-label="Everyday feelings">
                {tiles(EVERYDAY_EMOTIONS)}
            </ul>
            <h3 className="m-0 mt-4 text-base font-semibold">Intimate scenes (18+)</h3>
            <p className={`${FIELD_HINT} mt-0.5 mb-2`}>Shown only in an intimate moment between adults. Without one, the nearest feeling above shows.</p>
            <ul className={`m-0 grid list-none grid-flow-row-dense gap-2 p-0 ${EMOTION_GRID}`} aria-label="Intimate feelings">
                {tiles(INTIMATE_EMOTIONS)}
            </ul>
        </fieldset>
    );
}

interface ExpressionRowProps<T> extends Omit<ExpressionSetProps<T>, 'reload'> {
    heading: string;
    emotion: FaceEmotion;
    expression: Expression | undefined;
    price: number | null;
    /** Its actions show, in a row of their own under its tile. */
    open: boolean;
    /** Draw all is running: no write of its own meanwhile. */
    locked: boolean;
    onToggle(): void;
}

function ExpressionRow<T>({ owner, api, heading, emotion, expression, price, commit, flush, onDrawn, open, locked, onToggle }: ExpressionRowProps<T>) {
    const { reportUnreachable } = useConnection();
    const [ownBusy, setBusy] = useState<string | null>(null);
    const busy = ownBusy ?? (locked ? 'Waiting for Draw all…' : null);
    /** Shown in the row as it is. */
    const [error, setError] = useState<string | null>(null);
    /** Why the last square failed to save, shown in the cropper. */
    const [cropError, setCropError] = useState<string | null>(null);
    const [cropping, setCropping] = useState(false);
    const cutouts = useCutoutPrices();
    const fileInput = useRef<HTMLInputElement>(null);
    const cutoutInput = useRef<HTMLInputElement>(null);
    const row = useRef<HTMLDivElement>(null);
    const undo = useUndo();
    const label = EMOTION_LABEL[emotion];
    // A status mounted with its words is often not read: say each write as it starts too (audit H12).
    // Only its own writes: while Draw all runs, the run's one status says how it goes (docs/ui-audit-2026-11-21.md, H1).
    useEffect(() => {
        if (ownBusy) announce(`${label}: ${ownBusy}`);
    }, [ownBusy, label]);
    const src = expression ? referenceImageUrl(expression.imagePath) : null;
    const canDraw = owner.picturePath !== null;
    const drawLabel = price === null ? 'Draw' : `Draw · ${usd(price)}`;

    /** One write of this row at a time; `what` says what is being saved. */
    const save = async (
        what: string,
        run: () => Promise<T>,
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
            onDrawn(await api.draw(emotion));
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
            return api.upload(emotion, picture, filename);
        });
    };

    /** A see-through picture made elsewhere becomes the cut-out, sent as it is so its transparency stays. */
    const uploadCutout = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        await save(
            'Uploading the cut-out…',
            async () => {
                const { picture, filename } = await preparedCutout(file);
                return api.uploadCutout(emotion, picture, filename);
            },
            (message) => setError(`Couldn't use that cut-out for ${label}: ${message}`),
        );
    };

    /** Reset acts at once, with an Undo that puts the picked square back (audit H3). */
    const resetCrop = () => {
        const before = expression?.crop;
        void save('Saving…', () => api.clearCrop(emotion)).then((saved) => {
            if (!saved || !before) return;
            undo.offer({
                message: `Reset the ${label} Expression to ${owner.squareName}.`,
                undo: () => void save('Saving…', () => api.setCrop(emotion, before)),
                focusAfterUndo: () => row.current?.querySelector<HTMLElement>('[data-reset-face]'),
            });
        });
    };

    const saveCrop = (crop: PortraitCrop) => {
        void save('Saving…', () => api.setCrop(emotion, crop), setCropError).then((saved) => {
            if (saved) setCropping(false);
        });
    };

    // A write that runs or failed keeps its actions in view, so its status and error stay readable.
    // Draw all's lock alone opens nothing: 21 panels of disabled buttons hid every tile (docs/ui-audit-2026-11-21.md, H1).
    const shown = open || ownBusy !== null || error !== null;
    const panelId = `expression-${owner.key}-${emotion}`;

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
                aria-label={`${label} Expression${expression ? (expression.outdated ? ', drawn from an earlier picture' : '') : ', none yet'}`}
                onClick={onToggle}
            >
                {src ? (
                    <span className="relative flex-none">
                        <PortraitImage portrait={{ src, crop: expression!.crop ?? owner.defaultCrop }} className="size-12" />
                        {/* An outdated one says so on its tile, not only in its panel (docs/ui-audit-2026-11-21.md, M5). */}
                        {expression!.outdated && (
                            <span className="absolute -right-1 -bottom-1 rounded-full border border-line bg-banner-surface px-1 text-xs leading-4 font-semibold text-text" aria-hidden="true">
                                old
                            </span>
                        )}
                    </span>
                ) : (
                    <span className="grid size-12 flex-none place-items-center rounded-full border border-dashed border-faint text-lg text-muted" aria-hidden="true">
                        +
                    </span>
                )}
                <span className={TILE_LABEL}>{ownBusy ? '…' : tileLabel(emotion)}</span>
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
                {!busy && expression?.outdated && <span className="hint mt-0">Drawn from an earlier {owner.pictureName}.</span>}
                {!busy && expression && !expression.outdated && (
                    <span className="hint mt-0">{expression.crop ? 'Its own face square.' : `${owner.squareName.charAt(0).toUpperCase()}${owner.squareName.slice(1)}.`}</span>
                )}
                {!busy && expression && (
                    <span className="hint mt-0">
                        {expression.cutoutPath
                            ? 'Cut out: stands on the Backdrop in the novel view.'
                            : 'Not cut out: shows with its own background in the novel view. Upload cut-out takes a see-through PNG or WebP made elsewhere, free.'}
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
                {/* A cut-out by either maker (.scratch/own-cutout/spec.md, "A choice of two"), also over one already there:
                    the app's own is free and leaves no fringe; Venice's keeps white drawn on white with no outline. */}
                {expression && (
                    <button
                        type="button"
                        className="button button-quiet"
                        aria-label={`Cut out ${label}`}
                        disabled={busy !== null}
                        onClick={() =>
                            void save('Cutting out…', () => api.cutOut(emotion, cutouts.freeCutout ? 'own' : undefined), (message) =>
                                setError(`Couldn't cut out the ${label} Expression: ${message}`),
                            )
                        }
                    >
                        {cutouts.freeCutout ? 'Cut out · free' : `Cut out · ~${usd(cutouts.veniceCutout)}`}
                    </button>
                )}
                {expression && cutouts.freeCutout && (
                    <button
                        type="button"
                        className="button button-quiet"
                        aria-label={`Cut out ${label} with Venice`}
                        disabled={busy !== null}
                        onClick={() =>
                            void save('Cutting out…', () => api.cutOut(emotion, 'venice'), (message) =>
                                setError(`Couldn't cut out the ${label} Expression: ${message}`),
                            )
                        }
                    >
                        {`Venice cut-out · ~${usd(cutouts.veniceCutout)}`}
                    </button>
                )}
                {expression && (
                    <button
                        type="button"
                        className="button button-quiet"
                        aria-label={`Upload a cut-out for ${label}`}
                        disabled={busy !== null}
                        onClick={() => cutoutInput.current?.click()}
                    >
                        Upload cut-out
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
                        warning={`Its picture is deleted, and lines that show it get ${owner.plainName}.`}
                        confirmLabel="Remove"
                        onConfirm={() => void save('Removing…', () => api.remove(emotion))}
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
            {expression && (
                <input
                    ref={cutoutInput}
                    className="visually-hidden"
                    type="file"
                    accept="image/png,image/webp"
                    aria-label={`See-through cut-out for ${label}`}
                    tabIndex={-1}
                    onChange={(event) => void uploadCutout(event)}
                />
            )}
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
                    initial={expression!.crop ?? owner.defaultCrop}
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

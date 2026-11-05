'use client';

import { ChangeEvent, KeyboardEvent, PointerEvent, useEffect, useRef, useState } from 'react';

import { useConnection } from '@/components/connection';
import { Sheet } from '@/components/sheet/sheet';
import { ApiError, apiFetch, ApiUnreachableError } from '@/lib/api';
import { focusAt, preparedForUpload } from '@/lib/cover';
import { coverGradient, coverPosition } from '@/lib/home';
import { GalleryItem, galleryPath } from '@/lib/snapshot';
import { CoverFocus, referenceImageUrl, Story, storyApi } from '@/lib/story';
import { ConfirmButton } from './fields';
import styles from './story-cover.module.css';

/** Runs a write that answers with the whole Story, after pending edits; a failure goes to `onError`. */
type Commit = (run: () => Promise<Story>, onError: (message: string) => void) => Promise<Story | undefined>;

/** How far an arrow key moves the focus point. */
const KEY_STEP = 0.05;

/**
 * The Cover at the top of the Story editor (spec: "Cover"), cropped around its focus point the
 * way a wide box crops it. A tap opens the sheet that picks, uploads or removes it. Without
 * one, the Story's own gradient shows, as on a Home card with no Snapshot.
 */
export function CoverBanner({ story, onOpen }: { story: Story; onOpen(): void }) {
    const cover = story.cover;
    return (
        <button
            type="button"
            className={styles.banner}
            style={{
                background: cover
                    ? `url("${referenceImageUrl(cover.imagePath)}") ${coverPosition(cover.focus)} / cover no-repeat`
                    : coverGradient(story.id),
            }}
            aria-label={cover ? 'Change the Cover' : 'Add a Cover'}
            onClick={onOpen}
        >
            <span className={styles.bannerChip} aria-hidden="true">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="5" width="18" height="14" rx="2" />
                    <circle cx="9" cy="10" r="1.6" />
                    <path d="M21 16l-5-5-8 8" />
                </svg>
                {cover ? 'Change cover' : 'Add a cover'}
            </span>
        </button>
    );
}

interface CoverSheetProps {
    story: Story;
    commit: Commit;
    onClose(): void;
}

/**
 * Picks the Cover: a Snapshot of the Gallery, a Character's Reference image, or a picture from
 * the phone. With a Cover, a tap on it sets the focus point the cards crop around, and it can
 * be removed, after which Home shows the newest Snapshot again.
 */
export function CoverSheet({ story, commit, onClose }: CoverSheetProps) {
    const { reportUnreachable } = useConnection();
    const [gallery, setGallery] = useState<GalleryItem[] | null>(null);
    const [galleryError, setGalleryError] = useState<string | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const fileInput = useRef<HTMLInputElement>(null);
    const cover = story.cover;
    const portraits = story.characters.filter((character) => character.referenceImagePath !== null);

    useEffect(() => {
        let live = true;
        apiFetch<{ snapshots: GalleryItem[] }>(galleryPath(story.id, null))
            .then((answer) => live && setGallery(answer.snapshots))
            .catch((caught) => {
                if (!live) return;
                if (caught instanceof ApiUnreachableError) reportUnreachable();
                else setGalleryError(caught instanceof ApiError ? caught.message : 'The Gallery could not be read.');
            });
        return () => {
            live = false;
        };
    }, [story.id, reportUnreachable]);

    /** One write at a time; `what` says what is being saved. */
    const save = async (what: string, run: () => Promise<Story>) => {
        setBusy(what);
        setError(null);
        await commit(run, (message) => setError(message));
        setBusy(null);
    };

    const upload = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        await save('Uploading…', async () => {
            const { picture, filename } = await preparedForUpload(file);
            return storyApi.uploadCover(story.id, picture, filename);
        });
    };

    return (
        <Sheet label="Cover" title="Cover" onClose={onClose}>
            <div className={styles.sheet}>
                <p className="hint">The picture on this Story&apos;s card on Home.</p>

                {cover ? (
                    <FocusPicker
                        key={cover.imagePath}
                        src={referenceImageUrl(cover.imagePath)}
                        focus={cover.focus}
                        disabled={busy !== null}
                        onPick={(focus) => void save('Saving…', () => storyApi.setCoverFocus(story.id, focus))}
                    />
                ) : (
                    <p className={styles.empty}>
                        No cover yet, so Home shows the newest Snapshot, or this Story&apos;s colours until there is one.
                    </p>
                )}

                <div className="toolbar">
                    <button type="button" className="button" disabled={busy !== null} onClick={() => fileInput.current?.click()}>
                        Upload from phone
                    </button>
                    {cover?.focus && (
                        <button
                            type="button"
                            className="button button-quiet"
                            disabled={busy !== null}
                            onClick={() => void save('Saving…', () => storyApi.clearCoverFocus(story.id))}
                        >
                            Centre it
                        </button>
                    )}
                    {cover && (
                        <ConfirmButton
                            label="Remove cover"
                            danger
                            disabled={busy !== null}
                            question="Remove the cover?"
                            warning={cover.source === 'upload' ? 'The uploaded picture is deleted.' : undefined}
                            confirmLabel="Remove"
                            onConfirm={() => void save('Removing…', () => storyApi.clearCover(story.id))}
                        />
                    )}
                </div>
                <input
                    ref={fileInput}
                    className="visually-hidden"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    aria-label="Picture for the cover"
                    tabIndex={-1}
                    onChange={(event) => void upload(event)}
                />
                <p className={busy ? styles.status : 'visually-hidden'} role="status">
                    {busy}
                </p>
                {error && (
                    <p className="field-error" role="alert">
                        Couldn&apos;t save the cover: {error}
                    </p>
                )}

                <section aria-labelledby="cover-from-gallery">
                    <h3 id="cover-from-gallery" className={styles.heading}>
                        From the Gallery
                    </h3>
                    {galleryError && (
                        <p className="field-error" role="alert">
                            {galleryError}
                        </p>
                    )}
                    {gallery === null && !galleryError && <p className="hint">Loading…</p>}
                    {gallery?.length === 0 && <p className="hint">No Snapshots yet. Take one in a Chat.</p>}
                    {gallery && gallery.length > 0 && (
                        <ul className={styles.choices}>
                            {gallery.map((snapshot, index) => (
                                <li key={snapshot.id}>
                                    <Choice
                                        label={`Snapshot ${index + 1}${snapshot.chatTitle ? ` from ${snapshot.chatTitle}` : ''}`}
                                        src={referenceImageUrl(snapshot.imagePath)}
                                        current={cover?.snapshotId === snapshot.id}
                                        disabled={busy !== null}
                                        onPick={() => void save('Saving…', () => storyApi.chooseCover(story.id, { snapshotId: snapshot.id }))}
                                    />
                                </li>
                            ))}
                        </ul>
                    )}
                </section>

                <section aria-labelledby="cover-from-characters">
                    <h3 id="cover-from-characters" className={styles.heading}>
                        Reference images
                    </h3>
                    {portraits.length === 0 ? (
                        <p className="hint">No Character has a Reference image yet.</p>
                    ) : (
                        <ul className={styles.choices}>
                            {portraits.map((character) => (
                                <li key={character.id}>
                                    <Choice
                                        label={character.name.trim() || 'Unnamed Character'}
                                        caption={character.name.trim() || 'Unnamed'}
                                        src={referenceImageUrl(character.referenceImagePath!)}
                                        current={cover?.characterId === character.id}
                                        disabled={busy !== null}
                                        onPick={() => void save('Saving…', () => storyApi.chooseCover(story.id, { characterId: character.id }))}
                                    />
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            </div>
        </Sheet>
    );
}

interface ChoiceProps {
    label: string;
    caption?: string;
    src: string;
    current: boolean;
    disabled: boolean;
    onPick(): void;
}

/** One picture that can become the Cover; the current Cover is marked and pressed. */
function Choice({ label, caption, src, current, disabled, onPick }: ChoiceProps) {
    return (
        <button
            type="button"
            className={styles.choice}
            aria-label={`Use ${label} as the cover`}
            aria-pressed={current}
            disabled={disabled}
            onClick={current ? undefined : onPick}
        >
            <img src={src} alt="" loading="lazy" />
            {current && <span className={styles.currentMark}>Cover</span>}
            {caption && <span className={styles.caption}>{caption}</span>}
        </button>
    );
}

interface FocusPickerProps {
    src: string;
    focus: CoverFocus | null;
    disabled: boolean;
    onPick(focus: CoverFocus): void;
}

/**
 * The whole Cover with its focus point: a tap or drag moves it, and so do the arrow keys. The
 * point is saved when the finger lifts. Beside it, the card and the banner as they will crop.
 */
function FocusPicker({ src, focus, disabled, onPick }: FocusPickerProps) {
    const [point, setPoint] = useState<CoverFocus>(focus ?? { x: 0.5, y: 0.5 });
    const dragging = useRef(false);
    const image = useRef<HTMLImageElement>(null);

    useEffect(() => {
        setPoint(focus ?? { x: 0.5, y: 0.5 });
    }, [focus]);

    const moveTo = (event: PointerEvent<HTMLDivElement>) => {
        const box = image.current?.getBoundingClientRect();
        if (box) setPoint(focusAt(box, event.clientX, event.clientY));
    };

    const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
        if (disabled || !event.isPrimary || event.button !== 0) return;
        dragging.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        moveTo(event);
    };

    const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
        if (!dragging.current) return;
        dragging.current = false;
        const box = image.current?.getBoundingClientRect();
        if (box) onPick(focusAt(box, event.clientX, event.clientY));
    };

    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        const step: Record<string, [number, number]> = {
            ArrowLeft: [-KEY_STEP, 0],
            ArrowRight: [KEY_STEP, 0],
            ArrowUp: [0, -KEY_STEP],
            ArrowDown: [0, KEY_STEP],
        };
        const move = step[event.key];
        if (!move || disabled) return;
        event.preventDefault();
        const clamp = (value: number) => Math.min(1, Math.max(0, Math.round(value * 1000) / 1000));
        const next = { x: clamp(point.x + move[0]), y: clamp(point.y + move[1]) };
        setPoint(next);
        onPick(next);
    };

    const position = coverPosition(point);
    const percent = (fraction: number) => Math.round(fraction * 100);
    return (
        <div className={styles.picker}>
            <div
                className={styles.focusArea}
                role="group"
                tabIndex={0}
                aria-label={`Focus point, ${percent(point.x)}% across and ${percent(point.y)}% down. Tap the picture, or use the arrow keys, to move it.`}
                aria-disabled={disabled}
                onPointerDown={onPointerDown}
                onPointerMove={(event) => dragging.current && moveTo(event)}
                onPointerUp={onPointerUp}
                onPointerCancel={() => {
                    dragging.current = false;
                }}
                onKeyDown={onKeyDown}
            >
                <img ref={image} src={src} alt="The cover" draggable={false} />
                <span
                    className={styles.dot}
                    style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
                    aria-hidden="true"
                />
            </div>
            <p className="hint">Tap the part to keep in view when a card crops it.</p>
            <div className={styles.previews} aria-hidden="true">
                <span className={styles.previewCard} style={{ background: `url("${src}") ${position} / cover no-repeat` }} />
                <span className={styles.previewWide} style={{ background: `url("${src}") ${position} / cover no-repeat` }} />
            </div>
        </div>
    );
}

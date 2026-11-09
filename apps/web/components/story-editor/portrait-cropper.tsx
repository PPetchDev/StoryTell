'use client';

import { PointerEvent, useRef, useState } from 'react';

import { DEFAULT_PORTRAIT_CROP, PortraitImage } from '@/components/portrait/portrait-image';
import { Sheet } from '@/components/sheet/sheet';
import { PortraitCrop } from '@/lib/story';

import styles from './portrait-cropper.module.css';

/** The smallest square, as a fraction of the image's width: about a face in a full-body image. */
const MIN_SIZE = 0.15;

/** Start where the Chat already shows it: the default square, kept inside this image. */
function startingCrop(heightUnits: number): PortraitCrop {
    return clampCrop(DEFAULT_PORTRAIT_CROP, heightUnits);
}

/** Keeps the square inside the image: `heightUnits` is the image's height in widths. */
export function clampCrop(crop: PortraitCrop, heightUnits: number): PortraitCrop {
    const size = Math.min(Math.max(crop.size, MIN_SIZE), 1, heightUnits);
    return {
        x: Math.min(Math.max(crop.x, 0), 1 - size),
        y: Math.min(Math.max(crop.y, 0), heightUnits - size),
        size,
    };
}

interface PortraitCropperProps {
    name: string;
    src: string;
    initial: PortraitCrop | null;
    saving: boolean;
    /** Why the last save failed, shown in the sheet. */
    error: string | null;
    onSave(crop: PortraitCrop): void;
    onClose(): void;
    /** The sheet's name, title and the picture's alt text; the Portrait's own by default. */
    sheetLabel?: string;
    title?: string;
    imageAlt?: string;
}

/**
 * Picks the Portrait: drag the square over the face, size it with the slider, and see the
 * round picture the Chat will show.
 */
export function PortraitCropper({ name, src, initial, saving, error, onSave, onClose, sheetLabel, title, imageAlt }: PortraitCropperProps) {
    const stage = useRef<HTMLDivElement>(null);
    /** The image's height in widths, once it has loaded. */
    const [heightUnits, setHeightUnits] = useState<number | null>(null);
    const [crop, setCrop] = useState<PortraitCrop | null>(initial);
    const drag = useRef<{ pointer: number; startX: number; startY: number; from: PortraitCrop } | null>(null);

    const shown = heightUnits === null ? null : clampCrop(crop ?? startingCrop(heightUnits), heightUnits);

    const onLoad = (image: HTMLImageElement) => {
        const units = image.naturalHeight / image.naturalWidth;
        setHeightUnits(units);
        setCrop((current) => clampCrop(current ?? startingCrop(units), units));
    };

    const begin = (event: PointerEvent<HTMLDivElement>) => {
        if (!shown) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { pointer: event.pointerId, startX: event.clientX, startY: event.clientY, from: shown };
    };
    const move = (event: PointerEvent<HTMLDivElement>) => {
        const current = drag.current;
        const width = stage.current?.clientWidth;
        if (!current || current.pointer !== event.pointerId || !width || heightUnits === null) return;
        // Pixels on screen to fractions of the image's width.
        const dx = (event.clientX - current.startX) / width;
        const dy = (event.clientY - current.startY) / width;
        setCrop(clampCrop({ ...current.from, x: current.from.x + dx, y: current.from.y + dy }, heightUnits));
    };
    const end = () => {
        drag.current = null;
    };

    const resize = (size: number) => {
        if (!shown || heightUnits === null) return;
        // Grow or shrink about the square's middle.
        const middleX = shown.x + shown.size / 2;
        const middleY = shown.y + shown.size / 2;
        setCrop(clampCrop({ x: middleX - size / 2, y: middleY - size / 2, size }, heightUnits));
    };

    return (
        <Sheet label={sheetLabel ?? `Chat picture of ${name}`} title={title ?? 'Chat picture'} onClose={onClose}>
            <p className="hint">Drag the square over {name}&apos;s face. The slider zooms.</p>
            <div className={styles.stage} ref={stage}>
                {/* eslint-disable-next-line @next/next/no-img-element -- served by the API from the image folder */}
                <img
                    className={styles.image}
                    src={src}
                    alt={imageAlt ?? `Reference image of ${name}`}
                    draggable={false}
                    onLoad={(event) => onLoad(event.currentTarget)}
                />
                {shown && heightUnits !== null && (
                    <div
                        className={styles.square}
                        role="slider"
                        aria-label="Face square position"
                        aria-valuetext={`${Math.round(shown.x * 100)}% from the left, ${Math.round((shown.y / heightUnits) * 100)}% from the top`}
                        tabIndex={0}
                        style={{
                            left: `${shown.x * 100}%`,
                            top: `${(shown.y / heightUnits) * 100}%`,
                            width: `${shown.size * 100}%`,
                            height: `${(shown.size / heightUnits) * 100}%`,
                        }}
                        onPointerDown={begin}
                        onPointerMove={move}
                        onPointerUp={end}
                        onPointerCancel={end}
                        onKeyDown={(event) => {
                            const step = event.shiftKey ? 0.05 : 0.01;
                            const by: Record<string, [number, number]> = {
                                ArrowLeft: [-step, 0],
                                ArrowRight: [step, 0],
                                ArrowUp: [0, -step],
                                ArrowDown: [0, step],
                            };
                            const delta = by[event.key];
                            if (!delta) return;
                            event.preventDefault();
                            setCrop(clampCrop({ ...shown, x: shown.x + delta[0], y: shown.y + delta[1] }, heightUnits));
                        }}
                    />
                )}
            </div>
            {shown && heightUnits !== null && (
                <div className={styles.controls}>
                    <label className={styles.zoom}>
                        <span>Zoom</span>
                        <input
                            type="range"
                            aria-label="Zoom"
                            min={MIN_SIZE}
                            max={Math.min(1, heightUnits)}
                            step={0.01}
                            // Wider square is less zoom, so the slider runs the other way.
                            value={Math.min(1, heightUnits) + MIN_SIZE - shown.size}
                            onChange={(event) => resize(Math.min(1, heightUnits) + MIN_SIZE - Number(event.target.value))}
                        />
                    </label>
                    <div className={styles.preview}>
                        <PortraitImage portrait={{ src, crop: shown }} className={styles.previewImage} />
                        <span className="hint">In the Chat</span>
                    </div>
                </div>
            )}
            {error && (
                <p className="field-error" role="alert">
                    Couldn&apos;t save the chat picture: {error}
                </p>
            )}
            <button type="button" className="button" disabled={!shown || saving} onClick={() => shown && onSave(shown)}>
                {saving ? 'Saving…' : 'Use this picture'}
            </button>
        </Sheet>
    );
}

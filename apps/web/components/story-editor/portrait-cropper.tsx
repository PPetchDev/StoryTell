'use client';

import { PointerEvent, useRef, useState } from 'react';

import { DEFAULT_PORTRAIT_CROP, PortraitImage } from '@/components/portrait/portrait-image';
import { Sheet } from '@/components/sheet/sheet';
import { PortraitCrop } from '@/lib/story';

/** The smallest square, as a fraction of the image's width: about a face in a full-body image. */
const MIN_SIZE = 0.15;

/** Start where the Chat already shows it: the default square, kept inside this image. */
function startingCrop(heightUnits: number): PortraitCrop {
    return clampCrop(DEFAULT_PORTRAIT_CROP, heightUnits);
}

/** How far along its track a slider is, 0 to 100: a square that fills the way has nowhere to go, so 0. */
function percentOf(value: number, most: number): number {
    return most <= 0 ? 0 : Math.round((value / most) * 100);
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
 * Picks the Portrait: drag the square over the face, or tap where the face is, as on the Cover's
 * picker (audit L32); size it with the slider, and see the round picture the Chat will show.
 * Only the square holds a finger's drag; the rest of the picture scrolls the sheet (M45).
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
    /** A tap on the picture, off the square: the square centres there. */
    const jump = (event: PointerEvent<HTMLDivElement>) => {
        const box = stage.current?.getBoundingClientRect();
        if (!shown || heightUnits === null || !box || event.target !== event.currentTarget.querySelector('img')) return;
        const x = (event.clientX - box.left) / box.width - shown.size / 2;
        const y = (event.clientY - box.top) / box.width - shown.size / 2;
        setCrop(clampCrop({ ...shown, x, y }, heightUnits));
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
            <p className="hint">Drag the square over {name}&apos;s face, or tap the face. The sliders move it and zoom.</p>
            <div className="relative mx-auto mt-2 mb-3 w-[min(100%,22rem)] overflow-hidden rounded-sm select-none" ref={stage} onPointerDown={jump}>
                {/* eslint-disable-next-line @next/next/no-img-element -- served by the API from the image folder */}
                <img
                    className="block h-auto w-full rounded-sm"
                    src={src}
                    alt={imageAlt ?? `Reference image of ${name}`}
                    draggable={false}
                    onLoad={(event) => onLoad(event.currentTarget)}
                />
                {shown && heightUnits !== null && (
                    <div
                        className={[
                            'absolute cursor-grab touch-none rounded-full border-2 border-accent-text active:cursor-grabbing',
                            // Everything outside the circle is dimmed with the scrim; the frame is white in both themes.
                            'shadow-[0_0_0_100vmax_var(--scrim)]',
                        ].join(' ')}
                        // A finger's way to move it; the Across and Down sliders below are the keyboard's
                        // and a screen reader's, each one direction with its own value (audit M44).
                        aria-hidden="true"
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
                    />
                )}
            </div>
            {shown && heightUnits !== null && (
                <div className="mb-3 flex items-center gap-4">
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <label className="flex flex-col gap-1 text-md text-muted">
                        <span>Across</span>
                        <input
                            type="range"
                            className="min-h-11 w-full accent-accent"
                            min={0}
                            max={1 - shown.size}
                            step={0.01}
                            value={shown.x}
                            aria-valuetext={`${percentOf(shown.x, 1 - shown.size)}% across`}
                            onChange={(event) => setCrop(clampCrop({ ...shown, x: Number(event.target.value) }, heightUnits))}
                        />
                    </label>
                    <label className="flex flex-col gap-1 text-md text-muted">
                        <span>Down</span>
                        <input
                            type="range"
                            className="min-h-11 w-full accent-accent"
                            min={0}
                            max={heightUnits - shown.size}
                            step={0.01}
                            value={shown.y}
                            aria-valuetext={`${percentOf(shown.y, heightUnits - shown.size)}% down`}
                            onChange={(event) => setCrop(clampCrop({ ...shown, y: Number(event.target.value) }, heightUnits))}
                        />
                    </label>
                    <label className="flex flex-col gap-1 text-md text-muted">
                        <span>Zoom</span>
                        <input
                            type="range"
                            className="min-h-11 w-full accent-accent"
                            min={MIN_SIZE}
                            max={Math.min(1, heightUnits)}
                            step={0.01}
                            // Wider square is less zoom, so the slider runs the other way.
                            value={Math.min(1, heightUnits) + MIN_SIZE - shown.size}
                            onChange={(event) => resize(Math.min(1, heightUnits) + MIN_SIZE - Number(event.target.value))}
                        />
                    </label>
                    </div>
                    <div className="flex flex-none flex-col items-center gap-1">
                        <PortraitImage portrait={{ src, crop: shown }} className="size-14" />
                        <span className="hint">In the Chat</span>
                    </div>
                </div>
            )}
            {error && (
                <p className="field-error" role="alert">
                    Couldn&apos;t save the chat picture: {error}
                </p>
            )}
            <button type="button" className="button w-full" disabled={!shown || saving} aria-busy={saving || undefined} onClick={() => shown && onSave(shown)}>
                {saving ? 'Saving…' : 'Use this picture'}
            </button>
        </Sheet>
    );
}

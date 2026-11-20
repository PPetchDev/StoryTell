import { CSSProperties } from 'react';

import type { Portrait } from '@/lib/character-colour';


/**
 * The square shown until the author picks one: near the top middle, where a full-body
 * Reference image (as the Reference image prompt draws them) keeps the face.
 */
export const DEFAULT_PORTRAIT_CROP = { x: 0.3, y: 0.03, size: 0.4 } as const;

/**
 * A Character's Portrait in a round frame (CONTEXT: "Portrait"): the chosen square of their
 * Reference image, or, with none chosen, DEFAULT_PORTRAIT_CROP. The frame's size comes from
 * the parent through `className`.
 */
export function PortraitImage({
    portrait,
    className,
    alt,
    imageData,
}: {
    portrait: Portrait;
    className?: string;
    /** Names the picture for assistive tech; without it the picture is hidden from them. */
    alt?: string;
    /** A data attribute for the image itself, which tests read (`data-persona-picture`). */
    imageData?: string;
}) {
    const { src } = portrait;
    const crop = portrait.crop ?? DEFAULT_PORTRAIT_CROP;
    // The crop is in fractions of the image's width and the frame is square, so the image is
    // 1/size frames wide, and its offsets are x/size and y/size frames (top % reads the frame's height).
    const placed: CSSProperties = {
        width: `${100 / crop.size}%`,
        left: `${(-crop.x / crop.size) * 100}%`,
        top: `${(-crop.y / crop.size) * 100}%`,
    };
    return (
        <span className={['relative block overflow-hidden rounded-full bg-surface-raised', className].filter(Boolean).join(' ')} aria-hidden={alt ? undefined : true}>
            {/* eslint-disable-next-line @next/next/no-img-element -- served by the API from the image folder */}
            {/* The whole image, scaled and shifted so the square fills the frame. */}
            <img className="absolute h-auto max-w-none" src={src} alt={alt ?? ''} style={placed} draggable={false} {...(imageData ? { [`data-${imageData}`]: '' } : {})} />
        </span>
    );
}

'use client';

import { ReactNode, useState } from 'react';

import { coverGradient, coverPosition } from '@/lib/home';
import { StorySummary } from '@/lib/story';

interface CoverPictureProps {
    story: Pick<StorySummary, 'id' | 'coverImagePath' | 'coverFocus'>;
    /** The Story sheet's banner: the 640px thumbnail always. */
    large?: boolean;
    /** Size and shape: the box the picture fills. */
    className: string;
    /** Laid over the picture (the Draft badge). */
    children?: ReactNode;
}

/**
 * A Story's Cover on Home (audit H34): the Story's gradient, with the WebP thumbnail of the chosen
 * picture over it as a lazy `<img>`, so a card has its colours at once, a card below the fold
 * loads its picture only when it comes near, and a picture that fails leaves the gradient.
 * 320px wide, 640 on a dense screen; `large` takes 640 always. Decorative: the card says the title.
 */
export function CoverPicture({ story, large = false, className, children }: CoverPictureProps) {
    const base = story.coverImagePath ? `/api/images/${story.coverImagePath}` : null;
    // The path that failed to load, so a new Cover gets its own try.
    const [failed, setFailed] = useState<string | null>(null);
    return (
        <span className={`relative block overflow-hidden ${className}`} style={{ background: coverGradient(story.id) }}>
            {base && failed !== base && (
                // eslint-disable-next-line @next/next/no-img-element -- served by the API from the image folder, already a thumbnail
                <img
                    className="absolute inset-0 size-full object-cover"
                    src={`${base}?w=${large ? 640 : 320}`}
                    srcSet={large ? undefined : `${base}?w=320 1x, ${base}?w=640 2x`}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    style={{ objectPosition: coverPosition(story.coverFocus) }}
                    onError={() => setFailed(base)}
                />
            )}
            {children}
        </span>
    );
}

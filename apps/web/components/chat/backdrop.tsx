import type { BackdropPicture } from '@/lib/backdrop';

/**
 * The Backdrop's layer: fixed behind the Chat area, the whole viewport on a phone and the viewport
 * beside the side rail on a PC, under everything (`z-below`). While it shows, the body goes
 * see-through (a body:has() rule, set for as long as this layer is in it), so the
 * root's own page colour is what is under the picture. The page colour lies over the picture
 * (`after:`), per theme.
 */
const LAYER = [
    'pointer-events-none fixed top-0 right-0 bottom-0 left-(--rail-width) z-below overflow-hidden',
    'after:absolute after:inset-0 after:bg-backdrop-dim',
    '[body:has(&)]:bg-transparent',
].join(' ');

/**
 * The Backdrop (.scratch/chat-looks/spec.md, "Backdrop"): one fixed picture behind the Chat area,
 * blurred and dimmed with the page colour so every line stays readable. Decoration only.
 */
export function ChatBackdrop({ picture }: { picture: BackdropPicture | null }) {
    if (!picture) return null;
    return (
        <div className={LAYER} data-backdrop="" aria-hidden="true">
            {/* A static filter (no per-frame work); scaled up so the blur's soft edge falls outside the layer. */}
            {/* eslint-disable-next-line @next/next/no-img-element -- served by the API from the image folder */}
            <img
                className="block size-full scale-[1.04] object-cover blur-[3px]"
                src={picture.src}
                alt=""
                style={{ objectPosition: picture.position }}
                draggable={false}
            />
        </div>
    );
}

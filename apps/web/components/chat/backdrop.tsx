import type { BackdropPicture } from '@/lib/backdrop';

import styles from './backdrop.module.css';

/**
 * The Backdrop (.scratch/chat-looks/spec.md, "Backdrop"): one fixed picture behind the Chat area,
 * blurred and dimmed with the page colour so every line stays readable. Decoration only.
 */
export function ChatBackdrop({ picture }: { picture: BackdropPicture | null }) {
    if (!picture) return null;
    return (
        <div className={styles.backdrop} data-backdrop="" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element -- served by the API from the image folder */}
            <img className={styles.picture} src={picture.src} alt="" style={{ objectPosition: picture.position }} draggable={false} />
        </div>
    );
}

import { coverPosition } from './home';
import { Snapshot, snapshotImageUrl } from './snapshot';
import { Backdrop, CoverFocus, referenceImageUrl, StoryCover } from './story';

/** The picture behind a Chat's Messages, and the point of it kept in view. */
export interface BackdropPicture {
    src: string;
    /** A CSS object-position: the Cover's focus point, else the centre. */
    position: string;
}

/**
 * Which picture sits behind a Chat (.scratch/chat-looks/spec.md, "Backdrop"), from what the Chat
 * screen already loads:
 * - `none`: no picture;
 * - `cover`: the Story's Cover, at its focus point, else none;
 * - `snapshot`: the newest Snapshot still in this Chat's thread (it is under one of `messages`), else
 *   the Cover, else none.
 */
export function backdropOf(
    story: { backdrop: Backdrop; cover: StoryCover | null },
    snapshots: readonly Snapshot[],
    messages: readonly { id: number }[],
): BackdropPicture | null {
    const cover = story.cover ? picture(referenceImageUrl(story.cover.imagePath), story.cover.focus) : null;
    if (story.backdrop === 'none') return null;
    if (story.backdrop === 'cover') return cover;
    const inThread = new Set(messages.map((message) => message.id));
    const newest = snapshots
        .filter((snapshot) => snapshot.messageId !== null && inThread.has(snapshot.messageId))
        .reduce<Snapshot | null>((latest, snapshot) => (latest === null || snapshot.id > latest.id ? snapshot : latest), null);
    return newest ? picture(snapshotImageUrl(newest), null) : cover;
}

function picture(src: string, focus: CoverFocus | null): BackdropPicture {
    return { src, position: coverPosition(focus) };
}

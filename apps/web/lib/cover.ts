import { CoverFocus } from './story';

/** The longest side an uploaded Cover keeps: as large as a Reference image, far smaller than a phone photo. */
const MAX_SIDE = 2048;

/**
 * A picture from the phone made ready to upload as a Cover: turned upright, cut down to
 * MAX_SIDE, and re-encoded as JPEG, which also drops its metadata (where the photo was taken).
 * A picture the browser can't decode is sent as it is, and the API says whether it can use it.
 */
export async function preparedForUpload(file: File): Promise<{ picture: Blob; filename: string }> {
    try {
        const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
        const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const context = canvas.getContext('2d');
        if (!context) throw new Error('No 2D canvas');
        // JPEG has no transparency: a see-through PNG gets the dark theme's background behind it.
        context.fillStyle = '#16131f';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close();
        const picture = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
        if (picture) return { picture, filename: 'cover.jpg' };
    } catch {
        // Fall through: the original file.
    }
    return { picture: file, filename: file.name };
}

/** The focus point a tap at (clientX, clientY) on the picture's box means, kept inside the picture. */
export function focusAt(box: DOMRect, clientX: number, clientY: number): CoverFocus {
    const clamp = (value: number) => Math.min(1, Math.max(0, Math.round(value * 1000) / 1000));
    return { x: clamp((clientX - box.left) / box.width), y: clamp((clientY - box.top) / box.height) };
}

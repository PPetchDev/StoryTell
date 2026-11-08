import { initialOf } from '@/components/portrait/character-portrait';

import { apiFetch, ApiError, ApiUnreachableError } from './api';
import { Character, referenceImageUrl, Story } from './story';

/** What Home's file picker offers: card sites give PNGs and JSON files. */
export const CARD_FILE_TYPES = '.png,.json,image/png,application/json';

/** The URL flag the editor reads once after an import, to show its one-time notice. */
export const FROM_CARD_PARAM = 'fromCard';

/** The Story assistant message the import notice's Tidy button fills in, unsent (spec: "After import"). */
export function tidyMessage(characterName: string): string {
    return (
        `Split ${characterName}'s Background into Appearance, Personality, Voice and Background, keeping every detail, ` +
        'and write a short description of my Role.'
    );
}

/** What an import of a card would make (mirrors CardPreviewResponseBodyDTO). */
export interface CardPreview {
    format: 'v1' | 'v2' | 'v3';
    title: string;
    characterName: string;
    creator: string;
    creatorNotes: string;
    /** The first message, then the alternate greetings, each cut short, macros as written. */
    greetings: string[];
    loreEntries: number;
    hasPicture: boolean;
    /** From a Storytell card's own block: fills the name field. */
    roleName: string | null;
    leftOut: string[];
}

function cardForm(card: File): FormData {
    const form = new FormData();
    form.append('card', card, card.name);
    return form;
}

/** Character cards (spec: "Character cards"): no AI call, no credit. */
export const cardApi = {
    /** Reads the card and says what an import would make; writes nothing. */
    preview: (card: File) => apiFetch<CardPreview>('/stories/from-card/preview', { method: 'POST', body: cardForm(card) }),
    /** Makes a new Story from the card by the fixed mapping; answers it like every Story write. */
    importCard: (card: File, roleName: string, greeting = 0) => {
        const form = cardForm(card);
        form.append('roleName', roleName);
        form.append('greeting', String(greeting));
        return apiFetch<Story>('/stories/from-card', { method: 'POST', body: form });
    },
};

/** The stand-in picture's size when a Character has no Reference image: a card's usual 2:3. */
export const STAND_IN_SIZE = { width: 512, height: 768 };

function canvasPng(canvas: HTMLCanvasElement): Promise<Blob> {
    return new Promise((resolve, reject) =>
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't draw the card's picture."))), 'image/png'),
    );
}

/**
 * The card's picture as a PNG, drawn in the browser (spec: "Why the picture comes from the
 * browser"): the Reference image at its own size, or the Character's initial on their
 * Character colour, as the Portrait stand-in looks.
 */
export async function drawCardPicture(character: Pick<Character, 'name' | 'referenceImagePath'>, colour: string): Promise<Blob> {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error("Couldn't draw the card's picture.");
    if (character.referenceImagePath) {
        let response: Response;
        try {
            response = await fetch(referenceImageUrl(character.referenceImagePath), { cache: 'no-store' });
        } catch {
            throw new ApiUnreachableError();
        }
        if (!response.ok) throw new Error("Couldn't load the Reference image.");
        const bitmap = await createImageBitmap(await response.blob());
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        context.drawImage(bitmap, 0, 0);
        bitmap.close();
    } else {
        canvas.width = STAND_IN_SIZE.width;
        canvas.height = STAND_IN_SIZE.height;
        context.fillStyle = colour;
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = '#16131f';
        context.font = `700 ${Math.round(canvas.width * 0.55)}px system-ui, sans-serif`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(initialOf(character.name), canvas.width / 2, canvas.height / 2);
    }
    return canvasPng(canvas);
}

/** The file name from a Content-Disposition header: the UTF-8 one when given, else the plain one. */
function fileNameOf(disposition: string | null, fallback: string): string {
    const utf8 = disposition ? /filename\*=UTF-8''([^;]+)/i.exec(disposition) : null;
    if (utf8) {
        try {
            return decodeURIComponent(utf8[1]);
        } catch {
            // Fall through to the plain name.
        }
    }
    const plain = disposition ? /filename="([^"]+)"/i.exec(disposition) : null;
    return plain ? plain[1] : fallback;
}

/** The picture with the Character's card written into it, named after them. */
export async function exportCard(storyId: number, characterId: number, picture: Blob): Promise<File> {
    const form = new FormData();
    form.append('image', picture, 'card.png');
    let response: Response;
    try {
        response = await fetch(`/api/stories/${storyId}/characters/${characterId}/card`, { method: 'POST', body: form, cache: 'no-store' });
    } catch {
        throw new ApiUnreachableError();
    }
    if (!response.ok) {
        const body = (await response.json().catch(() => undefined)) as { error?: { code: string; message: string } } | undefined;
        if (body?.error?.code) throw new ApiError(response.status, body.error.code, body.error.message);
        throw new ApiUnreachableError();
    }
    const name = fileNameOf(response.headers.get('Content-Disposition'), 'character.png');
    return new File([await response.blob()], name, { type: 'image/png' });
}

/** Offers the file through the share sheet on a phone that can share files, else downloads it. */
export async function shareOrDownload(file: File): Promise<void> {
    const phone = window.matchMedia('(pointer: coarse)').matches;
    if (phone && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
        try {
            await navigator.share({ files: [file], title: file.name });
            return;
        } catch (error) {
            // Closing the sheet is a choice, not a failure; anything else falls back to a download.
            if (error instanceof DOMException && error.name === 'AbortError') return;
        }
    }
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

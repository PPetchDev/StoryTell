import { EMOTION_LABEL, Emotion } from '@/lib/expressions';

/**
 * The tiles of one picture per emotion: a Character's, the Role's or a Persona's Expressions in the
 * editor, and the face picker in the Chat. Three to a row on a phone, so every label is whole at
 * 360px; one that still does not fit (at 320px) breaks at a soft hyphen rather than being cut short
 * (docs/ui-audit-2026-11-21.md, H2). Not every browser hyphenates by itself: one without a
 * dictionary broke "Embarrass / ed".
 */
export const EMOTION_GRID = 'grid-cols-3 min-[400px]:grid-cols-4 sm:grid-cols-8';

export const TILE_LABEL = 'max-w-full text-center leading-tight hyphens-auto [overflow-wrap:break-word]';

/** A soft hyphen: shown only where the line breaks at it. */
const SHY = String.fromCharCode(0xad);

/** Where a long label may break. */
const BREAKS: Partial<Record<Emotion, string>> = {
    embarrassment: `Embar${SHY}rassed`,
    surprise: `Sur${SHY}prised`,
    determined: `Deter${SHY}mined`,
    flustered: `Flus${SHY}tered`,
    afterglow: `After${SHY}glow`,
};

/** A tile's label, to show; its button is named with EMOTION_LABEL. */
export function tileLabel(emotion: Emotion): string {
    return BREAKS[emotion] ?? EMOTION_LABEL[emotion];
}

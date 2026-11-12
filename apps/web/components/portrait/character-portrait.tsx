import type { Portrait } from '@/lib/character-colour';

import { PortraitImage } from './portrait-image';

interface CharacterPortraitProps {
    name: string;
    /** The Character colour, behind the initial when there is no Portrait. */
    colour: string;
    portrait?: Portrait;
    /** White initial, for a dark fill such as the user's accent; the Character colours take a dark one. */
    light?: boolean;
    /** Sets the size; the frame is round either way. */
    className?: string;
}

/**
 * A Character's Portrait in a round frame (CONTEXT.md: "Portrait"): the chosen square of their
 * Reference image when they have one, else their initial on their Character colour. Beside Chat
 * lines, on the Dashboard and in the Story editor. Decorative: the name is always written beside it.
 */
export function CharacterPortrait({ name, colour, portrait, light = false, className }: CharacterPortraitProps) {
    if (portrait) return <PortraitImage portrait={portrait} className={className} />;
    return (
        <span
            className={['grid place-items-center rounded-full leading-none font-bold', light ? 'text-accent-text' : 'text-on-character', className]
                .filter(Boolean)
                .join(' ')}
            style={{ background: colour }}
            aria-hidden="true"
        >
            {initialOf(name)}
        </span>
    );
}

/** The first letter of a name, as the picture of someone without one. */
export function initialOf(name: string): string {
    return Array.from(name.trim())[0]?.toUpperCase() ?? '?';
}

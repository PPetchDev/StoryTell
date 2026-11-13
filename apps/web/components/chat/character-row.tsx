'use client';

import { RefObject, useEffect, useRef, useState } from 'react';

import { CharacterPortrait } from '@/components/portrait/character-portrait';
import { Cast, characterColour, Portraits } from '@/lib/character-colour';

/**
 * A chip: 44px to tap with 8px between (audit M34), its edge 3:1 (H14). Nudged, it takes the accent
 * edge and tint while its name stays the text colour (H16: accent on the tint read 4.18:1). The
 * ring is drawn inside, since the row scrolls and would clip one outside.
 */
const CHIP = [
    'bare-button inline-flex min-h-11 shrink-0 items-center gap-1.5',
    'rounded-full border border-field-line bg-surface py-1',
    'text-sm font-semibold',
    'cursor-pointer press focus-ring-inset',
    'aria-pressed:border-accent aria-pressed:bg-accent-soft',
    'disabled:cursor-not-allowed disabled:text-faint',
].join(' ');

/**
 * Which ends of the row hide chips (docs/ui-audit-2026-11-13.md, M4: a cut chip at the edge gave no
 * sign the row scrolls). Each hidden end fades out over 40px; the fade goes once that end is reached.
 */
const FADES = {
    none: '',
    end: '[mask-image:linear-gradient(to_right,#000_calc(100%-2.5rem),transparent)]',
    start: '[mask-image:linear-gradient(to_left,#000_calc(100%-2.5rem),transparent)]',
    both: '[mask-image:linear-gradient(to_right,transparent,#000_2.5rem,#000_calc(100%-2.5rem),transparent)]',
} as const;

type Fade = keyof typeof FADES;

/** Reads which ends of the row have more to scroll to, again on every scroll and resize. */
function useScrollFade(): [RefObject<HTMLDivElement | null>, Fade] {
    const ref = useRef<HTMLDivElement>(null);
    const [fade, setFade] = useState<Fade>('none');
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const read = () => {
            const before = el.scrollLeft > 1;
            const after = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
            setFade(before && after ? 'both' : before ? 'start' : after ? 'end' : 'none');
        };
        read();
        el.addEventListener('scroll', read, { passive: true });
        const resized = new ResizeObserver(read);
        resized.observe(el);
        for (const child of el.children) resized.observe(child);
        return () => {
            el.removeEventListener('scroll', read);
            resized.disconnect();
        };
    });
    return [ref, fade];
}

interface CharacterRowProps {
    characters: readonly { id: number; name: string }[];
    cast: Cast;
    portraits: Portraits;
    /** The ids sitting out of this Chat: they get no chip. */
    sittingOut: readonly number[];
    /** The Character nudged for the next turn, or null. */
    nudge: number | null;
    /** A turn or a write is in flight. */
    disabled: boolean;
    onNudge(characterId: number | null): void;
    /** "Who's here": the sheet from the Chat menu. */
    onWhosHere(): void;
}

/**
 * The composer's second band (.scratch/speaker-controls/spec.md, "The Character row"): one chip per
 * Character not sitting out, tapped to nudge them in the next turn (one at a time, a second tap
 * takes it back), then "Who's here". Shown only with two or more Characters; it scrolls sideways
 * when it overflows, and fades at an end that hides more.
 */
export function CharacterRow({ characters, cast, portraits, sittingOut, nudge, disabled, onNudge, onWhosHere }: CharacterRowProps) {
    const [scroller, fade] = useScrollFade();
    if (characters.length < 2) return null;
    const out = sittingOut.length;
    return (
        <div
            ref={scroller}
            className={`flex min-w-0 gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${FADES[fade]}`}
            role="group"
            aria-label="Nudge a Character"
            data-fade={fade}
        >
            {characters
                .filter((character) => !sittingOut.includes(character.id))
                .map((character) => {
                    const pressed = nudge === character.id;
                    return (
                        <button
                            key={character.id}
                            type="button"
                            className={`${CHIP} pr-3 pl-1 text-text`}
                            aria-pressed={pressed}
                            title={pressed ? `Take back the nudge on ${character.name}` : `Nudge ${character.name} to speak next`}
                            disabled={disabled}
                            onClick={() => onNudge(pressed ? null : character.id)}
                        >
                            <CharacterPortrait
                                name={character.name}
                                colour={characterColour(character.id, cast)}
                                portrait={portraits[character.id]}
                                className="size-7 rounded-full object-cover text-xs"
                            />
                            <span>{character.name}</span>
                        </button>
                    );
                })}
            <button type="button" className={`${CHIP} px-3 text-muted`} disabled={disabled} onClick={onWhosHere}>
                {out > 0 ? `${out} sitting out` : "Who's here"}
            </button>
        </div>
    );
}

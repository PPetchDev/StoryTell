'use client';

import { CharacterPortrait } from '@/components/portrait/character-portrait';
import { Cast, characterColour, Portraits } from '@/lib/character-colour';

import styles from './character-row.module.css';

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
 * when it overflows.
 */
export function CharacterRow({ characters, cast, portraits, sittingOut, nudge, disabled, onNudge, onWhosHere }: CharacterRowProps) {
    if (characters.length < 2) return null;
    const out = sittingOut.length;
    return (
        <div className={styles.row} role="group" aria-label="Nudge a Character">
            {characters
                .filter((character) => !sittingOut.includes(character.id))
                .map((character) => {
                    const pressed = nudge === character.id;
                    return (
                        <button
                            key={character.id}
                            type="button"
                            className={styles.chip}
                            aria-pressed={pressed}
                            title={pressed ? `Take back the nudge on ${character.name}` : `Nudge ${character.name} to speak next`}
                            disabled={disabled}
                            onClick={() => onNudge(pressed ? null : character.id)}
                        >
                            <CharacterPortrait
                                name={character.name}
                                colour={characterColour(character.id, cast)}
                                portrait={portraits[character.id]}
                                className={styles.portrait}
                            />
                            <span>{character.name}</span>
                        </button>
                    );
                })}
            <button type="button" className={`${styles.chip} ${styles.who}`} disabled={disabled} onClick={onWhosHere}>
                {out > 0 ? `${out} sitting out` : "Who's here"}
            </button>
        </div>
    );
}

'use client';

import { CSSProperties, createContext, ReactNode, useCallback, useContext, useMemo, useState } from 'react';

import { PortraitImage } from '@/components/portrait/portrait-image';
import { Sheet } from '@/components/sheet/sheet';
import { characterColour } from '@/lib/character-colour';
import { EMOTION_LABEL } from '@/lib/expressions';
import { Character, referenceImageUrl } from '@/lib/story';

import styles from './character-profile.module.css';

/** Opens the profile of a Character in the cast; null where no profiles are on offer. */
type OpenProfile = (characterId: number) => void;

const ProfileContext = createContext<{ open: OpenProfile; has(characterId: number): boolean; character(characterId: number): Character | undefined } | null>(
    null,
);

/**
 * The opener of a Character's profile, for a tap on their Portrait in a Chat; null outside a
 * Chat (as in the Opening preview) and for a speaker with no Character in the cast.
 */
export function useCharacterProfile(characterId: number | null): (() => void) | null {
    const profiles = useContext(ProfileContext);
    if (!profiles || characterId === null || !profiles.has(characterId)) return null;
    return () => profiles.open(characterId);
}

/**
 * A Character of the cast, for the picture beside their lines (lib/expressions.ts, `linePicture`);
 * undefined outside a Chat and for a speaker with no Character in the cast.
 */
export function useCastCharacter(characterId: number | null): Character | undefined {
    const profiles = useContext(ProfileContext);
    return profiles && characterId !== null ? profiles.character(characterId) : undefined;
}

/**
 * Lets a tap on a Character's Portrait open their profile over the Chat: their Reference image
 * in full, their Expressions under it, name, Appearance, Personality, Voice and Background. Secrets and Arc directions stay
 * hidden, since they would give the story away.
 */
export function CharacterProfiles({ characters, children }: { characters: readonly Character[]; children: ReactNode }) {
    const [openId, setOpenId] = useState<number | null>(null);
    const has = useCallback((characterId: number) => characters.some((character) => character.id === characterId), [characters]);
    const find = useCallback((characterId: number) => characters.find((character) => character.id === characterId), [characters]);
    const value = useMemo(() => ({ open: setOpenId, has, character: find }), [has, find]);
    const character = characters.find((candidate) => candidate.id === openId);
    const close = useCallback(() => setOpenId(null), []);

    return (
        <ProfileContext.Provider value={value}>
            {children}
            {character && (
                <CharacterProfileSheet
                    character={character}
                    colour={characterColour(character.id, characters.map((member) => member.id))}
                    onClose={close}
                />
            )}
        </ProfileContext.Provider>
    );
}

const SECTIONS = [
    ['Appearance', 'appearance'],
    ['Personality', 'personality'],
    ['Voice', 'voice'],
    ['Background', 'background'],
] as const satisfies readonly (readonly [string, keyof Character])[];

function CharacterProfileSheet({ character, colour, onClose }: { character: Character; colour: string; onClose(): void }) {
    const name = character.name.trim() || 'Unnamed';
    const sections = SECTIONS.filter(([, field]) => character[field].trim() !== '');
    return (
        <Sheet label={name} onClose={onClose}>
            <div className={styles.profile} style={{ '--speaker-colour': colour } as CSSProperties}>
                {character.referenceImagePath ? (
                    // eslint-disable-next-line @next/next/no-img-element -- served by the API from the image folder
                    <img
                        className={styles.reference}
                        src={referenceImageUrl(character.referenceImagePath)}
                        alt={`Reference image of ${name}`}
                        draggable={false}
                    />
                ) : (
                    <span className={styles.initial} aria-hidden="true">
                        {name.charAt(0).toUpperCase()}
                    </span>
                )}
                {character.expressions.length > 0 && (
                    <ul className={styles.expressions} aria-label="Expressions">
                        {character.expressions.map((expression) => (
                            <li key={expression.emotion} className={styles.expression}>
                                <PortraitImage
                                    portrait={{ src: referenceImageUrl(expression.imagePath), crop: expression.crop ?? character.portraitCrop }}
                                    className={styles.expressionPicture}
                                />
                                <span>{EMOTION_LABEL[expression.emotion]}</span>
                            </li>
                        ))}
                    </ul>
                )}
                <h2 className={styles.name}>{name}</h2>
                {sections.map(([label, field]) => (
                    <section key={field} className={styles.section}>
                        <h3 className={styles.label}>{label}</h3>
                        <p className={styles.text}>{character[field]}</p>
                    </section>
                ))}
            </div>
        </Sheet>
    );
}

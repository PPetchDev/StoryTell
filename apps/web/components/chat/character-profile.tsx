'use client';

import { CSSProperties, createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { DiaryChat, DiarySection } from '@/components/chat/diary-section';
import { PortraitImage } from '@/components/portrait/portrait-image';
import { Sheet } from '@/components/sheet/sheet';
import { characterColour } from '@/lib/character-colour';
import { EMOTION_LABEL } from '@/lib/expressions';
import { Character, referenceImageUrl } from '@/lib/story';


/** Opens the profile of a Character in the cast; null where no profiles are on offer. */
type OpenProfile = (characterId: number) => void;

/** What the Characters are wearing now in the Chat on screen, by Character id (CONTEXT.md, "Outfit"). */
type Outfits = Readonly<Record<number, string>>;

const ProfileContext = createContext<{
    open: OpenProfile;
    has(characterId: number): boolean;
    character(characterId: number): Character | undefined;
    setOutfits(outfits: Outfits): void;
    setChat(chat: DiaryChat | null): void;
} | null>(null);

/**
 * Tells the profiles which Chat is on screen and its newest AI Message, so a profile shows the
 * Character's Diary there (.scratch/diary/spec.md). Outside a Chat it does nothing, and no Diary shows.
 */
export function useProfileChat(storyId: number, chatId: number, newestAiMessageId: number | null): void {
    const setChat = useContext(ProfileContext)?.setChat;
    useEffect(() => {
        setChat?.({ storyId, chatId, newestAiMessageId });
    }, [setChat, storyId, chatId, newestAiMessageId]);
    useEffect(() => () => setChat?.(null), [setChat]);
}

/**
 * Tells the profiles what each Character is wearing now, from the Chat on screen, so a profile
 * shows it. The Chat screen calls it with the Chat's Outfits as they change; outside a Chat it does nothing.
 */
export function useProfileOutfits(outfits: ReadonlyArray<{ characterId: number; outfit: string }>): void {
    const setOutfits = useContext(ProfileContext)?.setOutfits;
    // The list's text, so a re-read Chat with the same Outfits changes nothing.
    const key = JSON.stringify(outfits);
    useEffect(() => {
        setOutfits?.(Object.fromEntries((JSON.parse(key) as Array<{ characterId: number; outfit: string }>).map((entry) => [entry.characterId, entry.outfit])));
    }, [setOutfits, key]);
}

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
 * in full, their Expressions under it, name, their Diary in the Chat, Appearance, Personality, Voice and Background. Secrets and Arc directions stay
 * hidden, since they would give the story away.
 */
export function CharacterProfiles({ characters, children }: { characters: readonly Character[]; children: ReactNode }) {
    const [openId, setOpenId] = useState<number | null>(null);
    const has = useCallback((characterId: number) => characters.some((character) => character.id === characterId), [characters]);
    const find = useCallback((characterId: number) => characters.find((character) => character.id === characterId), [characters]);
    const [outfits, setOutfits] = useState<Outfits>({});
    const [chat, setChat] = useState<DiaryChat | null>(null);
    const value = useMemo(() => ({ open: setOpenId, has, character: find, setOutfits, setChat }), [has, find]);
    const character = characters.find((candidate) => candidate.id === openId);
    const close = useCallback(() => setOpenId(null), []);

    return (
        <ProfileContext.Provider value={value}>
            {children}
            {character && (
                <CharacterProfileSheet
                    character={character}
                    colour={characterColour(character.id, characters.map((member) => member.id))}
                    outfit={outfits[character.id] ?? null}
                    chat={chat}
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

function CharacterProfileSheet({
    character,
    colour,
    outfit,
    chat,
    onClose,
}: {
    character: Character;
    colour: string;
    outfit: string | null;
    chat: DiaryChat | null;
    onClose(): void;
}) {
    const name = character.name.trim() || 'Unnamed';
    const sections = SECTIONS.filter(([, field]) => character[field].trim() !== '');
    return (
        <Sheet label={name} onClose={onClose}>
            <div className="flex flex-col gap-3.5 pb-2" style={{ '--speaker-colour': colour } as CSSProperties}>
                {character.referenceImagePath ? (
                    // eslint-disable-next-line @next/next/no-img-element -- served by the API from the image folder
                    <img
                        className="block h-auto max-h-[55dvh] max-w-full self-center rounded-xl bg-surface-raised object-contain"
                        src={referenceImageUrl(character.referenceImagePath)}
                        alt={`Reference image of ${name}`}
                        draggable={false}
                    />
                ) : (
                    <span className="grid size-24 place-items-center self-center rounded-full bg-(--speaker-colour) text-[2.5rem] leading-none font-bold text-on-character" aria-hidden="true">
                        {name.charAt(0).toUpperCase()}
                    </span>
                )}
                {character.expressions.length > 0 && (
                    <ul className="m-0 flex list-none flex-wrap justify-center gap-x-3.5 gap-y-2.5 p-0" aria-label="Expressions">
                        {character.expressions.map((expression) => (
                            <li key={expression.emotion} className="flex flex-col items-center gap-1 text-sm text-muted">
                                <PortraitImage
                                    portrait={{ src: referenceImageUrl(expression.imagePath), crop: expression.crop ?? character.portraitCrop }}
                                    className="size-12"
                                />
                                <span>{EMOTION_LABEL[expression.emotion]}</span>
                            </li>
                        ))}
                    </ul>
                )}
                <h2 className="m-0 text-center text-xl text-(color:--speaker-colour) [overflow-wrap:anywhere]">{name}</h2>
                {/* What they are wearing now in this Chat (.scratch/info-box/spec.md), above what they usually look like. */}
                {outfit && (
                    <section className="rounded-lg bg-surface-raised px-3.5 py-3">
                        <h3 className="mt-0 mb-1 text-sm font-semibold text-muted">Wearing now</h3>
                        <p className="m-0 leading-normal [overflow-wrap:anywhere]">{outfit}</p>
                    </section>
                )}
                {/* Their Diary in this Chat, above who they are: it is what changes as the story goes. */}
                {chat && <DiarySection chat={chat} characterId={character.id} name={name} />}
                {sections.map(([label, field]) => (
                    <section key={field} className="rounded-lg bg-surface-raised px-3.5 py-3">
                        <h3 className="mt-0 mb-1 text-sm font-semibold text-muted">{label}</h3>
                        <p className="m-0 leading-normal whitespace-pre-wrap [overflow-wrap:anywhere]">{character[field]}</p>
                    </section>
                ))}
            </div>
        </Sheet>
    );
}

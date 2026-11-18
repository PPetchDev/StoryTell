'use client';

import { CSSProperties, createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { TEXT_BOX } from '@/components/chat/chat-classes';
import { DiaryChat, DiarySection } from '@/components/chat/diary-section';
import { PortraitImage } from '@/components/portrait/portrait-image';
import { Sheet } from '@/components/sheet/sheet';
import { characterColour } from '@/lib/character-colour';
import { EMOTION_LABEL } from '@/lib/expressions';
import { renderUser } from '@/lib/memory';
import { Character, referenceImageUrl } from '@/lib/story';


/** Opens the profile of a Character in the cast; null where no profiles are on offer. */
type OpenProfile = (characterId: number) => void;

/** What the Characters are wearing now in the Chat on screen, by Character id (CONTEXT.md, "Outfit"). */
type Outfits = Readonly<Record<number, string>>;

/** The most a Now note may be (.scratch/growing-cards/spec.md): about three short sentences. */
export const NOW_NOTE_MAX = 300;

/**
 * The Now notes of the Chat on screen (.scratch/growing-cards/spec.md): by Character id, with
 * `{user}`; the worn identity's name to show it with; and how to save the user's own note, which
 * answers an error to show, or null once saved.
 */
interface NowNotes {
    notes: Readonly<Record<number, string>>;
    identityName: string;
    save(characterId: number, text: string): Promise<string | null>;
}

const ProfileContext = createContext<{
    open: OpenProfile;
    has(characterId: number): boolean;
    character(characterId: number): Character | undefined;
    setOutfits(outfits: Outfits): void;
    setGoals(goals: Outfits): void;
    setNow(now: NowNotes | null): void;
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
 * Tells the profiles what each Character is after now, from the Chat on screen
 * (.scratch/character-minds/spec.md), so a profile shows it. Outside a Chat it does nothing.
 */
export function useProfileGoals(goals: ReadonlyArray<{ characterId: number; goal: string }> | undefined): void {
    const setGoals = useContext(ProfileContext)?.setGoals;
    const key = JSON.stringify(goals ?? []);
    useEffect(() => {
        setGoals?.(Object.fromEntries((JSON.parse(key) as Array<{ characterId: number; goal: string }>).map((entry) => [entry.characterId, entry.goal])));
    }, [setGoals, key]);
}

/**
 * Tells the profiles each Character's Now note in the Chat on screen (.scratch/growing-cards/spec.md),
 * and how to save the user's own, so a profile shows "Changed in this Chat" and can edit it.
 * Outside a Chat it does nothing, and no profile offers one.
 */
export function useProfileNow(
    notes: ReadonlyArray<{ characterId: number; note: string }> | undefined,
    identityName: string,
    save: (characterId: number, text: string) => Promise<string | null>,
): void {
    const setNow = useContext(ProfileContext)?.setNow;
    // The latest save, so a new one each render does not set the notes again.
    const saveRef = useRef(save);
    useEffect(() => {
        saveRef.current = save;
    });
    const key = JSON.stringify(notes ?? []);
    useEffect(() => {
        setNow?.({
            notes: Object.fromEntries((JSON.parse(key) as Array<{ characterId: number; note: string }>).map((entry) => [entry.characterId, entry.note])),
            identityName,
            save: (characterId, text) => saveRef.current(characterId, text),
        });
    }, [setNow, key, identityName]);
    useEffect(() => () => setNow?.(null), [setNow]);
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

/** Opens a Character's profile from anywhere in a Chat, as a Diary toast does; null outside a Chat. */
export function useOpenProfile(): ((characterId: number) => void) | null {
    const profiles = useContext(ProfileContext);
    return profiles ? (characterId: number) => profiles.has(characterId) && profiles.open(characterId) : null;
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
 * Lets a tap on a Character's Portrait open their profile over the Chat: their name, their
 * Reference image (no taller than 40% of the screen, so the name and what they want now are seen
 * first; docs/ui-audit-2026-11-17.md, M3), what they wear and want now, their Diary in the Chat,
 * their Expressions, then Appearance, Personality, Voice and Background. Secrets and Arc directions
 * stay hidden, since they would give the story away.
 */
export function CharacterProfiles({ characters, children }: { characters: readonly Character[]; children: ReactNode }) {
    const [openId, setOpenId] = useState<number | null>(null);
    const has = useCallback((characterId: number) => characters.some((character) => character.id === characterId), [characters]);
    const find = useCallback((characterId: number) => characters.find((character) => character.id === characterId), [characters]);
    const [outfits, setOutfits] = useState<Outfits>({});
    const [goals, setGoals] = useState<Outfits>({});
    const [now, setNow] = useState<NowNotes | null>(null);
    const [chat, setChat] = useState<DiaryChat | null>(null);
    const value = useMemo(() => ({ open: setOpenId, has, character: find, setOutfits, setGoals, setNow, setChat }), [has, find]);
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
                    goal={goals[character.id] ?? null}
                    now={now}
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
    goal,
    now,
    chat,
    onClose,
}: {
    character: Character;
    colour: string;
    outfit: string | null;
    /** What they are after now in this Chat (.scratch/character-minds/spec.md); null with none. */
    goal: string | null;
    /** The Chat's Now notes (.scratch/growing-cards/spec.md); null outside a Chat. */
    now: NowNotes | null;
    chat: DiaryChat | null;
    onClose(): void;
}) {
    const name = character.name.trim() || 'Unnamed';
    const sections = SECTIONS.filter(([, field]) => character[field].trim() !== '');
    return (
        <Sheet label={name} onClose={onClose}>
            <div className="flex flex-col gap-3.5 pb-2" style={{ '--speaker-colour': colour } as CSSProperties}>
                <h2 className="m-0 text-center text-xl text-(color:--speaker-colour) [overflow-wrap:anywhere]">{name}</h2>
                {character.referenceImagePath ? (
                    // eslint-disable-next-line @next/next/no-img-element -- served by the API from the image folder
                    <img
                        className="block h-auto max-h-[40dvh] max-w-full self-center rounded-xl bg-surface-raised object-contain"
                        src={referenceImageUrl(character.referenceImagePath)}
                        alt={`Reference image of ${name}`}
                        draggable={false}
                    />
                ) : (
                    <span className="grid size-24 place-items-center self-center rounded-full bg-(--speaker-colour) text-[2.5rem] leading-none font-bold text-on-character" aria-hidden="true">
                        {name.charAt(0).toUpperCase()}
                    </span>
                )}
                {/* What they are wearing now in this Chat (.scratch/info-box/spec.md), above what they usually look like. */}
                {outfit && (
                    <section className="rounded-lg bg-surface-raised px-3.5 py-3">
                        <h3 className="mt-0 mb-1 text-sm font-semibold text-muted">Wearing now</h3>
                        <p className="m-0 leading-normal [overflow-wrap:anywhere]">{outfit}</p>
                    </section>
                )}
                {/* What they are after now in this Chat (.scratch/character-minds/spec.md). */}
                {goal && (
                    <section className="rounded-lg bg-surface-raised px-3.5 py-3" data-goal>
                        <h3 className="mt-0 mb-1 text-sm font-semibold text-muted">Wants now</h3>
                        <p className="m-0 leading-normal [overflow-wrap:anywhere]">{goal}</p>
                    </section>
                )}
                {/* What has lastingly changed about them in this Chat (.scratch/growing-cards/spec.md), which the user can edit. */}
                {now && <NowSection key={character.id} characterId={character.id} name={name} now={now} />}
                {/* Their Diary in this Chat, above who they are: it is what changes as the story goes. */}
                {chat && <DiarySection chat={chat} characterId={character.id} name={name} />}
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

/**
 * "Changed in this Chat" (.scratch/growing-cards/spec.md): the Character's Now note, kept by the
 * Judge as the story changes them, which the user can write, correct or clear. Shown with the worn
 * identity's name for `{user}`; the API turns that name back into `{user}` when it keeps the note.
 * With no note, a quiet button to write one.
 */
function NowSection({ characterId, name, now }: { characterId: number; name: string; now: NowNotes }) {
    const stored = now.notes[characterId] ?? '';
    const shown = renderUser(stored, now.identityName);
    const [editing, setEditing] = useState(false);
    const [value, setValue] = useState(shown);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const start = () => {
        setValue(shown);
        setError(null);
        setEditing(true);
    };
    const save = async (text: string) => {
        setSaving(true);
        setError(null);
        const failed = await now.save(characterId, text);
        setSaving(false);
        if (failed === null) setEditing(false);
        else setError(failed);
    };

    if (!editing) {
        return stored ? (
            <section className="rounded-lg bg-surface-raised px-3.5 py-3" data-now-note>
                <div className="mb-1 flex items-center justify-between gap-2">
                    <h3 className="m-0 text-sm font-semibold text-muted">Changed in this Chat</h3>
                    <button type="button" className="button button-quiet button-small" aria-label={`Edit what changed for ${name}`} onClick={start}>
                        Edit
                    </button>
                </div>
                <p className="m-0 leading-normal [overflow-wrap:anywhere]">{shown}</p>
            </section>
        ) : (
            <button type="button" className="button button-quiet w-full" onClick={start}>
                Add what changed in this Chat
            </button>
        );
    }

    const countId = `now-note-count-${characterId}`;
    return (
        <form
            className="grid gap-2 rounded-lg bg-surface-raised px-3.5 py-3"
            aria-label={`What changed for ${name} in this Chat`}
            onSubmit={(event) => {
                event.preventDefault();
                void save(value);
            }}
            onKeyDown={(event) => {
                if (event.key !== 'Escape') return;
                event.stopPropagation();
                setEditing(false);
            }}
        >
            <h3 className="m-0 text-sm font-semibold text-muted">Changed in this Chat</h3>
            <p className="m-0 text-md text-muted">
                What is true of {name} now in this Chat, as facts: what they call you, what they are to you, what the story changed for good. The Narrator reads it
                next to their card.
            </p>
            <textarea
                className={`${TEXT_BOX} min-h-24 resize-y leading-[1.4]`}
                aria-label={`What changed for ${name}`}
                aria-describedby={countId}
                placeholder={`Calls ${now.identityName} "my love". Married to ${now.identityName}.`}
                value={value}
                autoFocus
                rows={4}
                maxLength={NOW_NOTE_MAX}
                onChange={(event) => setValue(event.target.value)}
            />
            <span id={countId} className="-mt-1 justify-self-end text-sm text-muted tabular-nums">
                {value.length} / {NOW_NOTE_MAX}
            </span>
            {error && (
                <p className="turn-error m-0 text-md" role="alert">
                    {error}
                </p>
            )}
            <button type="submit" className="button w-full" disabled={saving}>
                Save
            </button>
            <div className="grid grid-cols-2 gap-2">
                <button type="button" className="button button-quiet" disabled={saving || stored === ''} onClick={() => void save('')}>
                    Clear
                </button>
                <button type="button" className="button button-quiet" disabled={saving} onClick={() => setEditing(false)}>
                    Cancel
                </button>
            </div>
        </form>
    );
}

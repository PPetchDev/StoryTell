import { CSSProperties, ReactNode, useContext, useId } from 'react';

import { MessageTabStop } from '@/components/chat/chat-classes';
import { useCastCharacter, useCharacterProfile } from '@/components/chat/character-profile';
import { CharacterPortrait } from '@/components/portrait/character-portrait';
import { Cast, characterColour, Portrait, Portraits } from '@/lib/character-colour';
import { Message, MessagePart } from '@/lib/chat';
import { linePicture } from '@/lib/expressions';

import { useShownText } from './shown-text';

/** `*…*` spans as italics, in the user's lines and in Characters' speech; the stored text is unchanged. */
export function withActions(text: string): ReactNode[] {
    return text.split(/(\*[^*\n]+\*)/g).map((piece, index) =>
        index % 2 === 1 ? <em key={index}>{piece.slice(1, -1)}</em> : piece,
    );
}

/** Thai letters (U+0E00–U+0E7F). */
const THAI = /[฀-๿]/g;

/**
 * The language of a line (audit M29): Thai when most of its letters are Thai, so a screen reader
 * reads it with a Thai voice under the app's English `<html lang>`. Undefined leaves it English.
 */
export function langOf(text: string): 'th' | undefined {
    const thai = text.match(THAI)?.length ?? 0;
    if (thai === 0) return undefined;
    const letters = text.match(/\p{L}/gu)?.length ?? 0;
    return thai * 2 >= letters ? 'th' : undefined;
}

/** Story text's size: the text-size preference sets --story-size on an ancestor; M is the fallback. */
const STORY_SIZE = 'text-[length:var(--story-size,1.0625rem)]';

/** A bubble's text: wraps anywhere, keeps the line breaks it was written with. */
const BUBBLE = 'm-0 px-3.5 py-2 leading-normal whitespace-pre-wrap [overflow-wrap:anywhere]';

/** The name over a line: small and bold. */
const LINE_NAME = 'mt-0.5 mb-1 text-sm font-semibold';

/** Beside a line: the 36px round picture. */
const AVATAR = 'size-9 shrink-0 rounded-full object-cover text-note';

/** A round picture beside a line: the Character's Portrait, or their initial on their colour. */
function Avatar({ name, colour, portrait, light = false }: { name: string; colour: string; portrait?: Portrait; light?: boolean }) {
    return <CharacterPortrait name={name} colour={colour} portrait={portrait} light={light} className={AVATAR} />;
}

/** What the user wrote, under the identity they wore: a purple bubble on the right. */
export function UserLine({ identityName, text }: { identityName: string; text: string }) {
    return (
        <div className={`flex items-start justify-end gap-2 ${STORY_SIZE}`}>
            <div className="flex max-w-[calc(100%_-_2.75rem)] min-w-0 flex-col items-end">
                <p className={`${LINE_NAME} text-accent`}>{identityName}</p>
                <p className={`${BUBBLE} rounded-xl rounded-tr-[0.3rem] bg-accent-fill text-accent-text`} lang={langOf(text)}>
                    {withActions(text)}
                </p>
            </div>
            <Avatar name={identityName} colour="var(--accent-fill)" light />
        </div>
    );
}

/** Read aloud's highlight: an outline round the part being read, in the speaker's colour. */
const READING_NOW = 'rounded-sm outline-2 outline-offset-3 outline-solid';

/**
 * A Character's line: their picture, their name in their colour, and the line in a bubble. In a
 * Chat, a tap on the picture opens the Character's profile.
 */
function Speech({
    part,
    cast,
    portraits,
    reading = false,
}: {
    part: Extract<MessagePart, { kind: 'speech' }>;
    cast: Cast;
    portraits: Portraits;
    /** Read aloud is reading this line: outlined in the Character's colour. */
    reading?: boolean;
}) {
    const nameId = useId();
    const tabStop = useContext(MessageTabStop);
    const colour = characterColour(part.characterId, cast);
    // In a Chat the cast is at hand, so the line shows its Expression (.scratch/expressions/spec.md); elsewhere
    // (the Opening preview, never judged) the Portrait.
    const character = useCastCharacter(part.characterId);
    const round = character ? linePicture(character, part.emotion).round : null;
    const portrait = round
        ? round.kind === 'initial'
            ? undefined
            : { src: round.src, crop: round.crop }
        : part.characterId === null
          ? undefined
          : portraits[part.characterId];
    const openProfile = useCharacterProfile(part.characterId);
    const avatar = <Avatar name={part.speakerName} colour={colour} portrait={portrait} />;
    return (
        <div
            className={`flex items-start gap-2 ${reading ? `${READING_NOW} outline-(color:--speaker-colour)` : ''}`}
            style={{ '--speaker-colour': colour } as CSSProperties}
            role="group"
            aria-labelledby={nameId}
            aria-current={reading ? 'true' : undefined}
        >
            {openProfile ? (
                // A 44px target round the 36px picture.
                <button
                    type="button"
                    className="bare-button relative shrink-0 rounded-full press before:absolute before:-inset-1 before:rounded-full"
                    aria-label={`Profile of ${part.speakerName}`}
                    tabIndex={tabStop ? undefined : -1}
                    onClick={openProfile}
                >
                    {avatar}
                </button>
            ) : (
                avatar
            )}
            <div className="flex max-w-[calc(100%_-_2.75rem)] min-w-0 flex-col">
                <p id={nameId} className={`${LINE_NAME} text-(color:--speaker-colour)`}>
                    {part.speakerName}
                </p>
                <p className={`${BUBBLE} self-start rounded-xl rounded-tl-[0.3rem] bg-surface-raised text-text [&_em]:text-muted`} lang={langOf(part.text)}>
                    {withActions(part.text)}
                </p>
            </div>
        </div>
    );
}

/** Narration: an italic line marked with ≡, outside any bubble. */
function Narration({ text, reading = false }: { text: string; reading?: boolean }) {
    return (
        <div className={`flex items-start gap-2.5 px-1 ${reading ? `${READING_NOW} outline-accent` : ''}`} aria-current={reading ? 'true' : undefined}>
            {/* Sits on the first line of text. */}
            <svg className="mt-1 shrink-0 text-muted" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                <path d="M2 4h12M2 8h12M2 12h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <p className="m-0 leading-[1.55] whitespace-pre-wrap text-muted italic [overflow-wrap:anywhere]" lang={langOf(text)}>
                {text}
            </p>
        </div>
    );
}

interface MessageBodyProps {
    message: Message;
    cast: Cast;
    /** The cast's Reference images by Character id; a Character without one shows their initial. */
    portraits?: Portraits;
    /** The part Read aloud is reading, highlighted; null while it isn't reading this Message. */
    readingNow?: ReadingNow | null;
}

/** Where Read aloud is in a Message: a part, and for narration its paragraph as split below. */
export interface ReadingNow {
    partIndex: number;
    paragraph: number | null;
}

/**
 * A Message's story text as chat lines (spec: "Message rendering", revised for the chat-bubble
 * look): an AI Message as its parts in order, narration as italic lines and each speech part as
 * its speaker's bubble; a User Message as a bubble on the right.
 */
export function MessageBody({ message, cast, portraits = {}, readingNow = null }: MessageBodyProps) {
    if (message.kind === 'user') return <UserLine identityName={message.identityName} text={message.text} />;
    return <AiMessageParts parts={message.parts} cast={cast} portraits={portraits} readingNow={readingNow} />;
}

/**
 * An AI Message's parts in order, stored or still being written (spec: streaming replies), as
 * shown: the Chat's On AI Messages Replace rules run on each part's text first
 * (.scratch/saved-replies-and-replace-rules/spec.md), on narration before it is split into
 * paragraphs (so a rule can remove one) and on speech before `*…*` becomes italics. Speakers'
 * names are never touched; a part a rule leaves blank isn't drawn.
 */
export function AiMessageParts({
    parts,
    cast,
    portraits = {},
    readingNow = null,
}: {
    parts: MessagePart[];
    cast: Cast;
    portraits?: Portraits;
    readingNow?: ReadingNow | null;
}) {
    const shown = useShownText();
    return (
        <div className={`flex flex-col gap-3.5 ${STORY_SIZE}`}>
            {parts.map((part, index) => {
                const text = shown(part.text);
                if (part.kind === 'narration') {
                    // One ≡ line per paragraph: the parser merges narration paragraphs into one part.
                    return text
                        .split(/\n\s*\n/)
                        .filter((paragraph) => paragraph.trim() !== '')
                        .map((paragraph, line) => (
                            <Narration
                                key={`${index}-${line}`}
                                text={paragraph.trim()}
                                reading={readingNow?.partIndex === index && readingNow.paragraph === line}
                            />
                        ));
                }
                if (text.trim() === '') return null;
                return <Speech key={index} part={{ ...part, text }} cast={cast} portraits={portraits} reading={readingNow?.partIndex === index} />;
            })}
        </div>
    );
}

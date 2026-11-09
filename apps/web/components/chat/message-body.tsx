import { CSSProperties, ReactNode, useId } from 'react';

import { useCharacterProfile } from '@/components/chat/character-profile';
import { CharacterPortrait } from '@/components/portrait/character-portrait';
import { Cast, characterColour, Portrait, Portraits } from '@/lib/character-colour';
import { Message, MessagePart } from '@/lib/chat';

import styles from './message-body.module.css';
import { useShownText } from './shown-text';

/** `*…*` spans as italics, in the user's lines and in Characters' speech; the stored text is unchanged. */
export function withActions(text: string): ReactNode[] {
    return text.split(/(\*[^*\n]+\*)/g).map((piece, index) =>
        index % 2 === 1 ? <em key={index}>{piece.slice(1, -1)}</em> : piece,
    );
}

/** A round picture beside a line: the Character's Portrait, or their initial on their colour. */
function Avatar({ name, colour, portrait, light = false }: { name: string; colour: string; portrait?: Portrait; light?: boolean }) {
    return <CharacterPortrait name={name} colour={colour} portrait={portrait} light={light} className={styles.avatar} />;
}

/** What the user wrote, under the identity they wore: a purple bubble on the right. */
export function UserLine({ identityName, text }: { identityName: string; text: string }) {
    return (
        <div className={styles.user}>
            <div className={styles.column}>
                <p className={styles.identity}>{identityName}</p>
                <p className={styles.userBubble}>{withActions(text)}</p>
            </div>
            <Avatar name={identityName} colour="var(--accent-fill)" light />
        </div>
    );
}

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
    const colour = characterColour(part.characterId, cast);
    const portrait = part.characterId === null ? undefined : portraits[part.characterId];
    const openProfile = useCharacterProfile(part.characterId);
    const avatar = <Avatar name={part.speakerName} colour={colour} portrait={portrait} />;
    return (
        <div
            className={reading ? `${styles.speech} ${styles.readingNow}` : styles.speech}
            style={{ '--speaker-colour': colour } as CSSProperties}
            role="group"
            aria-labelledby={nameId}
            aria-current={reading ? 'true' : undefined}
        >
            {openProfile ? (
                <button type="button" className={styles.avatarButton} aria-label={`Profile of ${part.speakerName}`} onClick={openProfile}>
                    {avatar}
                </button>
            ) : (
                avatar
            )}
            <div className={styles.column}>
                <p id={nameId} className={styles.speaker}>
                    {part.speakerName}
                </p>
                <p className={styles.bubble}>{withActions(part.text)}</p>
            </div>
        </div>
    );
}

/** Narration: an italic line marked with ≡, outside any bubble. */
function Narration({ text, reading = false }: { text: string; reading?: boolean }) {
    return (
        <div className={reading ? `${styles.narration} ${styles.readingNow}` : styles.narration} aria-current={reading ? 'true' : undefined}>
            <svg className={styles.mark} viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                <path d="M2 4h12M2 8h12M2 12h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <p className={styles.narrationText}>{text}</p>
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
        <div className={styles.story}>
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

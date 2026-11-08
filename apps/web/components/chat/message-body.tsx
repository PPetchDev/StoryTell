import { CSSProperties, ReactNode, useId } from 'react';

import { useCharacterProfile } from '@/components/chat/character-profile';
import { CharacterPortrait } from '@/components/portrait/character-portrait';
import { Cast, characterColour, Portrait, Portraits } from '@/lib/character-colour';
import { Message, MessagePart } from '@/lib/chat';

import styles from './message-body.module.css';

/** `*…*` spans as italics, in the user's lines and in Characters' speech; the stored text is unchanged. */
function withActions(text: string): ReactNode[] {
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
function Speech({ part, cast, portraits }: { part: Extract<MessagePart, { kind: 'speech' }>; cast: Cast; portraits: Portraits }) {
    const nameId = useId();
    const colour = characterColour(part.characterId, cast);
    const portrait = part.characterId === null ? undefined : portraits[part.characterId];
    const openProfile = useCharacterProfile(part.characterId);
    const avatar = <Avatar name={part.speakerName} colour={colour} portrait={portrait} />;
    return (
        <div className={styles.speech} style={{ '--speaker-colour': colour } as CSSProperties} role="group" aria-labelledby={nameId}>
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
function Narration({ text }: { text: string }) {
    return (
        <div className={styles.narration}>
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
}

/**
 * A Message's story text as chat lines (spec: "Message rendering", revised for the chat-bubble
 * look): an AI Message as its parts in order, narration as italic lines and each speech part as
 * its speaker's bubble; a User Message as a bubble on the right.
 */
export function MessageBody({ message, cast, portraits = {} }: MessageBodyProps) {
    if (message.kind === 'user') return <UserLine identityName={message.identityName} text={message.text} />;
    return <AiMessageParts parts={message.parts} cast={cast} portraits={portraits} />;
}

/** An AI Message's parts in order, stored or still being written (spec: streaming replies). */
export function AiMessageParts({ parts, cast, portraits = {} }: { parts: MessagePart[]; cast: Cast; portraits?: Portraits }) {
    return (
        <div className={styles.story}>
            {parts.map((part, index) =>
                part.kind === 'narration' ? (
                    // One ≡ line per paragraph: the parser merges narration paragraphs into one part.
                    part.text
                        .split(/\n\s*\n/)
                        .filter((paragraph) => paragraph.trim() !== '')
                        .map((paragraph, line) => <Narration key={`${index}-${line}`} text={paragraph.trim()} />)
                ) : (
                    <Speech key={index} part={part} cast={cast} portraits={portraits} />
                ),
            )}
        </div>
    );
}

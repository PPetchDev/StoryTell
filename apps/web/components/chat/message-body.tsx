import { CSSProperties, ReactNode, useId } from 'react';

import { bookFace } from '@/lib/book-face';
import { characterColour } from '@/lib/character-colour';
import { Message, MessagePart } from '@/lib/chat';

import styles from './message-body.module.css';

/** `*…*` spans in a user's line as italics (spec: story 9); the stored text is unchanged. */
function withActions(text: string): ReactNode[] {
    return text.split(/(\*[^*\n]+\*)/g).map((piece, index) =>
        index % 2 === 1 ? <em key={index}>{piece.slice(1, -1)}</em> : piece,
    );
}

/** What the user wrote, under the identity they wore: a tinted bubble on the right. */
export function UserLine({ identityName, text }: { identityName: string; text: string }) {
    return (
        <div className={`${styles.user} ${bookFace.variable}`}>
            <p className={styles.identity}>{identityName}</p>
            <p className={styles.bubble}>{withActions(text)}</p>
        </div>
    );
}

/** A Character's line: the stamped name and the text inside a bar, both in the Character's colour. */
function Speech({ part, cast }: { part: Extract<MessagePart, { kind: 'speech' }>; cast: readonly number[] }) {
    const nameId = useId();
    const colour = { '--speaker-colour': characterColour(part.characterId, cast) } as CSSProperties;
    return (
        <div className={styles.speech} style={colour} role="group" aria-labelledby={nameId}>
            <p id={nameId} className={styles.speaker}>
                {part.speakerName}
            </p>
            <p className={styles.text}>{part.text}</p>
        </div>
    );
}

interface MessageBodyProps {
    message: Message;
    /** The Story's Character ids in their authored order, which pick each Character's colour. */
    cast: readonly number[];
}

/**
 * A Message's story text in the book face (spec: "Message rendering"): an AI Message as its
 * parts in order, narration as plain paragraphs and speech with its speaker's colour; a User
 * Message as a bubble.
 */
export function MessageBody({ message, cast }: MessageBodyProps) {
    if (message.kind === 'user') return <UserLine identityName={message.identityName} text={message.text} />;
    return (
        <div className={`${styles.story} ${bookFace.variable}`}>
            {message.parts.map((part, index) =>
                part.kind === 'narration' ? (
                    <p key={index} className={styles.narration}>
                        {part.text}
                    </p>
                ) : (
                    <Speech key={index} part={part} cast={cast} />
                ),
            )}
        </div>
    );
}

'use client';

import { createContext, CSSProperties, ReactNode, useContext, useMemo } from 'react';

import { useCastCharacter } from '@/components/chat/character-profile';
import { Cast, characterColour } from '@/lib/character-colour';
import { SecretReveal } from '@/lib/chat';

/** The Chat's revealed Secrets by the Message that told each, and the cast for their colours. */
interface RevealsByMessage {
    byMessage: ReadonlyMap<number, SecretReveal[]>;
    cast: Cast;
}

const SecretRevealsContext = createContext<RevealsByMessage | null>(null);

/**
 * Gives the thread the Chat's revealed Secrets (.scratch/secret-reveals/spec.md). Read from a
 * context, like the Bookmarks, so a new reveal redraws only its own card, never the other Messages.
 */
export function SecretRevealsProvider({ reveals, cast, children }: { reveals: readonly SecretReveal[] | undefined; cast: Cast; children: ReactNode }) {
    // The list's text, so a re-read Chat with the same reveals changes nothing.
    const key = JSON.stringify(reveals ?? []);
    const value = useMemo(() => {
        const byMessage = new Map<number, SecretReveal[]>();
        for (const reveal of JSON.parse(key) as SecretReveal[]) byMessage.set(reveal.messageId, [...(byMessage.get(reveal.messageId) ?? []), reveal]);
        return { byMessage, cast };
    }, [key, cast]);
    return <SecretRevealsContext.Provider value={value}>{children}</SecretRevealsContext.Provider>;
}

/** An open padlock, drawn small beside the card's title. */
function OpenLockMark() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="flex-none">
            <rect x="4" y="11" width="16" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 7.5-2" />
        </svg>
    );
}

function RevealCard({ reveal, cast }: { reveal: SecretReveal; cast: Cast }) {
    const character = useCastCharacter(reveal.characterId);
    const name = character?.name.trim() || 'Someone';
    return (
        <aside
            className="mt-2 rounded-lg border border-line bg-surface-raised px-3 py-2 text-sm leading-normal [overflow-wrap:anywhere]"
            style={{ '--speaker-colour': characterColour(reveal.characterId, cast) } as CSSProperties}
            aria-label={`Secret revealed by ${name}`}
            data-secret-reveal={reveal.secretId}
        >
            <p className="m-0 mb-0.5 flex items-center gap-1.5 text-xs font-bold tracking-widest text-muted uppercase">
                <OpenLockMark />
                Secret revealed
            </p>
            <p className="m-0">
                <span className="font-semibold text-(color:--speaker-colour)">{name}:</span> {reveal.text}
            </p>
        </aside>
    );
}

/** The "Secret revealed" cards under the Message that told them; nothing for any other Message. */
export function RevealedSecretCards({ messageId }: { messageId: number }) {
    const reveals = useContext(SecretRevealsContext);
    const here = reveals?.byMessage.get(messageId);
    if (!reveals || !here) return null;
    return (
        <>
            {here.map((reveal) => (
                <RevealCard key={reveal.secretId} reveal={reveal} cast={reveals.cast} />
            ))}
        </>
    );
}

'use client';

import { createContext, ReactNode, useContext, useMemo } from 'react';

/** The pictures of the Personas a Chat shows, by Persona id (CONTEXT.md, "Persona image"). */
const PersonaPicturesContext = createContext<Readonly<Record<number, string>>>({});

/**
 * Gives the user's lines in a Chat their Persona's picture (.scratch/persona-image/spec.md): the
 * Chat names the pictures of the Personas it shows, and each line looks its own up. Outside a
 * Chat, and for a line written as the Role, there is none and the initial shows.
 */
export function PersonaPictures({ images, children }: { images: ReadonlyArray<{ personaId: number; imagePath: string }>; children: ReactNode }) {
    // The list's text, so a re-read Chat with the same pictures redraws nothing.
    const key = JSON.stringify(images);
    const value = useMemo(
        () => Object.fromEntries((JSON.parse(key) as Array<{ personaId: number; imagePath: string }>).map((image) => [image.personaId, image.imagePath])),
        [key],
    );
    return <PersonaPicturesContext.Provider value={value}>{children}</PersonaPicturesContext.Provider>;
}

/** The picture of the Persona a line was written as, as a path under `/api/images/`; null for the Role or a Persona without one. */
export function usePersonaPicture(personaId: number | null | undefined): string | null {
    const pictures = useContext(PersonaPicturesContext);
    return personaId === null || personaId === undefined ? null : (pictures[personaId] ?? null);
}

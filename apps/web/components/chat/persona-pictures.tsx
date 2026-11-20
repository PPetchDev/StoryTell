'use client';

import { createContext, ReactNode, useContext, useMemo } from 'react';

/** The pictures of the Personas a Chat shows, by Persona id (CONTEXT.md, "Persona image"), and the Role's (.scratch/role-image/spec.md). */
const PersonaPicturesContext = createContext<{ personas: Readonly<Record<number, string>>; role: string | null }>({ personas: {}, role: null });

/**
 * Gives the user's lines in a Chat their Persona's picture (.scratch/persona-image/spec.md): the
 * Chat names the pictures of the Personas it shows, and each line looks its own up; a line written
 * as the Role shows the Role's picture. Outside a Chat, or without one, the initial shows.
 */
export function PersonaPictures({
    images,
    roleImage = null,
    children,
}: {
    images: ReadonlyArray<{ personaId: number; imagePath: string }>;
    roleImage?: string | null;
    children: ReactNode;
}) {
    // The list's text, so a re-read Chat with the same pictures redraws nothing.
    const key = JSON.stringify(images);
    const value = useMemo(
        () => ({
            personas: Object.fromEntries((JSON.parse(key) as Array<{ personaId: number; imagePath: string }>).map((image) => [image.personaId, image.imagePath])),
            role: roleImage,
        }),
        [key, roleImage],
    );
    return <PersonaPicturesContext.Provider value={value}>{children}</PersonaPicturesContext.Provider>;
}

/** The picture of the Persona a line was written as, or the Role's for a line written as the Role, as a path under `/api/images/`; null without one. */
export function usePersonaPicture(personaId: number | null | undefined): string | null {
    const pictures = useContext(PersonaPicturesContext);
    return personaId === null || personaId === undefined ? pictures.role : (pictures.personas[personaId] ?? null);
}

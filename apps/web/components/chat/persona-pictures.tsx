'use client';

import { createContext, ReactNode, useContext, useMemo } from 'react';

import { Expression, ExpressionEmotion } from '@/lib/expressions';
import type { PortraitCrop } from '@/lib/story';

interface Pictures {
    personas: Readonly<Record<number, string>>;
    role: string | null;
    /** The pictures' face squares (.scratch/your-faces/spec.md); missing uses the default. */
    personaCrops: Readonly<Record<number, PortraitCrop | null>>;
    roleCrop: PortraitCrop | null;
    /** The Expressions of the Personas that have any (.scratch/your-faces/spec.md). */
    personaFaces: Readonly<Record<number, Expression[]>>;
    roleFaces: Expression[];
}

/** The pictures of the Personas a Chat shows, by Persona id (CONTEXT.md, "Persona image"), and the Role's (.scratch/role-image/spec.md); with their Expressions. */
const PersonaPicturesContext = createContext<Pictures>({ personas: {}, role: null, personaCrops: {}, roleCrop: null, personaFaces: {}, roleFaces: [] });

/**
 * Gives the user's lines in a Chat their Persona's picture (.scratch/persona-image/spec.md): the
 * Chat names the pictures of the Personas it shows, and each line looks its own up; a line written
 * as the Role shows the Role's picture. Outside a Chat, or without one, the initial shows. A line
 * with a face shows that face's Expression when the Role or Persona has it (.scratch/your-faces/spec.md).
 */
export function PersonaPictures({
    images,
    roleImage = null,
    roleCrop = null,
    faces = [],
    roleFaces = [],
    children,
}: {
    images: ReadonlyArray<{ personaId: number; imagePath: string; crop?: PortraitCrop | null }>;
    roleImage?: string | null;
    roleCrop?: PortraitCrop | null;
    faces?: ReadonlyArray<{ personaId: number; expressions: Expression[] }>;
    roleFaces?: Expression[];
    children: ReactNode;
}) {
    // The lists' text, so a re-read Chat with the same pictures redraws nothing.
    const key = JSON.stringify([images, faces, roleFaces, roleCrop]);
    const value = useMemo(() => {
        const [pictures, personaFaces, role, square] = JSON.parse(key) as [
            Array<{ personaId: number; imagePath: string; crop?: PortraitCrop | null }>,
            Array<{ personaId: number; expressions: Expression[] }>,
            Expression[],
            PortraitCrop | null,
        ];
        return {
            personas: Object.fromEntries(pictures.map((image) => [image.personaId, image.imagePath])),
            role: roleImage,
            personaCrops: Object.fromEntries(pictures.map((image) => [image.personaId, image.crop ?? null])),
            roleCrop: square,
            personaFaces: Object.fromEntries(personaFaces.map((entry) => [entry.personaId, entry.expressions])),
            roleFaces: role,
        };
    }, [key, roleImage]);
    return <PersonaPicturesContext.Provider value={value}>{children}</PersonaPicturesContext.Provider>;
}

/** The picture of the Persona a line was written as, or the Role's for a line written as the Role, as a path under `/api/images/`; null without one. */
export function usePersonaPicture(personaId: number | null | undefined): string | null {
    const pictures = useContext(PersonaPicturesContext);
    return personaId === null || personaId === undefined ? pictures.role : (pictures.personas[personaId] ?? null);
}

/** The face square of the picture a line was written as (.scratch/your-faces/spec.md); null uses the default. */
export function usePersonaPictureCrop(personaId: number | null | undefined): PortraitCrop | null {
    const pictures = useContext(PersonaPicturesContext);
    return personaId === null || personaId === undefined ? pictures.roleCrop : (pictures.personaCrops[personaId] ?? null);
}

/** The Expressions of the Role (null) or a Persona, as the Chat answered them (.scratch/your-faces/spec.md). */
export function useYourFaces(personaId: number | null | undefined): Expression[] {
    const pictures = useContext(PersonaPicturesContext);
    return personaId === null || personaId === undefined ? pictures.roleFaces : (pictures.personaFaces[personaId] ?? []);
}

/** The Expression of one face of the Role or a Persona; null when it has none. */
export function useYourFace(personaId: number | null | undefined, emotion: ExpressionEmotion | null | undefined): Expression | null {
    const faces = useYourFaces(personaId);
    return emotion ? (faces.find((face) => face.emotion === emotion) ?? null) : null;
}

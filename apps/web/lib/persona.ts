import { apiFetch, apiSend } from './api';

// Mirrors the API's Persona DTOs (apps/api/src/api/persona/dto/persona.response.dto.ts).

export interface Persona {
    id: number;
    name: string;
    description: string;
    /** Its picture (CONTEXT.md, "Persona image"), as a path under `/api/images/`; null without one. */
    imagePath: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface PersonaList {
    personas: Persona[];
}

/** Where the API serves a Persona's picture; with `width`, its WebP thumbnail that wide (320 or 640). */
export function personaImageUrl(imagePath: string, width?: 320 | 640): string {
    return `/api/images/${imagePath}${width ? `?w=${width}` : ''}`;
}

/** The list is read with useApiQuery('/personas'); writes answer with the Persona. */
export const personaApi = {
    create: (fields: { name: string; description: string }) => apiSend<Persona>('POST', '/personas', fields),
    /** Old User Messages keep the name they were stamped with. */
    update: (personaId: number, fields: { name?: string; description?: string }) =>
        apiSend<Persona>('PATCH', `/personas/${personaId}`, fields),
    /** Stores a picture from the phone as the Persona's, which owns its file; the one it replaces is deleted. */
    uploadImage: (personaId: number, picture: Blob, filename: string) => {
        const form = new FormData();
        form.append('image', picture, filename);
        return apiFetch<Persona>(`/personas/${personaId}/image`, { method: 'PUT', body: form });
    },
    clearImage: (personaId: number) => apiSend<Persona>('DELETE', `/personas/${personaId}/image`),
    /** Chats wearing it fall back to their Story's Role. */
    remove: (personaId: number) => apiSend<void>('DELETE', `/personas/${personaId}`),
};

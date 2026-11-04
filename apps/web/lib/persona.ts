import { apiSend } from './api';

// Mirrors the API's Persona DTOs (apps/api/src/api/persona/dto/persona.response.dto.ts).

export interface Persona {
    id: number;
    name: string;
    description: string;
    createdAt: string;
    updatedAt: string;
}

export interface PersonaList {
    personas: Persona[];
}

/** The list is read with useApiQuery('/personas'); writes answer with the Persona. */
export const personaApi = {
    create: (fields: { name: string; description: string }) => apiSend<Persona>('POST', '/personas', fields),
    /** Old User Messages keep the name they were stamped with. */
    update: (personaId: number, fields: { name?: string; description?: string }) =>
        apiSend<Persona>('PATCH', `/personas/${personaId}`, fields),
    /** Chats wearing it fall back to their Story's Role. */
    remove: (personaId: number) => apiSend<void>('DELETE', `/personas/${personaId}`),
};

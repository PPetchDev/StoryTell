import { apiFetch, apiSend } from './api';

// Mirrors apps/api's PlacesResponseBodyDTO (.scratch/places-ahead/spec.md).

export type PlaceLight = 'day' | 'evening' | 'night';

export const PLACE_LIGHTS: readonly PlaceLight[] = ['day', 'evening', 'night'];

export const PLACE_LIGHT_LABEL: Record<PlaceLight, string> = { day: 'Day', evening: 'Evening', night: 'Night' };

export interface PlacePicture {
    status: 'drawing' | 'ready' | 'failed';
    /** Relative to the image folder; null until drawn. */
    imagePath: string | null;
}

export type PlacePictures = Record<PlaceLight, PlacePicture | null>;

export interface Place {
    id: number;
    name: string;
    looks: string;
    pictures: PlacePictures;
}

/** A place a Chat drew in play that is not one of the Story's Places, by the words play used. */
export interface MetPlace {
    key: string;
    pictures: PlacePictures;
}

export interface Places {
    places: Place[];
    met: MetPlace[];
}

export const PLACE_NAME_MAX = 120;
export const PLACE_LOOKS_MAX = 600;

export const placesApi = {
    list: (storyId: number) => apiFetch<Places>(`/stories/${storyId}/places`),
    add: (storyId: number, fields: { name: string; looks?: string }) => apiSend<Places>('POST', `/stories/${storyId}/places`, fields),
    change: (storyId: number, placeId: number, fields: { name?: string; looks?: string }) => apiSend<Places>('PATCH', `/stories/${storyId}/places/${placeId}`, fields),
    remove: (storyId: number, placeId: number) => apiSend<Places>('DELETE', `/stories/${storyId}/places/${placeId}`),
    draw: (storyId: number, placeId: number, light: PlaceLight) => apiSend<Places>('POST', `/stories/${storyId}/places/${placeId}/draw`, { light }),
    upload: (storyId: number, placeId: number, light: PlaceLight, picture: Blob, filename: string) => {
        const form = new FormData();
        form.append('image', picture, filename);
        return apiFetch<Places>(`/stories/${storyId}/places/${placeId}/pictures/${light}`, { method: 'PUT', body: form });
    },
    removeMet: (storyId: number, key: string) => apiSend<Places>('POST', `/stories/${storyId}/places/met/remove`, { key }),
};

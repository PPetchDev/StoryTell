import { apiFetch, apiSend } from './api';
import type { ExpressionDrawing, ExpressionEmotion } from './expressions';
import type { PortraitCrop } from './story';

/**
 * One owner's Expression routes: a Character's (`/stories/1/characters/2`), the Story's Role
 * (`/stories/1/role`) or a Persona (`/personas/3`), .scratch/your-faces/spec.md. `T` is what a write
 * answers: the whole Story, or the Persona.
 */
export interface ExpressionEndpoints<T> {
    draw(emotion: ExpressionEmotion): Promise<T>;
    cutOut(emotion: ExpressionEmotion): Promise<T>;
    upload(emotion: ExpressionEmotion, picture: Blob, filename: string): Promise<T>;
    setCrop(emotion: ExpressionEmotion, crop: PortraitCrop): Promise<T>;
    clearCrop(emotion: ExpressionEmotion): Promise<T>;
    remove(emotion: ExpressionEmotion): Promise<T>;
    startDrawing(redraw: boolean): Promise<ExpressionDrawing>;
    drawing(): Promise<ExpressionDrawing>;
}

export function expressionEndpoints<T>(base: string): ExpressionEndpoints<T> {
    const one = (emotion: ExpressionEmotion) => `${base}/expressions/${emotion}`;
    return {
        draw: (emotion) => apiSend<T>('POST', `${one(emotion)}/draw`),
        cutOut: (emotion) => apiSend<T>('POST', `${one(emotion)}/cutout`),
        upload: (emotion, picture, filename) => {
            const form = new FormData();
            form.append('image', picture, filename);
            return apiFetch<T>(one(emotion), { method: 'PUT', body: form });
        },
        setCrop: (emotion, crop) => apiSend<T>('PUT', `${one(emotion)}/crop`, crop),
        clearCrop: (emotion) => apiSend<T>('DELETE', `${one(emotion)}/crop`),
        remove: (emotion) => apiSend<T>('DELETE', one(emotion)),
        startDrawing: (redraw) => apiSend<ExpressionDrawing>('POST', `${base}/expression-drawing`, { redraw }),
        drawing: () => apiFetch<ExpressionDrawing>(`${base}/expression-drawing`),
    };
}

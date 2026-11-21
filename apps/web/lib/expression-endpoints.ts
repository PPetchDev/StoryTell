import { apiFetch, apiSend } from './api';
import type { ExpressionDrawing, FaceEmotion } from './expressions';
import type { PortraitCrop } from './story';

/**
 * One owner's Expression routes: a Character's (`/stories/1/characters/2`), the Story's Role
 * (`/stories/1/role`) or a Persona (`/personas/3`), .scratch/your-faces/spec.md. `T` is what a write
 * answers: the whole Story, or the Persona.
 */
export interface ExpressionEndpoints<T> {
    draw(emotion: FaceEmotion): Promise<T>;
    cutOut(emotion: FaceEmotion): Promise<T>;
    upload(emotion: FaceEmotion, picture: Blob, filename: string): Promise<T>;
    setCrop(emotion: FaceEmotion, crop: PortraitCrop): Promise<T>;
    clearCrop(emotion: FaceEmotion): Promise<T>;
    remove(emotion: FaceEmotion): Promise<T>;
    startDrawing(redraw: boolean): Promise<ExpressionDrawing>;
    drawing(): Promise<ExpressionDrawing>;
    /** Stops a run after the drawing under way (docs/ui-audit-2026-11-21.md, M4). */
    stopDrawing(): Promise<ExpressionDrawing>;
}

export function expressionEndpoints<T>(base: string): ExpressionEndpoints<T> {
    const one = (emotion: FaceEmotion) => `${base}/expressions/${emotion}`;
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
        stopDrawing: () => apiSend<ExpressionDrawing>('DELETE', `${base}/expression-drawing`),
    };
}

import { AppError } from './app-error.js';

export class ImageNotFoundError extends AppError {
    constructor() {
        super('404.002.001', 'Image not found.');
    }
}

/** A path that is absolute or climbs out of the image folder. */
export class InvalidImagePathError extends AppError {
    constructor() {
        super('400.002.002', 'Invalid image path.');
    }
}

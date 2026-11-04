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

/** A candidate that is gone: picked, replaced by a newer round, expired, or never made. */
export class ReferenceCandidateNotFoundError extends AppError {
    constructor() {
        super('404.002.003', 'Those candidates are gone. Generate again to pick one.');
    }
}

/** A Reference image is drawn from Appearance, so there is nothing to draw without one. */
export class NoAppearanceError extends AppError {
    constructor() {
        super('422.002.004', "Write the Character's Appearance first; the Reference image is drawn from it.");
    }
}

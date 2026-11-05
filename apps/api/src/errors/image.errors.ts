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

export class SnapshotNotFoundError extends AppError {
    constructor() {
        super('404.002.005', 'No such Snapshot in this Story.');
    }
}

/** A Snapshot job is transient: it is gone once its Snapshot is stored, dismissed, or the API restarted. */
export class SnapshotJobNotFoundError extends AppError {
    constructor() {
        super('404.002.006', 'That Snapshot is no longer being made. Take it again.');
    }
}

/** Retry applies only to a job that failed. */
export class SnapshotJobNotFailedError extends AppError {
    constructor() {
        super('409.002.007', 'That Snapshot is still being made.');
    }
}

/** An upload with no file in its `image` field. */
export class NoImageFileError extends AppError {
    constructor() {
        super('400.002.008', 'Send the picture as the `image` field of a multipart form.');
    }
}

/** An upload whose bytes are not a PNG, JPEG or WebP picture, whatever its name says. */
export class UnsupportedImageError extends AppError {
    constructor() {
        super('415.002.009', 'That file is not a PNG, JPEG or WebP picture.');
    }
}

export class ImageTooLargeError extends AppError {
    constructor(maxMegabytes: number) {
        super('413.002.010', `That picture is too large: at most ${maxMegabytes} MB.`);
    }
}

/** A Snapshot size the Snapshot model is not drawn at (Settings offers 2K only where Venice has it). */
export class SnapshotSizeNotOfferedError extends AppError {
    constructor(model: string, size: string) {
        super('422.002.011', `${model} is not offered at ${size}.`);
    }
}

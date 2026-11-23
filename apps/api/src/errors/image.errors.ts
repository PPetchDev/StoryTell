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

/** A written Snapshot prompt is held only until drawn, replaced by a newer one, an hour old, or the API restarted. */
export class SnapshotPromptNotFoundError extends AppError {
    constructor() {
        super('404.002.012', 'That Snapshot prompt is gone. Write it again.');
    }
}

/** A thumbnail width the store doesn't make (audit H33): the web asks for one of THUMBNAIL_WIDTHS. */
export class InvalidThumbnailWidthError extends AppError {
    constructor(widths: readonly number[]) {
        super('400.002.013', `A thumbnail is ${widths.join(' or ')} pixels wide.`);
    }
}

/** A face square set on the Role's or a Persona's picture when there is no picture (.scratch/your-faces/spec.md). */
export class NoPictureToCropError extends AppError {
    constructor() {
        super('409.003.040', 'Add a picture first: there is no face to pick without one.');
    }
}

/** An uploaded cut-out that is not a PNG or WebP with see-through pixels: a JPEG, or a fully opaque picture such as a painted checkerboard. */
export class NotSeeThroughError extends AppError {
    constructor() {
        super('415.002.014', 'A cut-out must be a PNG or WebP with a see-through background.');
    }
}

/** The app's own background remover was asked for by name where it is not set up (its model file is missing). */
export class OwnCutoutUnavailableError extends AppError {
    constructor() {
        super('409.002.015', "The app's own background remover is not set up on this computer.");
    }
}

/** The soft cut-out was asked for a picture whose background is not one flat, tinted colour (.scratch/soft-cutout/spec.md). */
export class SoftCutoutUnsuitableError extends AppError {
    constructor() {
        super('409.002.016', 'A soft cut-out needs a picture drawn on one flat colour that is not white, grey or black.');
    }
}

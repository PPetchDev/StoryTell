import { AppError } from './app-error.js';

export class StoryNotFoundError extends AppError {
    constructor() {
        super('404.003.001', 'Story not found.');
    }
}

export class CharacterNotFoundError extends AppError {
    constructor() {
        super('404.003.002', 'Character not found in this Story.');
    }
}

export class SceneNotFoundError extends AppError {
    constructor() {
        super('404.003.003', 'Scene not found in this Story.');
    }
}

export class StartingBondNotFoundError extends AppError {
    constructor() {
        super('404.003.004', 'Starting Bond not found in this Story.');
    }
}

/** A Story already has the most Characters it can hold. */
export class CastFullError extends AppError {
    constructor(max: number) {
        super('422.003.005', `A Story can have at most ${max} Characters.`);
    }
}

/** A StartingBond already exists from that Character in that direction. */
export class DuplicateStartingBondError extends AppError {
    constructor() {
        super('409.003.006', 'That Character already has a starting Bond in that direction.');
    }
}

/** A StartingBond from a Character toward itself. */
export class SelfStartingBondError extends AppError {
    constructor() {
        super('422.003.007', 'A Character cannot have a starting Bond toward itself.');
    }
}

/** A reorder that is not a permutation of the Story's own Characters or Scenes. */
export class InvalidOrderError extends AppError {
    constructor(what: 'Characters' | 'Scenes') {
        super('422.003.008', `The order must list every one of the Story's ${what} exactly once.`);
    }
}

/** A Portrait crop for a Character that has no Reference image to crop. */
export class NoReferenceImageError extends AppError {
    constructor() {
        super('409.003.009', 'Add a Reference image first: the chat picture is cropped from it.');
    }
}

/** A Cover is picked from exactly one place: a Snapshot of the Gallery or a Character's Reference image. */
export class InvalidCoverChoiceError extends AppError {
    constructor() {
        super('422.003.010', 'Pick exactly one: a Snapshot (snapshotId) or a Character (characterId).');
    }
}

/** A focus point for a Story that has no Cover to focus. */
export class NoCoverError extends AppError {
    constructor() {
        super('409.003.011', 'Choose a Cover first: the focus point is a spot on its picture.');
    }
}

/** A Cover picked from a Character who has no Reference image. */
export class NoReferenceImageForCoverError extends AppError {
    constructor() {
        super('409.003.012', 'That Character has no Reference image to use as the Cover.');
    }
}

export class LoreEntryNotFoundError extends AppError {
    constructor() {
        super('404.003.013', 'Lore entry not found in this Story.');
    }
}

/** A Lore pattern that does not compile as a regular expression (.scratch/lore-triggers/spec.md: "Matching"); nothing of the write is saved. */
export class InvalidLorePatternError extends AppError {
    constructor(pattern: string, reason: string) {
        super('422.003.014', `The pattern "${pattern}" is not a valid regular expression: ${reason}`);
    }
}

/** A Document whose text is nothing but whitespace (.scratch/documents/spec.md: "Limits"). No call is made. */
export class EmptyDocumentError extends AppError {
    constructor() {
        super('422.003.015', 'The Document has no text. Paste or load some first.');
    }
}

/** A Document over the size limit, refused before any call. */
export class DocumentTooLargeError extends AppError {
    constructor(characters: number, max: number) {
        super(
            '413.003.016',
            `The Document is ${characters.toLocaleString('en-US')} characters; a Document holds at most ${max.toLocaleString('en-US')}. Split or trim it.`,
        );
    }
}

/** A 21st Document, or one that takes the Story past its passage limit, refused before any call. */
export class DocumentLimitError extends AppError {
    constructor(message: string) {
        super('422.003.017', message);
    }
}

/** No Document with that id in this Story: removed, or another Story's. */
export class DocumentNotFoundError extends AppError {
    constructor() {
        super('404.003.018', 'Document not found in this Story.');
    }
}

/**
 * A web page address the API won't fetch (.scratch/documents/spec.md: "Files and web pages"):
 * not http or https, carrying credentials, or naming this PC itself, given or redirected to.
 */
export class InvalidPageAddressError extends AppError {
    constructor(reason: string) {
        super('422.003.019', `${reason} Paste the page's text instead.`);
    }
}

/** A page that couldn't be fetched or read; the message says why. Nothing is stored or spent. */
export class PageFetchError extends AppError {
    constructor(reason: string) {
        super('502.003.020', `${reason} Paste the page's text instead.`);
    }
}

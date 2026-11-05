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

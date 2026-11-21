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
    /** `app`: the user's app-wide list (Replace rules); `story`: one Story's. */
    constructor(what: 'Characters' | 'Scenes' | 'Replace rules', scope: 'story' | 'app' = 'story') {
        const whose = scope === 'app' ? 'your app-wide' : "the Story's";
        super('422.003.008', `The order must list every one of ${whose} ${what} exactly once.`);
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

/** A voice id that is not one of the English voices `speechVoices()` lists (.scratch/read-aloud/spec.md). */
export class UnknownVoiceError extends AppError {
    constructor(voice: string) {
        super('422.003.021', `"${voice}" is not one of the voices this app can read aloud in.`);
    }
}

/** Drawing an Expression for a Character with no Reference image to draw it from (.scratch/expressions/spec.md). */
export class NoReferenceImageToDrawError extends AppError {
    constructor() {
        super('409.003.023', 'Add a Reference image first: Expressions are drawn from it.');
    }
}

/** No Expression for that emotion on that Character (.scratch/expressions/spec.md, "Authoring API"). */
export class ExpressionNotFoundError extends AppError {
    constructor() {
        super('404.003.022', 'That Character has no Expression for that emotion.');
    }
}

/**
 * A Scene's Bond gates that name a Character outside the cast, point a Character at itself, ask for
 * a level outside the axis's range, or set one Bond's axis twice (.scratch/bond-axes/spec.md, "API").
 */
/** A Starting Belief saved with nothing but whitespace (.scratch/memory-by-meaning/spec.md). */
export class EmptyStartingBeliefError extends AppError {
    constructor() {
        super('422.003.025', 'Write what the Character believes.');
    }
}

/** No Sudden event with that id in this Story (.scratch/sudden-events/spec.md). */
export class SuddenEventNotFoundError extends AppError {
    constructor() {
        super('404.003.026', 'Sudden event not found in this Story.');
    }
}

/** A Story already has the most Sudden events it can hold. */
export class SuddenEventLimitError extends AppError {
    constructor(max: number) {
        super('422.003.027', `A Story can have at most ${max} Sudden events.`);
    }
}

/** No Ending with that id in this Story (.scratch/endings/spec.md). */
export class EndingNotFoundError extends AppError {
    constructor() {
        super('404.003.028', 'Ending not found in this Story.');
    }
}

/** A Story already has the most Endings it can hold. */
export class EndingLimitError extends AppError {
    constructor(max: number) {
        super('422.003.029', `A Story can have at most ${max} Endings.`);
    }
}

/** No Lore set with that id for this Account, or one this Story does not link (.scratch/shared-lore/spec.md). */
export class LoreSetNotFoundError extends AppError {
    constructor() {
        super('404.003.030', 'Lore set not found.');
    }
}

/** A Story already links the most Lore sets it can. */
export class LoreSetLimitError extends AppError {
    constructor(max: number) {
        super('422.003.031', `A Story can link at most ${max} Lore sets.`);
    }
}

export class InvalidBondGateError extends AppError {
    constructor(reason: string) {
        super('422.003.024', `That Bond gate can't be set: ${reason}`);
    }
}

/** An Opening questions list that breaks a rule (.scratch/opening-questions/spec.md); the message says which. */
export class InvalidOpeningQuestionsError extends AppError {
    constructor(reason: string) {
        super('422.003.040', `Those Opening questions can't be saved: ${reason}`);
    }
}

/** A Role's Stats that break a rule (.scratch/judge-rolls/spec.md): too many, a bad name, a repeat, or a number out of range. */
export class InvalidStatsError extends AppError {
    constructor(reason: string) {
        super('422.003.041', reason);
    }
}

/** A Role's sections that break a rule (.scratch/role-sections/spec.md): too many, a heading on two lines, or too long. */
export class InvalidRoleSectionsError extends AppError {
    constructor(reason: string) {
        super('422.003.042', reason);
    }
}

/** No Place with that id in this Story (.scratch/places-ahead/spec.md). */
export class PlaceNotFoundError extends AppError {
    constructor() {
        super('404.003.160', 'Place not found in this Story.');
    }
}

/** A Place that breaks a rule (.scratch/places-ahead/spec.md): no name, too long, a name the Story has, or too many. */
export class InvalidPlaceError extends AppError {
    constructor(reason: string) {
        super('422.003.161', reason);
    }
}

/** That Place's picture in that light is being drawn now (.scratch/places-ahead/spec.md). */
export class PlaceBeingDrawnError extends AppError {
    constructor() {
        super('409.003.162', 'That picture is being drawn already.');
    }
}

/** Evening or night asked before day: they are edits of the day picture (.scratch/places-ahead/spec.md). */
export class NoDayPlacePictureError extends AppError {
    constructor() {
        super('409.003.163', 'Draw the day picture first: evening and night are drawn from it.');
    }
}

import { AppError } from './app-error.js';

/** The largest card file read, the same limit as a Cover upload (spec: "Reading a card"). */
export const MAX_CARD_MB = 15;

/** An import or preview with no file in its `card` field. */
export class NoCardFileError extends AppError {
    constructor() {
        super('400.007.001', 'Send the Character card as the `card` field of a multipart form.');
    }
}

/** A file whose bytes are neither a PNG nor JSON text: a WebP, a JPEG, a CHARX zip. */
export class UnsupportedCardError extends AppError {
    constructor() {
        super('415.007.002', "Not a PNG or JSON Character card. CHARX files aren't supported.");
    }
}

/** A card file over the size limit, refused before it is read. */
export class CardTooLargeError extends AppError {
    constructor(maxMegabytes = MAX_CARD_MB) {
        super('413.007.003', `That card is too large: at most ${maxMegabytes} MB.`);
    }
}

/** JSON (or a PNG's card text) that is not a Character card: broken, not an object, or with no name, description or first message. */
export class UnreadableCardError extends AppError {
    constructor(reason = 'It is not a Character card.') {
        super('422.007.004', `This card could not be read. ${reason}`);
    }
}

/** A greeting number that is not one of the card's greetings. */
export class InvalidGreetingError extends AppError {
    constructor(count: number) {
        super('422.007.005', `This card has ${count === 1 ? 'one greeting' : `${count} greetings`}: choose 0${count > 1 ? `–${count - 1}` : ''}.`);
    }
}

/** A PNG with neither a `ccv3` nor a `chara` text chunk: an ordinary picture, not a card. */
export class NoCardInPictureError extends AppError {
    constructor() {
        super('422.007.006', 'This picture has no Character card in it.');
    }
}

/** An export's picture whose bytes are not a PNG: a card must be one. */
export class NotAPngError extends AppError {
    constructor() {
        super('415.007.007', 'The picture for a Character card must be a PNG.');
    }
}

import { AppError } from './app-error.js';

/** A dictation posted with no file in its `audio` field. */
export class NoAudioFileError extends AppError {
    constructor() {
        super('400.009.001', 'No recording was sent.');
    }
}

/** Bytes that are not a WebM, MP4/M4A, Ogg or WAV recording. */
export class UnsupportedAudioError extends AppError {
    constructor() {
        super('415.009.002', 'That is not a recording this app can transcribe.');
    }
}

export class AudioTooLargeError extends AppError {
    constructor(maxMb: number) {
        super('413.009.003', `A recording can be at most ${maxMb} MB.`);
    }
}

/** A recording longer than the two-minute limit allows, with a few seconds' grace. */
export class RecordingTooLongError extends AppError {
    constructor() {
        super('422.009.004', 'A recording can be at most two minutes long.');
    }
}

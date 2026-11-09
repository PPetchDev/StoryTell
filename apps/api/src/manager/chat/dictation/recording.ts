import { RecordingTooLongError, UnsupportedAudioError } from '../../../errors/audio.errors.js';

/** .scratch/dictation/spec.md, "API": two minutes of Opus is about 1 MB and of AAC about 2 MB; Venice takes 25. */
export const MAX_RECORDING_MB = 10;
/** The two-minute limit, with five seconds' grace for the browser's own timing. */
export const MAX_RECORDING_MS = 125_000;

/**
 * A recording's type, read from its first bytes as images' are: a phone's own label is not
 * trusted. WebM (an EBML header), MP4/M4A (`ftyp` at byte 4), Ogg (`OggS`) or WAV
 * (`RIFF` … `WAVE`); anything else is undefined.
 */
export function sniffAudioMimeType(bytes: Buffer): string | undefined {
    if (bytes.length >= 4 && bytes.readUInt32BE(0) === 0x1a45dfa3) return 'audio/webm';
    if (bytes.length >= 8 && bytes.toString('latin1', 4, 8) === 'ftyp') return 'audio/mp4';
    if (bytes.length >= 4 && bytes.toString('latin1', 0, 4) === 'OggS') return 'audio/ogg';
    if (bytes.length >= 12 && bytes.toString('latin1', 0, 4) === 'RIFF' && bytes.toString('latin1', 8, 12) === 'WAVE') {
        return 'audio/wav';
    }
    return undefined;
}

/** The recording's type, or the typed refusal for bytes that aren't one, or one that runs too long. */
export function checkRecording(bytes: Buffer, durationMs: number): string {
    const mimeType = sniffAudioMimeType(bytes);
    if (!mimeType) throw new UnsupportedAudioError();
    if (durationMs > MAX_RECORDING_MS) throw new RecordingTooLongError();
    return mimeType;
}

'use client';

import { useEffect, useRef, useState } from 'react';

import { useConnection } from '@/components/connection';
import { ApiError, ApiUnreachableError } from '@/lib/api';
import { chatApi } from '@/lib/chat';

import styles from './chat-composer.module.css';

/**
 * .scratch/dictation/spec.md, "Web: the composer". 🎤 records in the browser, Done sends the
 * recording to the API, and what was heard is appended to the draft for the user to check: it
 * never sends anything by itself. Nothing is recorded unless 🎤 is tapped, and the phone's
 * microphone is released as soon as a recording finishes or is cancelled.
 */

export type DictationLanguage = 'th' | 'en';

/** A per-device preference, like the List / Graph switch. */
const LANGUAGE_KEY = 'storytell.dictationLanguage';
/** Two minutes at most; the timer warns from 1:45, and at 2:00 the recording finishes as Done. */
export const MAX_RECORDING_MS = 120_000;
const WARN_FROM_MS = 105_000;
/** Shorter than this is an accidental tap: dropped, never sent. */
const MIN_RECORDING_MS = 1_000;
/** iPhone Safari records MP4, Android Chrome WebM; Venice takes both, so nothing is transcoded. */
const RECORDER_TYPES = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'];

const VENICE_OUT = '402.001.004';

/** The dictated text after the draft: one space between them unless the draft is empty or already ends in whitespace. */
export function appendDictation(draft: string, text: string): string {
    if (draft === '' || /\s$/.test(draft)) return draft + text;
    return `${draft} ${text}`;
}

/** "0:07", "1:45". */
export function clock(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function readLanguage(): DictationLanguage {
    try {
        return window.localStorage.getItem(LANGUAGE_KEY) === 'en' ? 'en' : 'th';
    } catch {
        return 'th';
    }
}

function saveLanguage(language: DictationLanguage): void {
    try {
        window.localStorage.setItem(LANGUAGE_KEY, language);
    } catch {
        // Storage is blocked: the choice lasts until the page reloads.
    }
}

/** Where dictation is: nothing (perhaps with a note), asking for the mic, recording, transcribing, or failed with the audio kept. */
type Phase =
    | { kind: 'idle'; note: string | null }
    | { kind: 'starting' }
    | { kind: 'recording' }
    | { kind: 'transcribing' }
    | { kind: 'failed'; message: string };

interface Kept {
    recording: Blob;
    durationMs: number;
    language: DictationLanguage;
}

/** What a recorder in progress needs when it stops. */
interface Live {
    recorder: MediaRecorder;
    stream: MediaStream;
    chunks: Blob[];
    startedAt: number;
    /** How the recording ends: kept and sent, or thrown away. */
    ending: 'done' | 'cancel' | null;
    durationMs: number;
}

export function useDictation(storyId: number, chatId: number, draft: string, onDraft: (text: string) => void) {
    const { reportUnreachable } = useConnection();
    const [supported, setSupported] = useState(false);
    const [language, setLanguageState] = useState<DictationLanguage>('th');
    const [phase, setPhase] = useState<Phase>({ kind: 'idle', note: null });
    const [elapsedMs, setElapsedMs] = useState(0);
    const live = useRef<Live | null>(null);
    /** The browser is being asked for the mic; Cancel meanwhile turns it false, and the stream is then closed unused. */
    const starting = useRef(false);
    const kept = useRef<Kept | null>(null);
    const asked = useRef(0);
    const mounted = useRef(true);
    // The latest draft and language, read when a recording's text comes back.
    const latest = useRef({ draft, onDraft, language });
    latest.current = { draft, onDraft, language };

    useEffect(() => {
        setSupported(typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined');
        setLanguageState(readLanguage());
    }, []);

    // A note says its piece until the box changes or 🎤 is tapped again.
    useEffect(() => {
        setPhase((current) => (current.kind === 'idle' && current.note ? { kind: 'idle', note: null } : current));
    }, [draft]);

    const setLanguage = (next: DictationLanguage) => {
        setLanguageState(next);
        saveLanguage(next);
    };

    const transcribe = async () => {
        const recording = kept.current;
        if (!recording) return;
        const ask = ++asked.current;
        setPhase({ kind: 'transcribing' });
        try {
            const { text } = await chatApi.dictate(storyId, chatId, recording.recording, recording.language, recording.durationMs);
            if (!mounted.current || asked.current !== ask) return;
            kept.current = null;
            if (text.trim() === '') {
                setPhase({ kind: 'idle', note: "Didn't catch anything." });
                return;
            }
            // Not focused: the phone's keyboard would jump up over the result.
            latest.current.onDraft(appendDictation(latest.current.draft, text.trim()));
            setPhase({ kind: 'idle', note: null });
        } catch (caught) {
            if (!mounted.current || asked.current !== ask) return;
            if (caught instanceof ApiUnreachableError) reportUnreachable();
            const creditOut = caught instanceof ApiError && caught.code === VENICE_OUT;
            setPhase({ kind: 'failed', message: creditOut ? 'Venice credit is used up.' : "Couldn't transcribe that." });
        }
    };

    /** The recorder has handed over its last chunk: the recording is sent, dropped as too short, or thrown away. */
    const stopped = (ended: Live) => {
        if (!mounted.current) return;
        if (ended.ending !== 'done') {
            setPhase({ kind: 'idle', note: null });
            return;
        }
        if (ended.durationMs < MIN_RECORDING_MS) {
            setPhase({ kind: 'idle', note: 'That was too short.' });
            return;
        }
        const type = ended.recorder.mimeType || ended.chunks[0]?.type || 'audio/webm';
        kept.current = { recording: new Blob(ended.chunks, { type }), durationMs: ended.durationMs, language: latest.current.language };
        void transcribe();
    };

    /** Ends the recording in progress: its tracks stop at once, so the phone's mic light goes off. */
    const finish = (ending: 'done' | 'cancel') => {
        const current = live.current;
        if (!current) {
            // Cancel while the browser still asks for the mic: the stream that arrives is closed unused.
            if (ending === 'cancel' && starting.current) {
                starting.current = false;
                setPhase({ kind: 'idle', note: null });
            }
            return;
        }
        if (current.ending) return;
        current.ending = ending;
        current.durationMs = performance.now() - current.startedAt;
        live.current = null;
        current.stream.getTracks().forEach((track) => track.stop());
        if (current.recorder.state === 'inactive') stopped(current);
        else current.recorder.stop();
    };

    const start = async () => {
        if (phase.kind === 'starting' || phase.kind === 'recording' || phase.kind === 'transcribing') return;
        // A new recording replaces one kept for Retry.
        kept.current = null;
        asked.current++;
        starting.current = true;
        setPhase({ kind: 'starting' });
        let stream: MediaStream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (caught) {
            if (!mounted.current || !starting.current) return;
            starting.current = false;
            const name = (caught as DOMException)?.name;
            const note =
                name === 'NotAllowedError' || name === 'SecurityError'
                    ? "The microphone is blocked. Allow it for this site in your browser's settings, then try again."
                    : name === 'NotFoundError' || name === 'OverconstrainedError'
                      ? 'No microphone found.'
                      : "Couldn't start the microphone.";
            setPhase({ kind: 'idle', note });
            return;
        }
        const release = () => stream.getTracks().forEach((track) => track.stop());
        // Cancelled, or the Chat left, while the browser asked: nothing is recorded.
        if (!mounted.current || !starting.current) {
            release();
            return;
        }
        starting.current = false;
        const mimeType = RECORDER_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
        let recorder: MediaRecorder;
        try {
            recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
            recorder.start();
        } catch {
            release();
            setPhase({ kind: 'idle', note: "Couldn't start the microphone." });
            return;
        }
        const current: Live = { recorder, stream, chunks: [], startedAt: performance.now(), ending: null, durationMs: 0 };
        recorder.ondataavailable = (event) => {
            if (event.data.size > 0) current.chunks.push(event.data);
        };
        recorder.onstop = () => stopped(current);
        live.current = current;
        setElapsedMs(0);
        setPhase({ kind: 'recording' });
    };

    const recording = phase.kind === 'recording';

    // The timer, and the automatic finish at two minutes.
    useEffect(() => {
        if (!recording) return;
        const tick = () => {
            const current = live.current;
            if (!current) return;
            const elapsed = performance.now() - current.startedAt;
            setElapsedMs(elapsed);
            if (elapsed >= MAX_RECORDING_MS) finish('done');
        };
        const timer = window.setInterval(tick, 250);
        return () => window.clearInterval(timer);
    }, [recording]);

    // Switching app or locking the phone finishes the recording: losing speech is worse than a fraction of a cent.
    useEffect(() => {
        if (!recording) return;
        const onHidden = () => {
            if (document.visibilityState === 'hidden') finish('done');
        };
        document.addEventListener('visibilitychange', onHidden);
        return () => document.removeEventListener('visibilitychange', onHidden);
    }, [recording]);

    // Leaving the Chat cancels a recording and drops a late transcription.
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
            asked.current++;
            const current = live.current;
            if (current) {
                current.ending = 'cancel';
                live.current = null;
                current.stream.getTracks().forEach((track) => track.stop());
                if (current.recorder.state !== 'inactive') current.recorder.stop();
            }
        };
    }, []);

    const discard = () => {
        kept.current = null;
        setPhase({ kind: 'idle', note: null });
    };

    return {
        supported,
        language,
        setLanguage,
        phase,
        elapsedMs,
        /** Recording, asking for the mic, or transcribing: ⚡ and ✍️ wait, and the box takes nothing new. */
        active: phase.kind === 'starting' || phase.kind === 'recording' || phase.kind === 'transcribing',
        recording: phase.kind === 'recording' || phase.kind === 'starting',
        transcribing: phase.kind === 'transcribing',
        start: () => void start(),
        done: () => finish('done'),
        cancel: () => finish('cancel'),
        retry: () => void transcribe(),
        discard,
    };
}

export type Dictation = ReturnType<typeof useDictation>;

/** The panel's dictation line: the wait, a failure with Retry and Discard, or a short note. */
export function DictationStatus({ dictation }: { dictation: Dictation }) {
    const { phase } = dictation;
    if (phase.kind === 'transcribing') {
        return (
            <p className={styles.suggesting} role="status">
                Transcribing…
            </p>
        );
    }
    if (phase.kind === 'failed') {
        return (
            <p role="alert" className="turn-error">
                {phase.message}{' '}
                <button type="button" className="button button-quiet" onClick={dictation.retry}>
                    Retry
                </button>{' '}
                <button type="button" className="button button-quiet" onClick={dictation.discard}>
                    Discard
                </button>
            </p>
        );
    }
    if (phase.kind === 'idle' && phase.note) {
        return (
            <p className={styles.suggesting} role="status">
                {phase.note}
            </p>
        );
    }
    return null;
}

/** Whether the panel has a dictation line to show. */
export function hasDictationStatus(dictation: Dictation): boolean {
    const { phase } = dictation;
    return phase.kind === 'transcribing' || phase.kind === 'failed' || (phase.kind === 'idle' && phase.note !== null);
}

/** 🎤 in the box row, between the box and the send slot. */
export function DictateButton({ dictation, disabledReason }: { dictation: Dictation; disabledReason: string | null }) {
    return (
        <button
            type="button"
            className={styles.mic}
            aria-label="Dictate"
            title={disabledReason ?? 'Speak instead of typing'}
            aria-busy={dictation.transcribing}
            disabled={disabledReason !== null || dictation.active}
            onClick={dictation.start}
        >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="9" y="3" width="6" height="11" rx="3" />
                <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
            </svg>
        </button>
    );
}

/** The box row while recording: ✕ Cancel, the red dot and time, the language switch, ✓ Done. */
export function RecordingBar({ dictation }: { dictation: Dictation }) {
    const { language, elapsedMs } = dictation;
    const warning = elapsedMs >= WARN_FROM_MS;
    return (
        <div className={styles.recordingBar} role="group" aria-label="Recording">
            <button type="button" className={styles.tool} aria-label="Cancel" title="Throw this recording away" onClick={dictation.cancel}>
                <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    <path d="M6 6l12 12M18 6L6 18" />
                </svg>
            </button>
            <span className={styles.recDot} aria-hidden="true" />
            <span role="timer" aria-live="off" className={`${styles.recTime} ${warning ? styles.recTimeWarn : ''}`}>
                {clock(elapsedMs)}
            </span>
            <button
                type="button"
                className={styles.language}
                aria-label="Dictation language"
                title={language === 'th' ? 'Thai: tap for English' : 'English: tap for Thai'}
                onClick={() => dictation.setLanguage(language === 'th' ? 'en' : 'th')}
            >
                {language === 'th' ? 'ไทย' : 'EN'}
            </button>
            <button
                type="button"
                className={styles.send}
                aria-label="Done"
                title="Stop and transcribe"
                disabled={dictation.phase.kind !== 'recording'}
                onClick={dictation.done}
            >
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
            </button>
        </div>
    );
}

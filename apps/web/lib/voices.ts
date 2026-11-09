'use client';

import { useEffect, useState } from 'react';

import { apiAudio, apiFetch } from './api';

/** A Kokoro voice (.scratch/read-aloud/spec.md, "Voices on the Story and its Characters"). English only. */
export interface SpeechVoice {
    id: string;
    /** e.g. "Sky — American, female". */
    label: string;
    accent: 'american' | 'british';
    gender: 'female' | 'male';
}

export interface VoiceList {
    voices: SpeechVoice[];
    /** The voice a Story with no Narration voice is read in. */
    defaultNarrationVoice: string;
}

/** The API's default Narration voice, for the moment before the voice list has loaded. */
export const DEFAULT_NARRATION_VOICE = 'af_sky';

/** The select's groups, in order. */
export const VOICE_GROUPS: Array<{ accent: SpeechVoice['accent']; gender: SpeechVoice['gender']; label: string }> = [
    { accent: 'american', gender: 'female', label: 'American, female' },
    { accent: 'american', gender: 'male', label: 'American, male' },
    { accent: 'british', gender: 'female', label: 'British, female' },
    { accent: 'british', gender: 'male', label: 'British, male' },
];

let voiceList: Promise<VoiceList> | undefined;

/** The voice list, read once per page load (it makes no paid call); a failure is asked again next time. */
export function loadVoices(): Promise<VoiceList> {
    voiceList ??= apiFetch<VoiceList>('/voices').catch((error: unknown) => {
        voiceList = undefined;
        throw error;
    });
    return voiceList;
}

/** The voice list once it has loaded; null before that, or when it couldn't be read. */
export function useVoices(): VoiceList | null {
    const [list, setList] = useState<VoiceList | null>(null);
    useEffect(() => {
        let live = true;
        loadVoices().then(
            (loaded) => live && setList(loaded),
            () => {},
        );
        return () => {
            live = false;
        };
    }, []);
    return list;
}

/** A voice's name alone: "Sky" from "Sky — American, female", or from the id when it isn't listed. */
export function voiceName(voiceId: string, voices: SpeechVoice[] | undefined): string {
    const listed = voices?.find((voice) => voice.id === voiceId);
    if (listed) return listed.label.split(' — ')[0];
    const name = voiceId.slice(voiceId.indexOf('_') + 1);
    return name.charAt(0).toUpperCase() + name.slice(1);
}

/** A voice's sample: made once per voice (a fraction of a cent), then served from the API's disk for free. */
export function voiceSample(voiceId: string): Promise<Blob> {
    return apiAudio(`/voices/${encodeURIComponent(voiceId)}/preview`);
}

import { Injectable } from '@nestjs/common';

import { OutOfCreditError } from '../../errors/model-gateway.errors.js';
import { UnknownVoiceError } from '../../errors/story.errors.js';
import { DEFAULT_DUB_NARRATION_VOICE, DEFAULT_DUB_VOICE, DEFAULT_NARRATION_VOICE, DUB_SPEECH_MODEL, ModelGateway, SpeechModel, SpeechVoice } from '../../service/model-gateway/model-gateway.js';
import { venicePoolUsedUp } from '../../service/model-gateway/venice-pool.js';
import { SpeechStoreService } from '../../store/speech/speech-store.service.js';

/** What every voice sample says (.scratch/read-aloud/spec.md, "Voice sample"). */
export const VOICE_SAMPLE_TEXT = 'The lamp went out an hour ago, and the sea kept talking.';

/** What a Japanese voice's sample says (.scratch/japanese-dub/spec.md). */
export const DUB_SAMPLE_TEXT = 'ランプが消えてから、もう一時間。それでも海は、ずっと話し続けていた。';

export interface VoiceList {
    voices: SpeechVoice[];
    /** The voice a Story with no Narration voice is read in. */
    defaultNarrationVoice: string;
    /** A Japanese dub's voices for spoken lines (Qwen 3), and the one a Character with none is read in. */
    dubVoices: string[];
    defaultDubVoice: string;
    /** A Japanese dub's narration voices (Kokoro), and the one a Story with none is read in. */
    dubNarrationVoices: string[];
    defaultDubNarrationVoice: string;
}

/** The voices the Story editor offers (.scratch/read-aloud/spec.md, "Voices on the Story and its Characters"). */
@Injectable()
export class VoiceManagerService {
    constructor(
        private readonly gateway: ModelGateway,
        private readonly speechStore: SpeechStoreService,
    ) {}

    /** Makes no paid call: the gateway reads Venice's free models list, or its stored one. */
    async list(): Promise<VoiceList> {
        const dub = await this.gateway.dubVoices();
        return {
            voices: await this.gateway.speechVoices(),
            defaultNarrationVoice: DEFAULT_NARRATION_VOICE,
            dubVoices: dub.speech,
            defaultDubVoice: DEFAULT_DUB_VOICE,
            dubNarrationVoices: dub.narration,
            defaultDubNarrationVoice: DEFAULT_DUB_NARRATION_VOICE,
        };
    }

    /** Refuses a dub voice id its list doesn't have; null (a default) and unsent pass. */
    async requireKnownDub(voiceId: string | null | undefined, use: 'speech' | 'narration'): Promise<void> {
        if (voiceId === undefined || voiceId === null) return;
        if (!(await this.gateway.dubVoices())[use].includes(voiceId)) throw new UnknownVoiceError(voiceId);
    }

    /**
     * A voice's sample as MP3 bytes. Each voice's sample is made once (kind `voice_preview`, no
     * Story) and kept in the speech folder's `samples/`; every later sample of that voice comes
     * from disk with no call. Samples are never swept.
     */
    /** Refuses a voice id the voice list doesn't have; null (a default) and unsent pass. */
    async requireKnown(voiceId: string | null | undefined): Promise<void> {
        if (voiceId === undefined || voiceId === null) return;
        const voices = await this.gateway.speechVoices();
        if (!voices.some((voice) => voice.id === voiceId)) throw new UnknownVoiceError(voiceId);
    }

    async sample(voiceId: string): Promise<Buffer> {
        // A Japanese voice says the Japanese sentence (.scratch/japanese-dub/spec.md): Qwen 3's in Japanese, Kokoro's Japanese ones as they are.
        const dub = await this.gateway.dubVoices();
        const request = dub.speech.includes(voiceId)
            ? { text: DUB_SAMPLE_TEXT, voice: voiceId, model: DUB_SPEECH_MODEL as SpeechModel, language: 'Japanese', prompt: 'Warm and calm, telling a story.' }
            : dub.narration.includes(voiceId)
              ? { text: DUB_SAMPLE_TEXT, voice: voiceId }
              : null;
        if (!request) await this.requireKnown(voiceId);
        const relativePath = request?.model ? `samples/${request.model}-${voiceId}.mp3` : `samples/${voiceId}.mp3`;
        const kept = await this.speechStore.read(relativePath);
        if (kept) return kept;
        if (await venicePoolUsedUp(this.gateway)) throw new OutOfCreditError('image');
        const { audio } = await this.gateway.synthesizeSpeech({ kind: 'voice_preview', ...(request ?? { text: VOICE_SAMPLE_TEXT, voice: voiceId }) });
        await this.speechStore.write(relativePath, audio.bytes);
        return audio.bytes;
    }
}

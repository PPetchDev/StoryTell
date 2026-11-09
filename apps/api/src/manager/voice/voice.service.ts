import { Injectable } from '@nestjs/common';

import { OutOfCreditError } from '../../errors/model-gateway.errors.js';
import { UnknownVoiceError } from '../../errors/story.errors.js';
import { DEFAULT_NARRATION_VOICE, ModelGateway, SpeechVoice } from '../../service/model-gateway/model-gateway.js';
import { venicePoolUsedUp } from '../../service/model-gateway/venice-pool.js';
import { SpeechStoreService } from '../../store/speech/speech-store.service.js';

/** What every voice sample says (.scratch/read-aloud/spec.md, "Voice sample"). */
export const VOICE_SAMPLE_TEXT = 'The lamp went out an hour ago, and the sea kept talking.';

export interface VoiceList {
    voices: SpeechVoice[];
    /** The voice a Story with no Narration voice is read in. */
    defaultNarrationVoice: string;
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
        return { voices: await this.gateway.speechVoices(), defaultNarrationVoice: DEFAULT_NARRATION_VOICE };
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
        await this.requireKnown(voiceId);
        const relativePath = `samples/${voiceId}.mp3`;
        const kept = await this.speechStore.read(relativePath);
        if (kept) return kept;
        if (await venicePoolUsedUp(this.gateway)) throw new OutOfCreditError('image');
        const { audio } = await this.gateway.synthesizeSpeech({ kind: 'voice_preview', text: VOICE_SAMPLE_TEXT, voice: voiceId });
        await this.speechStore.write(relativePath, audio.bytes);
        return audio.bytes;
    }
}

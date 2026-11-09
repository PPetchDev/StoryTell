import { ApiProperty } from '@nestjs/swagger';

import { VoiceList } from '../../../manager/voice/voice.service.js';

import type { SpeechVoice, VoiceAccent, VoiceGender } from '../../../service/model-gateway/model-gateway.js';

export class SpeechVoiceDTO implements SpeechVoice {
    @ApiProperty({ description: "Kokoro's voice id.", example: 'af_sky' })
    id: string;

    @ApiProperty({ description: 'Built from the id.', example: 'Sky — American, female' })
    label: string;

    @ApiProperty({ enum: ['american', 'british'] })
    accent: VoiceAccent;

    @ApiProperty({ enum: ['female', 'male'] })
    gender: VoiceGender;
}

export class VoiceListResponseBodyDTO implements VoiceList {
    @ApiProperty({ type: [SpeechVoiceDTO], description: 'The English voices, in the order Venice lists them.' })
    voices: SpeechVoiceDTO[];

    @ApiProperty({ description: 'The voice a Story with no Narration voice is read in.', example: 'af_sky' })
    defaultNarrationVoice: string;
}

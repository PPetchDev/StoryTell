import { Module } from '@nestjs/common';

import { SpeechStoreModule } from '../../store/speech/speech-store.module.js';
import { VoiceManagerService } from './voice.service.js';

@Module({
    imports: [SpeechStoreModule],
    providers: [VoiceManagerService],
    exports: [VoiceManagerService],
})
export class VoiceManagerModule {}

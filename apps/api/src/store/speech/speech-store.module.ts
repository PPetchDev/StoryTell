import { Module } from '@nestjs/common';

import { SpeechStoreService } from './speech-store.service.js';

@Module({
    providers: [SpeechStoreService],
    exports: [SpeechStoreService],
})
export class SpeechStoreModule {}

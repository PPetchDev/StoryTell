import { Module } from '@nestjs/common';

import { VoiceManagerModule } from '../../manager/voice/voice.module.js';
import { VoiceApiController } from './voice.controller.js';

@Module({
    imports: [VoiceManagerModule],
    controllers: [VoiceApiController],
})
export class VoiceApiModule {}

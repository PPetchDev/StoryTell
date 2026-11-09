import { Controller, Get, Header, HttpCode, Param, Post, StreamableFile } from '@nestjs/common';
import { ApiOkResponse, ApiParam, ApiProduces, ApiTags } from '@nestjs/swagger';

import { VoiceManagerService } from '../../manager/voice/voice.service.js';
import { VoiceListResponseBodyDTO } from './dto/voice.response.dto.js';

@ApiTags('Voices')
@Controller('voices')
export class VoiceApiController {
    constructor(private readonly voiceManager: VoiceManagerService) {}

    @Get()
    @ApiOkResponse({ type: VoiceListResponseBodyDTO, description: 'Makes no paid call.' })
    list(): Promise<VoiceListResponseBodyDTO> {
        return this.voiceManager.list();
    }

    /** A POST because the first sample of a voice spends credit; every later one is served from disk. */
    @Post(':voiceId/preview')
    @HttpCode(200)
    @Header('Cache-Control', 'no-store')
    @ApiParam({ name: 'voiceId', description: 'A voice id from GET /api/voices.' })
    @ApiProduces('audio/mpeg')
    @ApiOkResponse({ description: "The voice reading a fixed sentence: made once per voice, then kept." })
    async preview(@Param('voiceId') voiceId: string): Promise<StreamableFile> {
        return new StreamableFile(await this.voiceManager.sample(voiceId), { type: 'audio/mpeg' });
    }
}

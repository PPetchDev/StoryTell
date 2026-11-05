import { Controller, Get, Param, ParseIntPipe, Res } from '@nestjs/common';
import { ApiOkResponse, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { ChatTranscriptManagerService } from '../../manager/chat/transcript.service.js';

const Id = (name: string) => Param(name, ParseIntPipe);

/** Spec: "Download a Chat as text". Its own controller, beside the Chat's play endpoints. */
@ApiTags('Chats')
@Controller('stories/:storyId/chats')
export class ChatTranscriptApiController {
    constructor(private readonly transcripts: ChatTranscriptManagerService) {}

    @Get(':chatId/transcript')
    @ApiProduces('text/plain')
    @ApiOkResponse({
        description:
            'The Chat as plain text, as an attachment: a title line, then every Message in order, ' +
            'the user\'s lines as "Name: …" and the AI\'s narration and speech as readable text.',
    })
    async transcript(
        @Id('storyId') storyId: number,
        @Id('chatId') chatId: number,
        @Res({ passthrough: true }) response: Response,
    ): Promise<string> {
        const transcript = await this.transcripts.transcript(storyId, chatId);
        response.setHeader('Content-Type', 'text/plain; charset=utf-8');
        response.setHeader(
            'Content-Disposition',
            `attachment; filename="${transcript.asciiFileName}"; filename*=UTF-8''${encodeRfc5987(transcript.fileName)}`,
        );
        return transcript.text;
    }
}

/** RFC 5987 percent-encoding: `encodeURIComponent` leaves a few characters that must be escaped too. */
function encodeRfc5987(value: string): string {
    return encodeURIComponent(value).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

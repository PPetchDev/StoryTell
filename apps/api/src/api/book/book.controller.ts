import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, Put, Res, StreamableFile } from '@nestjs/common';
import { ApiOkResponse, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { BookManagerService } from '../../manager/chat/book/book.service.js';
import { BookResponseBodyDTO, SaveBookChapterRequestBodyDTO, WriteBookRequestBodyDTO } from './dto/book.dto.js';

const Id = (name: string) => Param(name, ParseIntPipe);

/**
 * Turn a Chat into a novel (.scratch/chat-novel/spec.md): the Book, one Book chapter per ended Chapter,
 * written on the user's request, edited by hand, and downloaded as an EPUB.
 */
@ApiTags('Book')
@Controller('stories/:storyId/chats/:chatId/book')
export class BookApiController {
    constructor(private readonly book: BookManagerService) {}

    @Get()
    @ApiOkResponse({ type: BookResponseBodyDTO })
    view(@Id('storyId') storyId: number, @Id('chatId') chatId: number): Promise<BookResponseBodyDTO> {
        return this.book.view(storyId, chatId);
    }

    /** Writes the chapters named, or Write all, in the background; the Book shows them waiting, then being written. */
    @Post('write')
    @HttpCode(200)
    @ApiOkResponse({ type: BookResponseBodyDTO })
    write(@Id('storyId') storyId: number, @Id('chatId') chatId: number, @Body() body: WriteBookRequestBodyDTO): Promise<BookResponseBodyDTO> {
        return this.book.write(storyId, chatId, body.numbers);
    }

    @Put('chapters/:number')
    @ApiOkResponse({ type: BookResponseBodyDTO, description: "Saved as the user's own text." })
    save(
        @Id('storyId') storyId: number,
        @Id('chatId') chatId: number,
        @Id('number') number: number,
        @Body() body: SaveBookChapterRequestBodyDTO,
    ): Promise<BookResponseBodyDTO> {
        return this.book.save(storyId, chatId, number, body.title, body.text);
    }

    @Delete('chapters/:number')
    @ApiOkResponse({ type: BookResponseBodyDTO })
    remove(@Id('storyId') storyId: number, @Id('chatId') chatId: number, @Id('number') number: number): Promise<BookResponseBodyDTO> {
        return this.book.remove(storyId, chatId, number);
    }

    @Get('epub')
    @ApiProduces('application/epub+zip')
    @ApiOkResponse({ description: 'The whole Book as an EPUB, as an attachment named after the Story and the Chat.' })
    async epub(@Id('storyId') storyId: number, @Id('chatId') chatId: number, @Res({ passthrough: true }) response: Response): Promise<StreamableFile> {
        const file = await this.book.epub(storyId, chatId);
        response.setHeader('Content-Disposition', `attachment; filename="${file.asciiFileName}"; filename*=UTF-8''${encodeRfc5987(file.fileName)}`);
        return new StreamableFile(file.bytes, { type: 'application/epub+zip', length: file.bytes.length });
    }
}

/** RFC 5987 percent-encoding: `encodeURIComponent` leaves a few characters that must be escaped too. */
function encodeRfc5987(value: string): string {
    return encodeURIComponent(value).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

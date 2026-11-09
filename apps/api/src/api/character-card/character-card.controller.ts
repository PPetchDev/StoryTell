import {
    ArgumentsHost,
    Body,
    Catch,
    Controller,
    ExceptionFilter,
    HttpCode,
    Param,
    ParseIntPipe,
    PayloadTooLargeException,
    Post,
    Res,
    StreamableFile,
    UploadedFile,
    UseFilters,
    UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiCreatedResponse, ApiOkResponse, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { CardTooLargeError, MAX_CARD_MB, NoCardFileError } from '../../errors/character-card.errors.js';
import { ImageTooLargeError, NoImageFileError } from '../../errors/image.errors.js';
import { AppErrorFilter } from '../../filter/app-error.filter.js';
import { CharacterCardManagerService } from '../../manager/character-card/character-card.service.js';
import { StoryResponseBodyDTO } from '../story/dto/story.response.dto.js';
import { CardFileRequestBodyDTO, ExportCardRequestBodyDTO, ImportCardRequestBodyDTO } from './dto/character-card.request.dto.js';
import { CardPreviewResponseBodyDTO } from './dto/character-card.response.dto.js';

/** The part of a multer file this controller reads. */
interface UploadedCard {
    buffer: Buffer;
}

/** Multer's size limit surfaces as Nest's 413, before the card is read; answer it with the typed error. */
@Catch(PayloadTooLargeException)
class CardTooLargeFilter implements ExceptionFilter {
    catch(_exception: PayloadTooLargeException, host: ArgumentsHost): void {
        new AppErrorFilter().catch(new CardTooLargeError(MAX_CARD_MB), host);
    }
}

/** The export's picture over the limit: the same answer as any picture upload. */
@Catch(PayloadTooLargeException)
class PictureTooLargeFilter implements ExceptionFilter {
    catch(_exception: PayloadTooLargeException, host: ArgumentsHost): void {
        new AppErrorFilter().catch(new ImageTooLargeError(MAX_CARD_MB), host);
    }
}

const Id = (name: string) => Param(name, ParseIntPipe);

/** RFC 5987 percent-encoding: `encodeURIComponent` leaves a few characters that must be escaped too. */
function encodeRfc5987(value: string): string {
    return encodeURIComponent(value).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

const cardUpload = () => FileInterceptor('card', { limits: { fileSize: MAX_CARD_MB * 1024 * 1024, files: 1 } });

/**
 * Character cards (spec: "Character cards"): a PNG or JSON card becomes a new Story by a fixed
 * mapping. No model call is made and no usage is recorded.
 */
@ApiTags('Stories')
@Controller('stories')
export class CharacterCardApiController {
    constructor(private readonly cards: CharacterCardManagerService) {}

    @Post('from-card/preview')
    @HttpCode(200)
    @UseFilters(CardTooLargeFilter)
    @UseInterceptors(cardUpload())
    @ApiConsumes('multipart/form-data')
    @ApiBody({ type: CardFileRequestBodyDTO })
    @ApiOkResponse({ type: CardPreviewResponseBodyDTO, description: 'What an import of this card would make. Nothing is written.' })
    preview(@UploadedFile() file: UploadedCard | undefined): Promise<CardPreviewResponseBodyDTO> {
        if (!file) throw new NoCardFileError();
        return this.cards.preview(file.buffer);
    }

    @Post('from-card')
    @UseFilters(CardTooLargeFilter)
    @UseInterceptors(cardUpload())
    @ApiConsumes('multipart/form-data')
    @ApiBody({ type: ImportCardRequestBodyDTO })
    @ApiCreatedResponse({ type: StoryResponseBodyDTO, description: 'The new Story made from the card, saved.' })
    importCard(
        @UploadedFile() file: UploadedCard | undefined,
        @Body() body: ImportCardRequestBodyDTO,
    ): Promise<StoryResponseBodyDTO> {
        if (!file) throw new NoCardFileError();
        return this.cards.importCard(file.buffer, { roleName: body.roleName, greeting: body.greeting ?? 0 });
    }

    @Post(':storyId/characters/:characterId/card')
    @HttpCode(200)
    @UseFilters(PictureTooLargeFilter)
    @UseInterceptors(FileInterceptor('image', { limits: { fileSize: MAX_CARD_MB * 1024 * 1024, files: 1 } }))
    @ApiConsumes('multipart/form-data')
    @ApiBody({ type: ExportCardRequestBodyDTO })
    @ApiProduces('image/png')
    @ApiOkResponse({
        description:
            "The picture with the Character's V2 (`chara`) and V3 (`ccv3`) definitions written into it, as an attachment named after the Character.",
    })
    async exportCard(
        @Id('storyId') storyId: number,
        @Id('characterId') characterId: number,
        @UploadedFile() file: UploadedCard | undefined,
        @Res({ passthrough: true }) response: Response,
    ): Promise<StreamableFile> {
        if (!file) throw new NoImageFileError();
        const card = await this.cards.exportCard(storyId, characterId, file.buffer);
        response.setHeader('Content-Type', 'image/png');
        response.setHeader(
            'Content-Disposition',
            `attachment; filename="${card.asciiFileName}"; filename*=UTF-8''${encodeRfc5987(card.fileName)}`,
        );
        return new StreamableFile(card.png, { type: 'image/png' });
    }
}

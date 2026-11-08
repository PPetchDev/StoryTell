import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

import { MAX_CARD_MB } from '../../../errors/character-card.errors.js';
import { ROLE_NAME_MAX } from '../../../manager/character-card/card-mapping.js';
import { CardImportRequest } from '../../../manager/character-card/character-card.service.js';

/** Swagger's picture of the card upload. */
export class CardFileRequestBodyDTO {
    @ApiProperty({ type: 'string', format: 'binary', description: `A PNG or JSON Character card (V1, V2 or V3), at most ${MAX_CARD_MB} MB.` })
    card: unknown;
}

/** The import's form fields beside the `card` file. */
export class ImportCardRequestBodyDTO implements CardImportRequest {
    @ApiProperty({ type: 'string', format: 'binary', description: `A PNG or JSON Character card (V1, V2 or V3), at most ${MAX_CARD_MB} MB.` })
    card?: unknown;

    @ApiProperty({ description: "The name the user plays under: the Role's name, and what `{{user}}` becomes.", maxLength: ROLE_NAME_MAX })
    @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
    @IsString()
    @IsNotEmpty({ message: 'Type the name you will play under.' })
    @MaxLength(ROLE_NAME_MAX)
    roleName: string;

    @ApiPropertyOptional({ description: 'Which greeting becomes the Opening: 0 is the first message, 1..n the alternate greetings.', default: 0 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    greeting: number = 0;
}

/** Swagger's picture of the export's upload. */
export class ExportCardRequestBodyDTO {
    @ApiProperty({ type: 'string', format: 'binary', description: `The card's picture as a PNG, at most ${MAX_CARD_MB} MB: the web draws it.` })
    image: unknown;
}

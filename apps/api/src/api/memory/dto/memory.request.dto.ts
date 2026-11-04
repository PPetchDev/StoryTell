import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

// A fact is a sentence or two; this refuses a runaway client, not a long note.
const TEXT_MAX = 2_000;
const KNOWN_BY_MAX = 6;

export class AddMemoryRequestBodyDTO {
    @ApiProperty({ description: 'The fact. Write `{user}` where it names the user, so it reads right after a Persona switch.' })
    @IsString()
    @MaxLength(TEXT_MAX)
    text: string;

    @ApiPropertyOptional({
        type: [Number],
        description: 'Character ids that know it. Left out, the Characters present in the latest exchange.',
    })
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(KNOWN_BY_MAX)
    @IsInt({ each: true })
    knownBy?: number[];
}

export class EditMemoryRequestBodyDTO {
    @ApiPropertyOptional({ description: 'The new text; left out, the text stays.' })
    @IsOptional()
    @IsString()
    @MaxLength(TEXT_MAX)
    text?: string;

    @ApiPropertyOptional({ type: [Number], description: 'The new Known-by set; left out, it stays.' })
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(KNOWN_BY_MAX)
    @IsInt({ each: true })
    knownBy?: number[];
}

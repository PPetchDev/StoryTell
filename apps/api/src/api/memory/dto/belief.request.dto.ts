import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

// A Belief is a sentence or two, as a Memory is; this refuses a runaway client, not a long note.
const TEXT_MAX = 2_000;

export class AddBeliefRequestBodyDTO {
    @ApiProperty({ description: 'The Character who holds it.' })
    @IsInt()
    characterId: number;

    @ApiProperty({ description: 'What they believe. Write `{user}` where it names the user.' })
    @IsString()
    @MaxLength(TEXT_MAX)
    text: string;

    @ApiPropertyOptional({ type: Number, nullable: true, description: "The Memory it contradicts: one of this Chat's. Left out or null, none." })
    @IsOptional()
    @IsInt()
    contradictsMemoryId?: number | null;
}

export class EditBeliefRequestBodyDTO {
    @ApiPropertyOptional({ description: 'The Character who holds it; left out, the same.' })
    @IsOptional()
    @IsInt()
    characterId?: number;

    @ApiPropertyOptional({ description: 'The new text; left out, the text stays.' })
    @IsOptional()
    @IsString()
    @MaxLength(TEXT_MAX)
    text?: string;

    @ApiPropertyOptional({ type: Number, nullable: true, description: 'The Memory it contradicts; null takes the link off, left out it stays.' })
    @ValidateIf((_, value) => value !== null && value !== undefined)
    @IsInt()
    contradictsMemoryId?: number | null;
}

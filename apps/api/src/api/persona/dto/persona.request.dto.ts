import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

const NAME_MAX = 200;
const DESCRIPTION_MAX = 5_000;

export class CreatePersonaRequestBodyDTO {
    @ApiProperty({ description: 'The name Characters know the user by while it is worn.', example: 'Rin' })
    @IsString()
    @MaxLength(NAME_MAX)
    name: string;

    @ApiPropertyOptional({ description: 'Who the user is while wearing it; goes into the prompt.' })
    @IsOptional()
    @IsString()
    @MaxLength(DESCRIPTION_MAX)
    description?: string;
}

/** Only the fields sent change. */
export class UpdatePersonaRequestBodyDTO {
    @ApiPropertyOptional({ description: 'Old User Messages keep the name they were stamped with.' })
    @IsOptional()
    @IsString()
    @MaxLength(NAME_MAX)
    name?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @MaxLength(DESCRIPTION_MAX)
    description?: string;
}

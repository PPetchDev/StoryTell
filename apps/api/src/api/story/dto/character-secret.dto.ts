import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from 'class-validator';

import { BOND_AXES, BondAxis } from '../../../model/ledger/bond-axes.js';
import { CharacterSecretResponse } from '../../../model/story/entities/character-secret.entity.js';
import { SECRET_TEXT_MAX } from '../../../manager/chat/secrets/secrets.js';

/** One Secret of a Character (.scratch/secret-reveals/spec.md). */
export class CharacterSecretDTO implements CharacterSecretResponse {
    @ApiProperty()
    id: number;

    @ApiProperty()
    text: string;

    @ApiProperty({ enum: BOND_AXES, nullable: true, description: "The feeling toward the user it needs; null: none, played like the Secrets text." })
    axis: BondAxis | null;

    @ApiProperty({ type: Number, nullable: true, description: 'The least level on that axis, picked by its word in the editor; null exactly when `axis` is.' })
    atLeast: number | null;
}

/** A change to one Secret: the fields sent change. `axis: null` clears the level; a level needs both. */
export class CharacterSecretRequestBodyDTO {
    @ApiPropertyOptional({ maxLength: SECRET_TEXT_MAX })
    @IsOptional()
    @IsString()
    @MaxLength(SECRET_TEXT_MAX)
    text?: string;

    @ApiPropertyOptional({ enum: BOND_AXES, nullable: true })
    @IsOptional()
    @ValidateIf((_object, value) => value !== null)
    @IsIn(BOND_AXES)
    axis?: BondAxis | null;

    @ApiPropertyOptional({ type: Number, nullable: true, minimum: -3, maximum: 3 })
    @IsOptional()
    @ValidateIf((_object, value) => value !== null)
    @IsInt()
    @Min(-3)
    @Max(3)
    atLeast?: number | null;
}

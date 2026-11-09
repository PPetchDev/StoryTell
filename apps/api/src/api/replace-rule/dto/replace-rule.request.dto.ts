import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

import type { ReplaceRuleFields } from '../../../manager/replace-rule/replace-rule.service.js';
import { REPLACE_FIND_MAX, REPLACE_REPLACE_MAX, REPLACE_RULES_MAX } from '../../../model/replace-rule/entities/replace-rule.entity.js';

const FIND_DESCRIPTION =
    'What to find, never trimmed (spaces are part of it): plain text, or a JavaScript regex source when `regex` is on. A regex that does not compile, matches empty text or is too slow is `InvalidReplaceRuleError`.';
const REPLACE_DESCRIPTION = 'What replaces each match; empty removes it. Plain rules take it literally; regex rules use `$1`, `$<name>`, `$&`, `$$`.';
const ON_MINE_DESCRIPTION = "Applied to my Messages before sending. Refused (`InvalidReplaceRuleError`) when running the rule on its own output changes it again.";

/** Only the fields sent change; a new rule needs `find`. */
export class UpdateReplaceRuleRequestBodyDTO implements ReplaceRuleFields {
    @ApiPropertyOptional({ minLength: 1, maxLength: REPLACE_FIND_MAX, description: FIND_DESCRIPTION })
    @IsOptional()
    @IsString()
    @MinLength(1)
    @MaxLength(REPLACE_FIND_MAX)
    find?: string;

    @ApiPropertyOptional({ maxLength: REPLACE_REPLACE_MAX, description: REPLACE_DESCRIPTION })
    @IsOptional()
    @IsString()
    @MaxLength(REPLACE_REPLACE_MAX)
    replace?: string;

    @ApiPropertyOptional({ description: 'Find is a regex. Default false.' })
    @IsOptional()
    @IsBoolean()
    regex?: boolean;

    @ApiPropertyOptional({ description: 'Default false.' })
    @IsOptional()
    @IsBoolean()
    ignoreCase?: boolean;

    @ApiPropertyOptional({ description: 'Applied to AI Messages as shown; what is stored never changes. Default true.' })
    @IsOptional()
    @IsBoolean()
    onAi?: boolean;

    @ApiPropertyOptional({ description: `${ON_MINE_DESCRIPTION} Default false.` })
    @IsOptional()
    @IsBoolean()
    onMine?: boolean;
}

export class CreateReplaceRuleRequestBodyDTO extends UpdateReplaceRuleRequestBodyDTO {
    @ApiProperty({ minLength: 1, maxLength: REPLACE_FIND_MAX, description: FIND_DESCRIPTION, example: 'a shiver ran down her spine' })
    @IsString()
    @MinLength(1)
    @MaxLength(REPLACE_FIND_MAX)
    declare find: string;
}

export class ReplaceRuleOrderRequestBodyDTO {
    @ApiProperty({ type: [Number], description: "Every rule of the scope exactly once, in the new order; anything else is `InvalidOrderError`." })
    @IsArray()
    @ArrayMaxSize(REPLACE_RULES_MAX)
    @IsInt({ each: true })
    ids: number[];
}

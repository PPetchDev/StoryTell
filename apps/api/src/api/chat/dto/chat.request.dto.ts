import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, MaxLength, ValidateIf } from 'class-validator';

const TITLE_MAX = 200;
// Long enough for any turn the user writes, short enough to refuse a runaway client.
const TEXT_MAX = 20_000;

export class RenameChatRequestBodyDTO {
    @ApiProperty({ description: 'The new title. Whitespace only keeps the current title.' })
    @IsString()
    @MaxLength(TITLE_MAX)
    title: string;
}

export class SendMessageRequestBodyDTO {
    @ApiProperty({ description: "The user's message, written as the worn identity." })
    @IsString()
    @MaxLength(TEXT_MAX)
    text: string;
}

export class EditMessageRequestBodyDTO {
    @ApiProperty({
        description:
            'The new text. For an AI Message, narration paragraphs and `@Name:` speech lines, as the parser reads them.',
    })
    @IsString()
    @MaxLength(TEXT_MAX)
    text: string;
}

export class SwapIdentityRequestBodyDTO {
    @ApiProperty({
        type: Number,
        nullable: true,
        description: "The Persona to wear from now on, or null for the Story's Role.",
    })
    @ValidateIf((body: SwapIdentityRequestBodyDTO) => body.personaId !== null)
    @IsInt()
    personaId: number | null;
}

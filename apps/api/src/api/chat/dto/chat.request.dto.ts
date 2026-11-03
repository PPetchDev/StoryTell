import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

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

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsInt, IsObject, IsOptional, IsString, MaxLength, Min, ValidateIf } from 'class-validator';

import type { ChatFields } from '../../../manager/chat/chat.service.js';
import { CUE_MAX } from '../../../manager/chat/turn/prompt.js';
import { NOW_MAX } from '../../../manager/chat/details/now-notes.js';
import { WRITE_FOR_ME_DRAFT_MAX } from '../../../manager/chat/write-for-me/write-for-me-prompt.js';

const TITLE_MAX = 200;
// Long enough for any turn the user writes, short enough to refuse a runaway client.
const TEXT_MAX = 20_000;

/** Starting a Chat (.scratch/opening-questions/spec.md). With no body, every Opening question takes its default. */
export class CreateChatRequestBodyDTO {
    @ApiPropertyOptional({
        type: 'object',
        additionalProperties: { type: 'string' },
        description:
            "The answers to the Story's Opening questions, by placeholder key. A missing or blank answer takes the question's default; " +
            'a key the Story does not ask is ignored. Each is made one line and cut to 200 characters.',
        example: { name: 'Petch', trade: 'herder' },
    })
    @IsOptional()
    @IsObject()
    answers?: Record<string, unknown>;
}

/** The Chat's own settings; each is changed only when sent. */
export class UpdateChatRequestBodyDTO implements ChatFields {
    @ApiPropertyOptional({ description: 'The new title. Whitespace only keeps the current title.' })
    @IsOptional()
    @IsString()
    @MaxLength(TITLE_MAX)
    title?: string;

    @ApiPropertyOptional({ description: 'Read replies aloud: new replies of turns started in a tab play by themselves there.' })
    @IsOptional()
    @IsBoolean()
    autoRead?: boolean;

    @ApiPropertyOptional({
        description:
            'Whether the Judge may suggest an Ending in this Chat. "Not yet" on a suggested Ending turns it off; this turns it back on, or off without waiting for one.',
    })
    @IsOptional()
    @IsBoolean()
    endingSuggestions?: boolean;

    @ApiPropertyOptional({ description: 'Whether the Characters write Diary entries by themselves as the story goes. Off, entries come only when asked.' })
    @IsOptional()
    @IsBoolean()
    autoDiary?: boolean;

    @ApiPropertyOptional({ description: 'Whether each Character thinks on their own before a reply. Off, no Thoughts are asked for.' })
    @IsOptional()
    @IsBoolean()
    characterThoughts?: boolean;
}

/** .scratch/speaker-controls/spec.md, "Nudge": who the user would like to hear from in this turn. */
const NUDGE_DESCRIPTION =
    'Optional: a Character of the Story to nudge in this turn. The Narrator is asked to give them a line if they could plausibly be there. Never stored. Left out or null: no nudge.';

/** CONTEXT.md, "Cue": a few words to the Narrator for this one reply. */
const CUE_DESCRIPTION =
    'Optional: a Cue, a few words from the user to the Narrator for this one reply ("make her angrier", "skip to the next morning"). It steers that reply only, is never part of the story and is never stored. Left out, null or blank: no Cue.';

/** The optional body of Retry, Continue and Regenerate: without one they behave as before. */
export class TurnRequestBodyDTO {
    @ApiPropertyOptional({ type: Number, nullable: true, description: NUDGE_DESCRIPTION })
    @IsOptional()
    @IsInt()
    nudgeCharacterId?: number | null;

    @ApiPropertyOptional({ type: String, nullable: true, maxLength: CUE_MAX, description: CUE_DESCRIPTION })
    @IsOptional()
    @IsString()
    @MaxLength(CUE_MAX)
    cue?: string | null;
}

export class SendMessageRequestBodyDTO extends TurnRequestBodyDTO {
    @ApiProperty({ description: "The user's message, written as the worn identity." })
    @IsString()
    @MaxLength(TEXT_MAX)
    text: string;

    @ApiPropertyOptional({
        description:
            "Optional: true sends the message with a Roll (.scratch/roll/spec.md). The app throws a d20 against the number the Story's Difficulty sets, keeps the result on the Message, and the Narrator writes what the user attempts turning out that way. Left out or false: no Roll.",
    })
    @IsOptional()
    @IsBoolean()
    roll?: boolean;
}

export class EditMessageRequestBodyDTO extends TurnRequestBodyDTO {
    @ApiProperty({
        description:
            'The new text. For an AI Message, narration paragraphs and `@Name:` speech lines, as the parser reads them.',
    })
    @IsString()
    @MaxLength(TEXT_MAX)
    text: string;
}

export class ChooseReplyVersionRequestBodyDTO {
    @ApiProperty({ description: 'The Reply version to show: the n of its ‹ n/m ›, 1-based, in the order the versions were written.' })
    @IsInt()
    @Min(1)
    version: number;
}

export class SetNowNoteRequestBodyDTO {
    @ApiProperty({
        maxLength: NOW_MAX,
        description: "The user's own Now note for the Character (.scratch/growing-cards/spec.md): what has lastingly changed about them in this Chat, as facts. Trimmed; whitespace only clears it.",
    })
    @IsString()
    @MaxLength(NOW_MAX)
    text: string;
}

/** .scratch/authors-note/spec.md: about 250 tokens, so the note never crowds the story out of the prompt. */
export const AUTHORS_NOTE_MAX = 1_000;

export class SetAuthorsNoteRequestBodyDTO {
    @ApiProperty({
        maxLength: AUTHORS_NOTE_MAX,
        description: "The Chat's Author's note: the user's standing direction, read on every turn. Trimmed; whitespace only clears it.",
    })
    @IsString()
    @MaxLength(AUTHORS_NOTE_MAX)
    text: string;
}

export class SetSittingOutRequestBodyDTO {
    @ApiProperty({
        type: [Number],
        description: "Every Character to keep out of this Chat's turns until brought back; replaces the whole set. Empty brings everyone back.",
    })
    @IsArray()
    @IsInt({ each: true })
    characterIds: number[];
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

export class WriteForMeRequestBodyDTO {
    @ApiProperty({
        maxLength: WRITE_FOR_ME_DRAFT_MAX,
        description:
            "What is in the composer: Thai or another language, notes, half a line, or a line to polish. Empty or whitespace asks for a reply from nothing.",
    })
    @IsString()
    @MaxLength(WRITE_FOR_ME_DRAFT_MAX)
    draft: string;
}

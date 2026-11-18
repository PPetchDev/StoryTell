import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, MaxLength, ValidateIf } from 'class-validator';

import type { ChapterStatus, ChaptersView, ChapterView } from '../../../manager/chat/chapters/chapters.service.js';
import type { ChapterAuthor, SceneMover } from '../../../model/ledger/entities/scene-advance.entity.js';

// About 80 words are asked for; this refuses a runaway client, not a long summary.
const TEXT_MAX = 4_000;

/** Move on (.scratch/scene-chapters/spec.md). */
export class MoveOnRequestBodyDTO {
    @ApiProperty({
        type: Number,
        nullable: true,
        description: 'The Scene to move on to: any Scene of the Story other than the current one, or null for free play while the Chat is on a Scene.',
    })
    @ValidateIf((body: MoveOnRequestBodyDTO) => body.toSceneId !== null)
    @IsInt()
    toSceneId: number | null;
}

export class SaveChapterRequestBodyDTO {
    @ApiProperty({ description: "The user's own summary of the Chapter. The AI never writes over it." })
    @IsString()
    @MaxLength(TEXT_MAX)
    text: string;
}

export class CurrentChapterSceneDTO {
    @ApiProperty()
    id: number;

    @ApiProperty()
    name: string;
}

export class CurrentChapterDTO {
    @ApiProperty({ description: 'Its number: one after the last ended Chapter.' })
    number: number;

    @ApiProperty({ type: CurrentChapterSceneDTO, nullable: true, description: 'The Scene the Chat is on; null in free play.' })
    scene: CurrentChapterSceneDTO | null;
}

export class ChapterDTO implements ChapterView {
    @ApiProperty({ description: 'The id of the Scene advance that ended it.' })
    id: number;

    @ApiProperty()
    number: number;

    @ApiProperty({ description: 'The Scene it was played in, stamped.' })
    sceneName: string;

    @ApiProperty({ type: String, nullable: true, description: 'The Scene it led to; null for free play.' })
    toSceneName: string | null;

    @ApiProperty({ enum: ['judge', 'user'] })
    movedBy: SceneMover;

    @ApiProperty({ description: "The Scene advance's event." })
    event: string;

    @ApiProperty({ description: 'The AI Message it ended at.' })
    messageId: number;

    @ApiProperty()
    endedAt: string;

    @ApiProperty({ type: String, nullable: true })
    summary: string | null;

    @ApiProperty({ enum: ['ai', 'user'] })
    writtenBy: ChapterAuthor;

    @ApiProperty({
        enum: ['written', 'writing', 'waiting', 'failed', 'empty'],
        description: 'written; writing now; waiting for a coming turn; failed, for Try again; or empty, with no Messages of its own.',
    })
    status: ChapterStatus;

    @ApiProperty({ type: String, nullable: true, description: 'Why the last try failed, while it is failed.' })
    failedReason: string | null;
}

export class ChaptersResponseBodyDTO implements ChaptersView {
    @ApiProperty({ type: CurrentChapterDTO })
    current: CurrentChapterDTO;

    @ApiProperty({ type: [ChapterDTO], description: 'Every ended Chapter, oldest first.' })
    chapters: ChapterDTO[];
}

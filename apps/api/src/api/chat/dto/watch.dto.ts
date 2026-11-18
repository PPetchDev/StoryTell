import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';

import { WATCH_REPLIES_MAX } from '../watch-runs.js';
import type { WatchEndReason, WatchView } from '../watch-runs.js';

/** Starting Watch (.scratch/watch-mode/spec.md): how many replies the story plays on for. */
export class StartWatchRequestBodyDTO {
    @ApiProperty({ description: 'How many replies to write, one after another. The UI offers 3, 5 and 10.', minimum: 1, maximum: WATCH_REPLIES_MAX, example: 5 })
    @IsInt()
    @Min(1)
    @Max(WATCH_REPLIES_MAX)
    replies: number;
}

export class WatchEndedDTO {
    @ApiProperty({
        enum: ['finished', 'stopped', 'ending', 'sudden_event', 'event_proposal', 'roll_offer', 'failed', 'credit', 'cap'],
        description: 'Why it ended (.scratch/watch-mode/spec.md, "Stopping").',
    })
    reason: WatchEndReason;

    @ApiProperty({ type: String, nullable: true, description: "The error's message for failed, credit and cap; null otherwise." })
    message: string | null;
}

export class WatchResponseBodyDTO implements WatchView {
    @ApiProperty()
    id: string;

    @ApiProperty({ description: 'How many replies were asked for.' })
    replies: number;

    @ApiProperty({ description: 'How many are written and stored so far.' })
    done: number;

    @ApiProperty({ enum: ['running', 'ended'] })
    status: 'running' | 'ended';

    @ApiProperty({ type: WatchEndedDTO, nullable: true, description: 'Null while it runs.' })
    ended: WatchEndedDTO | null;

    @ApiProperty()
    startedAt: string;
}

export class WatchStateResponseBodyDTO {
    @ApiProperty({ type: WatchResponseBodyDTO, nullable: true, description: "The Chat's Watch, running or lately ended; null with none." })
    watch: WatchResponseBodyDTO | null;

    @ApiProperty({
        type: Number,
        nullable: true,
        description: "What a reply of this Chat costs, in USD: the mean cost of its last 5 replies that have any (.scratch/cost-view/spec.md). Null with none yet.",
    })
    perReplyUsd: number | null;
}

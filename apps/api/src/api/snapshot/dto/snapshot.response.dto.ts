import { ApiProperty } from '@nestjs/swagger';

import { ChatSnapshots, GalleryItem, SnapshotJob } from '../../../manager/snapshot/snapshot.service.js';
import { SnapshotCharacterResponse } from '../../../model/snapshot/entities/snapshot-character.entity.js';
import { SnapshotResponse } from '../../../model/snapshot/entities/snapshot.entity.js';

export class SnapshotCharacterDTO implements SnapshotCharacterResponse {
    @ApiProperty({ type: Number, nullable: true, description: 'Null once the Character is removed from the Story.' })
    characterId: number | null;

    @ApiProperty({ description: 'The name stamped when the Snapshot was taken.' })
    name: string;
}

export class SnapshotDTO implements SnapshotResponse {
    @ApiProperty()
    id: number;

    @ApiProperty()
    storyId: number;

    @ApiProperty({ type: Number, nullable: true, description: 'Null once the Chat is deleted.' })
    chatId: number | null;

    @ApiProperty({
        type: Number,
        nullable: true,
        description: 'Null once an edit, a reset or a Chat delete took the Message away: "from an earlier version of this Chat".',
    })
    messageId: number | null;

    @ApiProperty({ description: 'Relative to the image folder; served at `GET /api/images/{imagePath}`.' })
    imagePath: string;

    @ApiProperty({ description: 'The prompt the image model was given.' })
    prompt: string;

    @ApiProperty({ description: 'The hint given with the camera press; empty when none.' })
    hint: string;

    @ApiProperty({ description: 'The image model that drew it.' })
    imageModel: string;

    @ApiProperty({ description: 'List price in USD.' })
    costUsd: number;

    @ApiProperty({ type: [SnapshotCharacterDTO], description: 'The Characters drawn, in frame order, at most 3.' })
    characters: SnapshotCharacterDTO[];

    @ApiProperty()
    createdAt: string;
}

export class SnapshotJobErrorDTO {
    @ApiProperty({ description: 'The error code, as in docs/error-codes.md.' })
    code: string;

    @ApiProperty()
    message: string;
}

export class SnapshotJobDTO implements SnapshotJob {
    @ApiProperty()
    id: string;

    @ApiProperty()
    chatId: number;

    @ApiProperty({ description: 'The AI Message the camera acted on; the placeholder or the error shows under it.' })
    messageId: number;

    @ApiProperty()
    hint: string;

    @ApiProperty({ enum: ['pending', 'failed'], description: 'A job that succeeded is gone; its Snapshot is listed instead.' })
    status: 'pending' | 'failed';

    @ApiProperty({ type: SnapshotJobErrorDTO, nullable: true, description: 'Why a failed job failed. Show with Retry.' })
    error: SnapshotJobErrorDTO | null;

    @ApiProperty()
    startedAt: string;
}

export class ChatSnapshotsResponseBodyDTO implements ChatSnapshots {
    @ApiProperty({ type: [SnapshotDTO], description: 'Snapshots under a Message of this Chat, oldest first.' })
    snapshots: SnapshotDTO[];

    @ApiProperty({ type: [SnapshotJobDTO], description: 'Snapshots being made, and failed ones awaiting Retry.' })
    jobs: SnapshotJobDTO[];
}

export class GalleryItemDTO extends SnapshotDTO implements GalleryItem {
    @ApiProperty({ type: String, nullable: true, description: 'The Chat it was taken in; null once that Chat is deleted.' })
    chatTitle: string | null;
}

export class GalleryResponseBodyDTO {
    @ApiProperty({ type: [GalleryItemDTO], description: 'Newest first.' })
    snapshots: GalleryItemDTO[];
}

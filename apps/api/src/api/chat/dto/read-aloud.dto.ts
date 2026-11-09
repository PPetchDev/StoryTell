import { ApiProperty } from '@nestjs/swagger';

import { SpeechQueueItem } from '../../../manager/read-aloud/read-aloud.service.js';

export class SpeechQueueItemDTO implements SpeechQueueItem {
    @ApiProperty({ description: 'Its place in the queue, from 0: what POST .../speech/:index asks for.' })
    index: number;

    @ApiProperty({ description: 'The part of the Message it is read from.' })
    partIndex: number;

    @ApiProperty({
        type: Number,
        nullable: true,
        description: "A narration item's paragraph within its part's shown text, as the thread splits it; null for speech.",
    })
    paragraph: number | null;

    @ApiProperty({ description: 'The voice it is read in.', example: 'af_sky' })
    voice: string;

    @ApiProperty({ description: 'How many characters it is.' })
    characters: number;

    @ApiProperty({ description: 'True when its audio is on disk, so playing it costs nothing.' })
    cached: boolean;
}

export class SpeechQueueResponseBodyDTO {
    @ApiProperty({ type: [SpeechQueueItemDTO], description: 'In reading order. Empty for a Message with nothing to read.' })
    items: SpeechQueueItemDTO[];
}

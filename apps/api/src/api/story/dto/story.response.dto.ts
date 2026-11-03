import { ApiProperty } from '@nestjs/swagger';

import { StorySummary } from '../../../model/story/entities/story.entity.js';

export class StorySummaryDTO implements StorySummary {
    @ApiProperty({ description: 'Story id.', example: 1 })
    id: number;

    @ApiProperty({ description: 'The Story title as the author wrote it.' })
    title: string;

    @ApiProperty({ description: 'When the Story was created (ISO 8601).' })
    createdAt: string;

    @ApiProperty({ description: 'When the Story was last saved (ISO 8601).' })
    updatedAt: string;
}

export class ListStoriesResponseBodyDTO {
    @ApiProperty({
        description: 'Every Story, most recently saved first.',
        type: [StorySummaryDTO],
    })
    stories: StorySummaryDTO[];
}

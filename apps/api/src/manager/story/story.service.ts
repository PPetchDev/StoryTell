import { Injectable } from '@nestjs/common';

import { StorySummary } from '../../model/story/entities/story.entity.js';
import { StoryModelService } from '../../model/story/story.service.js';

@Injectable()
export class StoryManagerService {
    constructor(private readonly storyModel: StoryModelService) {}

    async listStories(): Promise<StorySummary[]> {
        const stories = await this.storyModel.findAll();
        return stories.map((story) => story.toResponse());
    }
}

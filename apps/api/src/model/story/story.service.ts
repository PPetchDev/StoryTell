import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { StoryEntity } from './entities/story.entity.js';

@Injectable()
export class StoryModelService {
    constructor(@InjectRepository(StoryEntity) private readonly stories: Repository<StoryEntity>) {}

    findAll(): Promise<StoryEntity[]> {
        return this.stories.find({ order: { updatedAt: 'DESC', id: 'DESC' } });
    }
}

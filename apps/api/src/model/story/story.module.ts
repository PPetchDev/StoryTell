import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { StoryEntity } from './entities/story.entity.js';
import { StoryModelService } from './story.service.js';

@Module({
    imports: [TypeOrmModule.forFeature([StoryEntity])],
    providers: [StoryModelService],
    exports: [StoryModelService],
})
export class StoryModelModule {}

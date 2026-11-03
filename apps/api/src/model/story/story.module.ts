import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CharacterEntity } from './entities/character.entity.js';
import { RoleEntity } from './entities/role.entity.js';
import { SceneEntity } from './entities/scene.entity.js';
import { StartingBondEntity } from './entities/starting-bond.entity.js';
import { StoryEntity } from './entities/story.entity.js';
import { StoryModelService } from './story.service.js';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            StoryEntity,
            RoleEntity,
            CharacterEntity,
            StartingBondEntity,
            SceneEntity,
        ]),
    ],
    providers: [StoryModelService],
    exports: [StoryModelService],
})
export class StoryModelModule {}

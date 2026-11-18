import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { OutfitSpriteEntity, PlacePictureEntity } from './stage.entities.js';
import { StageModelService } from './stage.service.js';

@Module({
    imports: [TypeOrmModule.forFeature([PlacePictureEntity, OutfitSpriteEntity])],
    providers: [StageModelService],
    exports: [StageModelService],
})
export class StageModelModule {}

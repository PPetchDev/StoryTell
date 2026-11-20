import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { IdentityExpressionEntity } from './entities/identity-expression.entity.js';
import { YourFaceModelService } from './your-face.service.js';

@Module({
    imports: [TypeOrmModule.forFeature([IdentityExpressionEntity])],
    providers: [YourFaceModelService],
    exports: [YourFaceModelService],
})
export class YourFaceModelModule {}

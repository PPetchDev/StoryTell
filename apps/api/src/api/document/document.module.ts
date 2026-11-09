import { Module } from '@nestjs/common';

import { DocumentManagerModule } from '../../manager/document/document.module.js';
import { DocumentApiController } from './document.controller.js';

@Module({
    imports: [DocumentManagerModule],
    controllers: [DocumentApiController],
})
export class DocumentApiModule {}

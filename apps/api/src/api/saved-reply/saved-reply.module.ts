import { Module } from '@nestjs/common';

import { SavedReplyManagerModule } from '../../manager/saved-reply/saved-reply.module.js';
import { SavedReplyApiController, StorySavedReplyApiController } from './saved-reply.controller.js';

@Module({
    imports: [SavedReplyManagerModule],
    controllers: [SavedReplyApiController, StorySavedReplyApiController],
})
export class SavedReplyApiModule {}

import { Module } from '@nestjs/common';

import { BookModelModule } from '../../../model/book/book.module.js';
import { ChatModelModule } from '../../../model/chat/chat.module.js';
import { LedgerModelModule } from '../../../model/ledger/ledger.module.js';
import { SettingsModelModule } from '../../../model/settings/settings.module.js';
import { StoryModelModule } from '../../../model/story/story.module.js';
import { BookManagerService } from './book.service.js';

/** Turn a Chat into a novel (.scratch/chat-novel/spec.md). Its own module, so the Chat's stays as it was. */
@Module({
    imports: [BookModelModule, ChatModelModule, LedgerModelModule, SettingsModelModule, StoryModelModule],
    providers: [BookManagerService],
    exports: [BookManagerService],
})
export class BookManagerModule {}

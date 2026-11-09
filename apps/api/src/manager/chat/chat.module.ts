import { Module } from '@nestjs/common';

import { BranchModelModule } from '../../model/branch/branch.module.js';
import { ChatModelModule } from '../../model/chat/chat.module.js';
import { DocumentModelModule } from '../../model/document/document.module.js';
import { LedgerModelModule } from '../../model/ledger/ledger.module.js';
import { MemoryModelModule } from '../../model/memory/memory.module.js';
import { PersonaModelModule } from '../../model/persona/persona.module.js';
import { SavedReplyModelModule } from '../../model/saved-reply/saved-reply.module.js';
import { ReplaceRuleModelModule } from '../../model/replace-rule/replace-rule.module.js';
import { SettingsModelModule } from '../../model/settings/settings.module.js';
import { SnapshotModelModule } from '../../model/snapshot/snapshot.module.js';
import { StoryModelModule } from '../../model/story/story.module.js';
import { ChatManagerService } from './chat.service.js';
import { DocumentSearchManagerService } from './document-search.service.js';
import { JudgeManagerService } from './judge/judge.service.js';
import { MemoryExtractionManagerService } from './memory/extraction.service.js';
import { MemoryManagerService } from './memory/memory.service.js';
import { SuggestedRepliesManagerService } from './suggestions/suggested-replies.service.js';
import { WriteForMeManagerService } from './write-for-me/write-for-me.service.js';
import { ThaiReadingManagerService } from './thai-reading/thai-reading.service.js';
import { StorySoFarManagerService } from './story-so-far/story-so-far.service.js';
import { ChatTranscriptManagerService } from './transcript.service.js';

@Module({
    imports: [ChatModelModule, BranchModelModule, StoryModelModule, SettingsModelModule, LedgerModelModule, MemoryModelModule, PersonaModelModule, SnapshotModelModule, DocumentModelModule, SavedReplyModelModule, ReplaceRuleModelModule],
    providers: [ChatManagerService, DocumentSearchManagerService, JudgeManagerService, MemoryExtractionManagerService, MemoryManagerService, SuggestedRepliesManagerService, WriteForMeManagerService, ThaiReadingManagerService, StorySoFarManagerService, ChatTranscriptManagerService],
    exports: [ChatManagerService, MemoryManagerService, StorySoFarManagerService, ChatTranscriptManagerService],
})
export class ChatManagerModule {}

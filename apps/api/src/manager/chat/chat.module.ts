import { Module } from '@nestjs/common';
import { YourFaceModelModule } from '../../model/your-face/your-face.module.js';

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
import { ReplyRecordModelModule } from '../../model/reply-record/reply-record.module.js';
import { UsageRecordModelModule } from '../../model/usage-record/usage-record.module.js';
import { ReadAloudManagerModule } from '../read-aloud/read-aloud.module.js';
import { ChatManagerService } from './chat.service.js';
import { DiaryManagerService } from './diary/diary.service.js';
import { MeanwhileManagerService } from './meanwhile/meanwhile.service.js';
import { ThoughtsManagerService } from './thoughts/thoughts.service.js';
import { SpeechRepairManagerService } from './speech/speech-repair.service.js';
import { DocumentSearchManagerService } from './document-search.service.js';
import { JudgeManagerService } from './judge/judge.service.js';
import { BeliefManagerService } from './memory/belief.service.js';
import { MemoryEmbeddingManagerService } from './memory/memory-embedding.service.js';
import { MemoryExtractionManagerService } from './memory/extraction.service.js';
import { MemoryManagerService } from './memory/memory.service.js';
import { SuggestedRepliesManagerService } from './suggestions/suggested-replies.service.js';
import { WriteForMeManagerService } from './write-for-me/write-for-me.service.js';
import { ThaiReadingManagerService } from './thai-reading/thai-reading.service.js';
import { StorySoFarManagerService } from './story-so-far/story-so-far.service.js';
import { ChaptersManagerService } from './chapters/chapters.service.js';
import { ChatTranscriptManagerService } from './transcript.service.js';
import { StageManagerService } from './stage/stage.service.js';
import { StageModelModule } from '../../model/stage/stage.module.js';
import { ImageStoreModule } from '../../store/image/image-store.module.js';

@Module({
    imports: [ChatModelModule, BranchModelModule, StoryModelModule, SettingsModelModule, LedgerModelModule, MemoryModelModule, PersonaModelModule, SnapshotModelModule, DocumentModelModule, SavedReplyModelModule, ReplaceRuleModelModule, ReadAloudManagerModule, UsageRecordModelModule, ReplyRecordModelModule, StageModelModule, ImageStoreModule, YourFaceModelModule],
    providers: [ChatManagerService, DocumentSearchManagerService, JudgeManagerService, BeliefManagerService, MemoryEmbeddingManagerService, MemoryExtractionManagerService, MemoryManagerService, SuggestedRepliesManagerService, WriteForMeManagerService, ThaiReadingManagerService, DiaryManagerService, MeanwhileManagerService, ThoughtsManagerService, SpeechRepairManagerService, StorySoFarManagerService, ChaptersManagerService, ChatTranscriptManagerService, StageManagerService],
    exports: [ChatManagerService, MemoryManagerService, BeliefManagerService, StorySoFarManagerService, ChaptersManagerService, ChatTranscriptManagerService],
})
export class ChatManagerModule {}

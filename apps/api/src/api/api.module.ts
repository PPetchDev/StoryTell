import { Module } from '@nestjs/common';

import { AuthApiModule } from './auth/auth.module.js';
import { BackupApiModule } from './backup/backup.module.js';
import { CharacterCardApiModule } from './character-card/character-card.module.js';
import { DocumentApiModule } from './document/document.module.js';
import { ExpressionApiModule } from './expression/expression.module.js';
import { ChatApiModule } from './chat/chat.module.js';
import { HealthApiController } from './health/health.controller.js';
import { ImageApiModule } from './image/image.module.js';
import { MemoryApiModule } from './memory/memory.module.js';
import { StorySoFarApiModule } from './story-so-far/story-so-far.module.js';
import { PersonaApiModule } from './persona/persona.module.js';
import { SavedReplyApiModule } from './saved-reply/saved-reply.module.js';
import { ReplaceRuleApiModule } from './replace-rule/replace-rule.module.js';
import { ReferenceImageApiModule } from './reference-image/reference-image.module.js';
import { SettingsApiModule } from './settings/settings.module.js';
import { SnapshotApiModule } from './snapshot/snapshot.module.js';
import { StoryAssistantApiModule } from './story-assistant/story-assistant.module.js';
import { StoryDraftingApiModule } from './story-drafting/story-drafting.module.js';
import { StoryApiModule } from './story/story.module.js';
import { UsageApiModule } from './usage/usage.module.js';
import { VoiceApiModule } from './voice/voice.module.js';

@Module({
    imports: [
        AuthApiModule,
        ImageApiModule,
        StoryApiModule,
        DocumentApiModule,
        StoryDraftingApiModule,
        StoryAssistantApiModule,
        CharacterCardApiModule,
        ChatApiModule,
        MemoryApiModule,
        StorySoFarApiModule,
        SettingsApiModule,
        UsageApiModule,
        VoiceApiModule,
        ReferenceImageApiModule,
        ExpressionApiModule,
        PersonaApiModule,
        SavedReplyApiModule,
        ReplaceRuleApiModule,
        SnapshotApiModule,
        BackupApiModule,
    ],
    controllers: [HealthApiController],
})
export class ApiModule {}

import { AccountEntity } from '../../model/account/entities/account.entity.js';
import { ChatSittingOutEntity } from '../../model/chat/entities/chat-sitting-out.entity.js';
import { ChatEntity } from '../../model/chat/entities/chat.entity.js';
import { MessagePartEntity } from '../../model/chat/entities/message-part.entity.js';
import { MessageEntity } from '../../model/chat/entities/message.entity.js';
import { ReplyVersionEntity } from '../../model/chat/entities/reply-version.entity.js';
import { ThaiReadingEntity } from '../../model/chat/entities/thai-reading.entity.js';
import { ArcStepEntity } from '../../model/ledger/entities/arc-step.entity.js';
import { BondChangeEntity } from '../../model/ledger/entities/bond-change.entity.js';
import { ChatArcDirectionEntity } from '../../model/ledger/entities/chat-arc-direction.entity.js';
import { MemoryChangeEntity } from '../../model/ledger/entities/memory-change.entity.js';
import { BeliefChangeEntity } from '../../model/ledger/entities/belief-change.entity.js';
import { BeliefEntity } from '../../model/memory/entities/belief.entity.js';
import { SceneAdvanceEntity } from '../../model/ledger/entities/scene-advance.entity.js';
import { TimeChangeEntity } from '../../model/ledger/entities/time-change.entity.js';
import { MemoryKnownByEntity } from '../../model/memory/entities/memory-known-by.entity.js';
import { MemoryEntity } from '../../model/memory/entities/memory.entity.js';
import { SettingsEntity } from '../../model/settings/entities/settings.entity.js';
import { CharacterExpressionEntity } from '../../model/story/entities/character-expression.entity.js';
import { CharacterEntity } from '../../model/story/entities/character.entity.js';
import { LoreEntryEntity } from '../../model/story/entities/lore-entry.entity.js';
import { DocumentPassageEntity } from '../../model/document/entities/document-passage.entity.js';
import { DocumentEntity } from '../../model/document/entities/document.entity.js';
import { RoleEntity } from '../../model/story/entities/role.entity.js';
import { SceneEntity } from '../../model/story/entities/scene.entity.js';
import { SceneBondGateEntity } from '../../model/story/entities/scene-bond-gate.entity.js';
import { StartingBeliefEntity } from '../../model/story/entities/starting-belief.entity.js';
import { StartingBondEntity } from '../../model/story/entities/starting-bond.entity.js';
import { StoryEntity } from '../../model/story/entities/story.entity.js';
import { UsageRecordEntity } from '../../model/usage-record/entities/usage-record.entity.js';
import { ReplaceRuleEntity } from '../../model/replace-rule/entities/replace-rule.entity.js';
import { SavedReplyEntity } from '../../model/saved-reply/entities/saved-reply.entity.js';
import { PersonaEntity } from '../../model/persona/entities/persona.entity.js';
import { SnapshotCharacterEntity } from '../../model/snapshot/entities/snapshot-character.entity.js';
import { SnapshotEntity } from '../../model/snapshot/entities/snapshot.entity.js';

// Every entity must be listed here, or @InjectRepository fails at boot.
export const entities = [
    StoryEntity,
    RoleEntity,
    CharacterEntity,
    CharacterExpressionEntity,
    StartingBondEntity,
    StartingBeliefEntity,
    SceneBondGateEntity,
    SceneEntity,
    LoreEntryEntity,
    DocumentEntity,
    DocumentPassageEntity,
    SettingsEntity,
    UsageRecordEntity,
    ChatEntity,
    ChatSittingOutEntity,
    MessageEntity,
    MessagePartEntity,
    ReplyVersionEntity,
    ThaiReadingEntity,
    BondChangeEntity,
    ArcStepEntity,
    SceneAdvanceEntity,
    TimeChangeEntity,
    ChatArcDirectionEntity,
    MemoryEntity,
    MemoryKnownByEntity,
    MemoryChangeEntity,
    BeliefEntity,
    BeliefChangeEntity,
    PersonaEntity,
    SnapshotEntity,
    SnapshotCharacterEntity,
    SavedReplyEntity,
    ReplaceRuleEntity,
    AccountEntity,
];

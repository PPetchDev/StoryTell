import { BookChapterEntity } from '../../model/book/entities/book-chapter.entity.js';
import { PushSubscriptionEntity } from '../../model/push/entities/push-subscription.entity.js';
import { AccountEntity } from '../../model/account/entities/account.entity.js';
import { ChatSittingOutEntity } from '../../model/chat/entities/chat-sitting-out.entity.js';
import { ChatEntity } from '../../model/chat/entities/chat.entity.js';
import { MessagePartEntity } from '../../model/chat/entities/message-part.entity.js';
import { MessageEntity } from '../../model/chat/entities/message.entity.js';
import { ReplyVersionEntity } from '../../model/chat/entities/reply-version.entity.js';
import { ThaiReadingEntity } from '../../model/chat/entities/thai-reading.entity.js';
import { MessageBookmarkEntity } from '../../model/chat/entities/message-bookmark.entity.js';
import { MessageThoughtEntity } from '../../model/chat/entities/message-thought.entity.js';
import { ChatReachOutEntity } from '../../model/chat/entities/chat-reach-out.entity.js';
import { ArcStepEntity } from '../../model/ledger/entities/arc-step.entity.js';
import { BondChangeEntity } from '../../model/ledger/entities/bond-change.entity.js';
import { ChatArcDirectionEntity } from '../../model/ledger/entities/chat-arc-direction.entity.js';
import { MemoryChangeEntity } from '../../model/ledger/entities/memory-change.entity.js';
import { BeliefChangeEntity } from '../../model/ledger/entities/belief-change.entity.js';
import { BeliefEntity } from '../../model/memory/entities/belief.entity.js';
import { SceneAdvanceEntity } from '../../model/ledger/entities/scene-advance.entity.js';
import { TimeChangeEntity } from '../../model/ledger/entities/time-change.entity.js';
import { SuddenEventStepEntity } from '../../model/ledger/entities/sudden-event-step.entity.js';
import { DetailChangeEntity } from '../../model/ledger/entities/detail-change.entity.js';
import { DiaryEntryEntity } from '../../model/ledger/entities/diary-entry.entity.js';
import { EndingReachedEntity } from '../../model/ledger/entities/ending-reached.entity.js';
import { ChatRecapEntity } from '../../model/recap/entities/chat-recap.entity.js';
import { EndingEntity } from '../../model/story/entities/ending.entity.js';
import { LoreSetEntity, StoryLoreSetEntity } from '../../model/story/entities/lore-set.entity.js';
import { SuddenEventEntity } from '../../model/story/entities/sudden-event.entity.js';
import { MemoryKnownByEntity } from '../../model/memory/entities/memory-known-by.entity.js';
import { MemoryEntity } from '../../model/memory/entities/memory.entity.js';
import { SettingsEntity } from '../../model/settings/entities/settings.entity.js';
import { CharacterExpressionEntity } from '../../model/story/entities/character-expression.entity.js';
import { ReferenceCutoutEntity } from '../../model/story/entities/reference-cutout.entity.js';
import { OutfitSpriteEntity, PlacePictureEntity, StoryPlaceEntity } from '../../model/stage/stage.entities.js';
import { CharacterSecretEntity } from '../../model/story/entities/character-secret.entity.js';
import { SecretRevealEntity } from '../../model/ledger/entities/secret-reveal.entity.js';
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
import { IdentityExpressionEntity } from '../../model/your-face/entities/identity-expression.entity.js';
import { SnapshotCharacterEntity } from '../../model/snapshot/entities/snapshot-character.entity.js';
import { SnapshotEntity } from '../../model/snapshot/entities/snapshot.entity.js';

// Every entity must be listed here, or @InjectRepository fails at boot.
import { ReplacedReplyEntity } from '../../model/reply-record/entities/replaced-reply.entity.js';
import { RepairRecordEntity } from '../../model/reply-record/entities/repair-record.entity.js';

export const entities = [
    StoryEntity,
    RoleEntity,
    CharacterEntity,
    CharacterExpressionEntity,
    IdentityExpressionEntity,
    ReferenceCutoutEntity,
    PlacePictureEntity,
    StoryPlaceEntity,
    OutfitSpriteEntity,
    CharacterSecretEntity,
    SecretRevealEntity,
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
    MessageBookmarkEntity,
    MessageThoughtEntity,
    ChatReachOutEntity,
    BondChangeEntity,
    ArcStepEntity,
    SceneAdvanceEntity,
    TimeChangeEntity,
    SuddenEventEntity,
    SuddenEventStepEntity,
    DetailChangeEntity,
    DiaryEntryEntity,
    EndingEntity,
    EndingReachedEntity,
    LoreSetEntity,
    StoryLoreSetEntity,
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
    PushSubscriptionEntity,
    ChatRecapEntity,
    BookChapterEntity,
    RepairRecordEntity,
    ReplacedReplyEntity,
];

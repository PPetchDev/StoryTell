import { ChatEntity } from '../../model/chat/entities/chat.entity.js';
import { MessagePartEntity } from '../../model/chat/entities/message-part.entity.js';
import { MessageEntity } from '../../model/chat/entities/message.entity.js';
import { ArcStepEntity } from '../../model/ledger/entities/arc-step.entity.js';
import { BondChangeEntity } from '../../model/ledger/entities/bond-change.entity.js';
import { ChatArcDirectionEntity } from '../../model/ledger/entities/chat-arc-direction.entity.js';
import { MemoryChangeEntity } from '../../model/ledger/entities/memory-change.entity.js';
import { SceneAdvanceEntity } from '../../model/ledger/entities/scene-advance.entity.js';
import { MemoryKnownByEntity } from '../../model/memory/entities/memory-known-by.entity.js';
import { MemoryEntity } from '../../model/memory/entities/memory.entity.js';
import { SettingsEntity } from '../../model/settings/entities/settings.entity.js';
import { CharacterEntity } from '../../model/story/entities/character.entity.js';
import { RoleEntity } from '../../model/story/entities/role.entity.js';
import { SceneEntity } from '../../model/story/entities/scene.entity.js';
import { StartingBondEntity } from '../../model/story/entities/starting-bond.entity.js';
import { StoryEntity } from '../../model/story/entities/story.entity.js';
import { UsageRecordEntity } from '../../model/usage-record/entities/usage-record.entity.js';
import { PersonaEntity } from '../../model/persona/entities/persona.entity.js';

// Every entity must be listed here, or @InjectRepository fails at boot.
export const entities = [
    StoryEntity,
    RoleEntity,
    CharacterEntity,
    StartingBondEntity,
    SceneEntity,
    SettingsEntity,
    UsageRecordEntity,
    ChatEntity,
    MessageEntity,
    MessagePartEntity,
    BondChangeEntity,
    ArcStepEntity,
    SceneAdvanceEntity,
    ChatArcDirectionEntity,
    MemoryEntity,
    MemoryKnownByEntity,
    MemoryChangeEntity,
    PersonaEntity,
];

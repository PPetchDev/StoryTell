import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
    ChatDashboard,
    ChatDetail,
    ChatListItem,
    DashboardBackground,
    DashboardBond,
    DashboardCharacter,
    EditResult,
} from '../../../manager/chat/chat.service.js';
import { ChatSummary } from '../../../model/chat/entities/chat.entity.js';
import { BackgroundCallResponse, BackgroundStatus } from '../../../model/chat/entities/message.entity.js';
import { ArcStepResponse } from '../../../model/ledger/entities/arc-step.entity.js';
import { BondChangeResponse } from '../../../model/ledger/entities/bond-change.entity.js';
import { SceneAdvanceResponse } from '../../../model/ledger/entities/scene-advance.entity.js';
import { RollbackCounts } from '../../../model/ledger/ledger.service.js';
import { MissingFieldDTO } from '../../story/dto/story.response.dto.js';

export class BackgroundCallDTO implements BackgroundCallResponse {
    @ApiProperty({ enum: BackgroundStatus, description: 'pending while the call runs; failed blocks the next send until Retry.' })
    status: BackgroundStatus;

    @ApiProperty({ type: String, nullable: true, description: 'Why the call failed; null otherwise.' })
    error: string | null;
}

export class ChatSummaryDTO implements ChatSummary {
    @ApiProperty()
    id: number;

    @ApiProperty()
    storyId: number;

    @ApiProperty({ description: 'Defaults to "Chat N"; renameable.' })
    title: string;

    @ApiProperty({ description: 'When the Chat was started (ISO 8601).' })
    createdAt: string;

    @ApiProperty({ description: 'When a turn last completed in it (ISO 8601).' })
    lastPlayedAt: string;
}

export class ChatListItemDTO extends ChatSummaryDTO implements ChatListItem {
    @ApiProperty({ type: String, nullable: true, description: 'The Scene the Chat is on; null for free play.' })
    sceneName: string | null;

    @ApiProperty({
        description: 'The latest Message as one plain line of about 100 characters, speakers named, `*` marks dropped.',
    })
    latestLine: string;
}

export class ListChatsResponseBodyDTO {
    @ApiProperty({ type: [ChatListItemDTO], description: 'Most recently played first.' })
    chats: ChatListItemDTO[];
}

export class MessagePartDTO {
    @ApiProperty({ enum: ['narration', 'speech'] })
    kind: 'narration' | 'speech';

    @ApiPropertyOptional({
        type: Number,
        nullable: true,
        description: 'Speech only: the speaking Character, or null for an unknown or removed one.',
    })
    characterId?: number | null;

    @ApiPropertyOptional({ description: 'Speech only: the stamped speaker name.' })
    speakerName?: string;

    @ApiProperty()
    text: string;
}

export class MessageDTO {
    @ApiProperty()
    id: number;

    @ApiProperty({ enum: ['user', 'ai'] })
    kind: 'user' | 'ai';

    @ApiPropertyOptional({ description: 'User Message only.' })
    text?: string;

    @ApiPropertyOptional({ description: 'User Message only: the identity worn, stamped; kept after a rename or delete.' })
    identityName?: string;

    @ApiPropertyOptional({
        type: Number,
        nullable: true,
        description: 'User Message only: the Persona worn; null for the Role and once that Persona is deleted.',
    })
    personaId?: number | null;

    @ApiPropertyOptional({ description: 'AI Message only: the model that wrote it, or "author" for the Opening.' })
    model?: string;

    @ApiPropertyOptional({ type: [MessagePartDTO], description: 'AI Message only, in order.' })
    parts?: MessagePartDTO[];

    @ApiPropertyOptional({
        type: BackgroundCallDTO,
        nullable: true,
        description: 'AI Message only: the Bond, Arc and Scene judge; null on the Opening, which is never judged.',
    })
    judge?: BackgroundCallDTO | null;

    @ApiPropertyOptional({
        type: BackgroundCallDTO,
        nullable: true,
        description: 'AI Message only: Memory extraction; null on the Opening and on replies from before it existed.',
    })
    memory?: BackgroundCallDTO | null;

    @ApiProperty()
    createdAt: string;
}

export class CurrentSceneDTO {
    @ApiProperty()
    id: number;

    @ApiProperty()
    name: string;
}

export class DriftDTO {
    @ApiProperty({ description: 'The model that wrote the last AI Message.' })
    lastModel: string;

    @ApiProperty({ description: 'The play model in Settings now.' })
    playModel: string;
}

/** The whole Chat as the Chat screen reads it. Every write answers with this. */
export class ChatResponseBodyDTO extends ChatSummaryDTO implements Omit<ChatDetail, 'messages'> {
    @ApiProperty({ type: CurrentSceneDTO, nullable: true, description: 'null means free play.' })
    currentScene: CurrentSceneDTO | null;

    @ApiProperty({ description: 'The worn identity, under which the next User Message shows.' })
    identityName: string;

    @ApiProperty({ type: Number, nullable: true, description: "The worn Persona; null while the Chat wears its Story's Role." })
    personaId: number | null;

    @ApiProperty({ description: "The Story's Role's name, which the swap offers beside the Personas." })
    roleName: string;

    @ApiProperty({ type: [MessageDTO], description: 'In order; the Opening is first.' })
    messages: MessageDTO[];

    @ApiProperty({ description: 'True when the last Message is a User Message whose turn failed: Retry applies.' })
    awaitingReply: boolean;

    @ApiProperty({ description: 'False blocks sending.' })
    playable: boolean;

    @ApiProperty({ type: [MissingFieldDTO], description: 'The Story fields still to fill in.' })
    missing: MissingFieldDTO[];

    @ApiProperty({ description: 'True blocks sending.' })
    textCreditOut: boolean;

    @ApiProperty({ description: 'True disables only the camera; play goes on.' })
    imageCreditOut: boolean;

    @ApiProperty()
    playModel: string;

    @ApiProperty({ type: DriftDTO, nullable: true, description: 'Set when the Drift notice shows.' })
    drift: DriftDTO | null;
}

export class RollbackCountsDTO implements RollbackCounts {
    @ApiProperty({ description: 'Memory changes undone by the rewind: adds removed, deletes restored, updates, archives and Known-by additions reverted.' })
    memoryChanges: number;

    @ApiProperty({ description: 'Bond changes undone by the rewind.' })
    bondChanges: number;

    @ApiProperty({ description: 'Arc steps undone by the rewind.' })
    arcSteps: number;

    @ApiProperty({ description: 'Scene advances undone by the rewind; the Chat is back on the Scene it left.' })
    sceneAdvances: number;
}

/** An edit answers with the whole Chat plus what the rewind rolled back, for the notice. */
export class EditMessageResponseBodyDTO extends ChatResponseBodyDTO implements Omit<EditResult, 'messages'> {
    @ApiProperty({ type: RollbackCountsDTO })
    rolledBack: RollbackCountsDTO;
}

export class BondBeforeDTO {
    @ApiProperty()
    label: string;

    @ApiProperty()
    description: string;
}

export class BondChangeDTO implements BondChangeResponse {
    @ApiProperty()
    id: number;

    @ApiProperty()
    fromCharacterId: number;

    @ApiProperty({ type: Number, nullable: true, description: 'null means toward the user.' })
    toCharacterId: number | null;

    @ApiProperty({ description: 'The new label (1–3 words).' })
    label: string;

    @ApiProperty({ description: 'The new description (1–2 sentences).' })
    description: string;

    @ApiProperty({ type: BondBeforeDTO, nullable: true, description: 'The value before; null when they were strangers.' })
    before: BondBeforeDTO | null;

    @ApiProperty({ type: String, nullable: true, description: 'The story event that caused it; null for a StartingBond seed.' })
    event: string | null;

    @ApiProperty({ type: Number, nullable: true, description: 'The causing AI Message; null for a StartingBond seed.' })
    messageId: number | null;

    @ApiProperty()
    createdAt: string;
}

export class BondTowardDTO {
    @ApiProperty({ type: Number, nullable: true, description: 'null means toward the user.' })
    characterId: number | null;

    @ApiProperty({ description: "The Character's name, or the worn identity's for the user." })
    name: string;
}

export class DashboardBondDTO implements DashboardBond {
    @ApiProperty({ type: BondTowardDTO })
    toward: BondTowardDTO;

    @ApiProperty({ description: 'The current label.' })
    label: string;

    @ApiProperty({ description: 'The current description.' })
    description: string;

    @ApiProperty({ type: [BondChangeDTO], description: 'Every change of this Bond, newest first; the seed, if any, last.' })
    history: BondChangeDTO[];
}

export class ArcStepDTO implements ArcStepResponse {
    @ApiProperty()
    id: number;

    @ApiProperty()
    characterId: number;

    @ApiProperty({ description: 'The lasting change to the personality.' })
    step: string;

    @ApiProperty({ description: 'The story event that caused it.' })
    event: string;

    @ApiProperty({ description: 'The causing AI Message.' })
    messageId: number;

    @ApiProperty()
    createdAt: string;
}

export class DashboardCharacterDTO implements DashboardCharacter {
    @ApiProperty()
    id: number;

    @ApiProperty()
    name: string;

    @ApiProperty({ type: [DashboardBondDTO], description: "This Character's current Bonds." })
    bonds: DashboardBondDTO[];

    @ApiProperty({ type: [ArcStepDTO], description: 'Oldest first.' })
    arcSteps: ArcStepDTO[];

    @ApiProperty({ description: 'The Arc directions copied into this Chat; empty when the author wrote none.' })
    arcDirection: string;
}

export class SceneAdvanceDTO implements SceneAdvanceResponse {
    @ApiProperty()
    id: number;

    @ApiProperty({ description: 'The Scene left, stamped.' })
    fromSceneName: string;

    @ApiProperty({ type: String, nullable: true, description: 'The Scene entered, stamped; null means free play.' })
    toSceneName: string | null;

    @ApiProperty({ description: 'The story event that met the move-on condition.' })
    event: string;

    @ApiProperty({ description: 'The causing AI Message.' })
    messageId: number;

    @ApiProperty()
    createdAt: string;
}

export class DashboardSceneDTO {
    @ApiProperty({ type: CurrentSceneDTO, nullable: true, description: 'null means free play.' })
    current: CurrentSceneDTO | null;

    @ApiProperty({ type: SceneAdvanceDTO, nullable: true, description: 'The advance that brought the Chat here; null on the first Scene.' })
    advance: SceneAdvanceDTO | null;
}

export class DashboardBackgroundDTO implements DashboardBackground {
    @ApiProperty()
    messageId: number;

    @ApiProperty({ description: "The Message's position in the Chat." })
    position: number;

    @ApiProperty({ type: BackgroundCallDTO })
    judge: BackgroundCallDTO;

    @ApiProperty({ type: BackgroundCallDTO, nullable: true, description: 'Memory extraction; null on replies from before it existed.' })
    memory: BackgroundCallDTO | null;
}

/** The read-only dashboard opened from the Chat (spec: "Dashboard"). */
export class ChatDashboardResponseBodyDTO implements ChatDashboard {
    @ApiProperty()
    chatId: number;

    @ApiProperty()
    storyId: number;

    @ApiProperty()
    title: string;

    @ApiProperty({ description: 'The worn identity, which Bonds toward the user are shown under.' })
    identityName: string;

    @ApiProperty({ type: [DashboardCharacterDTO], description: 'In cast order.' })
    characters: DashboardCharacterDTO[];

    @ApiProperty({ type: DashboardSceneDTO })
    scene: DashboardSceneDTO;

    @ApiProperty({ type: [DashboardBackgroundDTO], description: 'The most recent AI Messages, newest first.' })
    background: DashboardBackgroundDTO[];
}

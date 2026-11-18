import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
    ArcChange,
    BondTrendPoint,
    ChatBond,
    ChatDashboard,
    ChatDetail,
    ChatList,
    ChatListItem,
    DashboardBackground,
    DashboardBond,
    DashboardCharacter,
    EditResult,
} from '../../../manager/chat/chat.service.js';
import { ChatSummary, TimeOfDay, TIMES_OF_DAY } from '../../../model/chat/entities/chat.entity.js';
import { EMOTIONS } from '../../../model/story/emotion.js';
import type { Emotion } from '../../../model/story/emotion.js';
import { BackgroundCallResponse, BackgroundStatus, MemoriesUsed, MessageRoll, ReplyVersionsResponse } from '../../../model/chat/entities/message.entity.js';
import { GaugeDirection } from '../../../model/story/entities/sudden-event.entity.js';
import type { SuddenEventView } from '../../../manager/chat/sudden-event/sudden-event.js';
import type { EndingView } from '../../../manager/chat/ending/ending.js';
import { BeliefDTO } from '../../memory/dto/belief.response.dto.js';
import { BondLevels } from '../../../model/ledger/bond-axes.js';
import { BondChangeResponse } from '../../../model/ledger/entities/bond-change.entity.js';
import { SceneAdvanceResponse } from '../../../model/ledger/entities/scene-advance.entity.js';
import { RollbackCounts } from '../../../model/ledger/ledger.service.js';
import { MissingFieldDTO } from '../../story/dto/story.response.dto.js';
import { TraySavedReplyDTO } from '../../saved-reply/dto/saved-reply.response.dto.js';
import { ChatReplaceRuleDTO } from '../../replace-rule/dto/replace-rule.response.dto.js';

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

export class BranchedFromDTO {
    @ApiProperty({ description: 'The Chat this one was branched from.' })
    chatId: number;

    @ApiProperty({ description: "That Chat's title now, so a rename shows." })
    title: string;
}

export class BranchedFromMessageDTO extends BranchedFromDTO {
    @ApiProperty({ type: Number, nullable: true, description: 'The Message tapped there (a User Message itself when branched from one); null once it is gone.' })
    messageId: number | null;
}

export class ChatListItemDTO extends ChatSummaryDTO implements ChatListItem {
    @ApiProperty({ type: BranchedFromDTO, nullable: true, description: 'Shown as "Branched from <title>"; null when never branched, or once that Chat is deleted.' })
    branchedFrom: BranchedFromDTO | null;

    @ApiProperty({ type: String, nullable: true, description: 'The Scene the Chat is on; null for free play.' })
    sceneName: string | null;

    @ApiProperty({
        description: 'The latest Message as one plain line of about 100 characters, speakers named, `*` marks dropped.',
    })
    latestLine: string;

    @ApiProperty({ type: () => EndingNameDTO, nullable: true, description: 'The Ending the Chat reached; null when it reached none.' })
    ending: EndingNameDTO | null;
}

export class DiaryLatestDTO {
    @ApiProperty()
    characterId: number;

    @ApiProperty()
    entryId: number;
}

export class EndingNameDTO {
    @ApiProperty({ type: Number, nullable: true, description: "The author's Ending; null for one the Judge suggested." })
    id: number | null;

    @ApiProperty()
    name: string;
}

export class FoundEndingDTO {
    @ApiProperty()
    id: number;

    @ApiProperty()
    name: string;
}

export class EndingsFoundDTO {
    @ApiProperty({ description: "How many Endings of its own the Story has that can be reached. Suggested Endings are not counted." })
    total: number;

    @ApiProperty({ type: [FoundEndingDTO], description: "The ones reached in at least one of the Story's Chats, in the author's order." })
    found: FoundEndingDTO[];
}

export class ListChatsResponseBodyDTO implements ChatList {
    @ApiProperty({ type: [ChatListItemDTO], description: 'Most recently played first.' })
    chats: ChatListItemDTO[];

    @ApiProperty({ type: EndingsFoundDTO, description: "The Story's Endings found so far (.scratch/endings/spec.md)." })
    endings: EndingsFoundDTO;
}

/** A Persona's picture, for the user's lines written as it (.scratch/persona-image/spec.md). */
export class ChatPersonaImageDTO {
    @ApiProperty()
    personaId: number;

    @ApiProperty({ description: 'Served by `GET /api/images/{path}`.' })
    imagePath: string;
}

/** The Ending a Chat reached, as the Chat screen shows it (.scratch/endings/spec.md). */
export class ChatEndingDTO implements EndingView {
    @ApiProperty({ type: Number, nullable: true, description: "The author's Ending; null for one the Judge suggested." })
    id: number | null;

    @ApiProperty({ description: 'The Judge suggested it, in a Story with no Endings of its own: the user may dismiss it.' })
    suggested: boolean;

    @ApiProperty()
    name: string;

    @ApiProperty({ description: 'What brought the story there, in a sentence; may be empty.' })
    reason: string;

    @ApiProperty({ description: 'The AI Message the story reached it with.' })
    messageId: number;
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

    @ApiPropertyOptional({
        enum: EMOTIONS,
        nullable: true,
        description:
            'Speech only, always given: the emotion the Judge tagged the line with, written in the call that marks its judge done. ' +
            'Null until then, on the Opening, and while the Story has no Expressions. Narration has none.',
    })
    emotion?: Emotion | null;
}

export class ReplyVersionsDTO implements ReplyVersionsResponse {
    @ApiProperty({ description: 'The shown version, 1-based, in the order the versions were written.' })
    current: number;

    @ApiProperty({ description: 'How many versions there are, the shown one included; at most 5.' })
    count: number;
}

/** A User Message's Roll (.scratch/roll/spec.md). */
export class MessageRollDTO implements MessageRoll {
    @ApiProperty({ description: 'What the d20 showed, 1 to 20.' })
    value: number;

    @ApiProperty({ description: 'The number it had to reach.' })
    target: number;

    @ApiProperty({ enum: ['critical_success', 'success', 'failure', 'critical_failure'], description: 'A 20 and a 1 are critical; otherwise reaching the number succeeds.' })
    outcome: MessageRoll['outcome'];
}

/** The Chat's Sudden event as the Chat screen shows it (.scratch/sudden-events/spec.md). */
export class ChatSuddenEventDTO implements SuddenEventView {
    @ApiProperty()
    id: number;

    @ApiProperty()
    name: string;

    @ApiProperty({ description: 'What the Gauge measures.' })
    gauge: string;

    @ApiProperty({ enum: GaugeDirection })
    direction: GaugeDirection;

    @ApiProperty({ enum: ['active', 'success', 'failure'], description: 'Under way, or how it ended with the newest reply.' })
    status: SuddenEventView['status'];

    @ApiProperty({ description: 'The Gauge now, 0 to 100.' })
    value: number;

    @ApiProperty({ description: 'Where the Gauge started.' })
    start: number;

    @ApiProperty({ description: 'The Gauge the user must reach.' })
    goal: number;

    @ApiProperty({ description: 'The end of the Gauge that fails at once.' })
    fail: number;

    @ApiProperty({ description: 'The replies the user still has; 0 once it has ended.' })
    turnsLeft: number;

    @ApiProperty({ description: 'Why the Gauge last moved, or why the event began; may be empty.' })
    reason: string;
}

/** What one Character is wearing now in the Chat (.scratch/info-box/spec.md). */
export class ChatOutfitDTO {
    @ApiProperty()
    characterId: number;

    @ApiProperty({ description: 'A short phrase.' })
    outfit: string;
}

export class ChatGoalDTO {
    @ApiProperty()
    characterId: number;

    @ApiProperty({ description: 'A short phrase, from the Character\'s side.' })
    goal: string;
}

export class ChatNowNoteDTO {
    @ApiProperty()
    characterId: number;

    @ApiProperty({ description: 'What has lastingly changed about the Character in this Chat, as facts (.scratch/growing-cards/spec.md); `{user}` stands for the user.' })
    note: string;
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

    @ApiPropertyOptional({ type: MessageRollDTO, nullable: true, description: 'User Message only: the Roll it was sent with; null without one.' })
    roll?: MessageRollDTO | null;

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

    @ApiPropertyOptional({
        type: ReplyVersionsDTO,
        nullable: true,
        description: 'AI Message only: its Reply versions (‹ n/m ›); null while it has only one. Only the newest AI Message has more.',
    })
    versions?: ReplyVersionsDTO | null;

    @ApiPropertyOptional({ description: "AI Message only: whether it was written as the story's Epilogue." })
    epilogue?: boolean;

    @ApiProperty()
    createdAt: string;

    @ApiProperty({
        type: String,
        nullable: true,
        description:
            'Its current Thai reading: the one made from its stored text as it is now; null when none was made for this text. Never part of the Chat (no prompt, no Transcript).',
    })
    thaiReading: string | null;

    @ApiProperty({ type: () => MessageThoughtDTO, isArray: true, description: 'What each Character thought before this reply, in order; empty for none. Shown only when asked for.' })
    thoughts: MessageThoughtDTO[];
}

export class MessageThoughtDTO {
    @ApiProperty()
    characterId: number;

    @ApiProperty()
    characterName: string;

    @ApiProperty({ description: 'One to three sentences in the first person.' })
    text: string;
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

    @ApiProperty({ description: "The last model's proper name, or its stored id once it has left the list." })
    lastModelLabel: string;

    @ApiProperty({ description: "The play model's proper name." })
    playModelLabel: string;
}

/** A Bond's level on each Bond axis (.scratch/bond-axes/spec.md); the user only ever sees them in words. */
export class BondLevelsDTO implements BondLevels {
    @ApiProperty({ minimum: -3, maximum: 3, description: 'betrayed (−3) … trusts completely (+3).' })
    trust: number;

    @ApiProperty({ minimum: -3, maximum: 3, description: 'hates (−3) … devoted (+3).' })
    affection: number;

    @ApiProperty({ minimum: -3, maximum: 3, description: 'repelled (−3) … aches for (+3).' })
    desire: number;

    @ApiProperty({ minimum: 0, maximum: 3, description: 'at ease (0) … at breaking point (3).' })
    tension: number;
}

export class ChatBondDTO implements ChatBond {
    @ApiProperty()
    fromCharacterId: number;

    @ApiProperty({ type: Number, nullable: true, description: 'null means toward the user.' })
    toCharacterId: number | null;

    @ApiProperty({ description: 'The current label.' })
    label: string;

    @ApiProperty({ type: BondLevelsDTO, nullable: true, description: 'null while the Bond has no levels yet.' })
    levels: BondLevelsDTO | null;
}

/** What the last turn's Memory choice sent (.scratch/memory-by-meaning/spec.md: "Used last turn"). */
export class MemoriesInPlayDTO implements MemoriesUsed {
    @ApiProperty({ type: [Number], description: 'The Memories the last turn sent; empty before any turn chose.' })
    memoryIds: number[];

    @ApiProperty({ type: [Number], description: 'The Beliefs the last turn sent; empty before any turn chose.' })
    beliefIds: number[];
}

/** The whole Chat as the Chat screen reads it. Every write answers with this. */
export class ChatResponseBodyDTO extends ChatSummaryDTO implements Omit<ChatDetail, 'messages'> {
    @ApiProperty({ type: CurrentSceneDTO, nullable: true, description: 'null means free play.' })
    currentScene: CurrentSceneDTO | null;

    @ApiProperty({ enum: TIMES_OF_DAY, nullable: true, description: 'The Time of day in the story; null until the story makes one clear.' })
    timeOfDay: TimeOfDay | null;

    @ApiProperty({ type: ChatSuddenEventDTO, nullable: true, description: 'The Sudden event under way, or the one that ended with the newest reply; null otherwise.' })
    suddenEvent: ChatSuddenEventDTO | null;

    @ApiProperty({ type: ChatEndingDTO, nullable: true, description: 'The Ending the Chat reached; null when it reached none.' })
    ending: ChatEndingDTO | null;

    @ApiProperty({
        type: Boolean,
        nullable: true,
        description: "Whether the Judge may suggest an Ending in this Chat; null when the Story has Endings of its author's, which are the only ones it can reach.",
    })
    endingSuggestions: boolean | null;

    @ApiProperty({ description: 'Whether the Characters write Diary entries by themselves as the story goes. On by default.' })
    autoDiary: boolean;

    @ApiProperty({ description: 'Whether each Character thinks on their own before a reply. On by default.' })
    characterThoughts: boolean;

    @ApiProperty({ description: 'Diary entries are being written by themselves right now; re-read the Chat until this is false.' })
    diaryWriting: boolean;

    @ApiProperty({ type: () => DiaryLatestDTO, isArray: true, description: "Each Character's newest Diary entry, in cast order; Characters with none are left out." })
    diaryLatest: DiaryLatestDTO[];

    @ApiProperty({ description: "The number a Roll sent now must reach, from the Story's Difficulty." })
    rollTarget: number;

    @ApiProperty({ type: String, nullable: true, description: 'Where the story is now; null until the story makes it clear.' })
    place: string | null;

    @ApiProperty({ type: String, nullable: true, description: 'The weather in the story now; null until the story shows it.' })
    weather: string | null;

    @ApiProperty({ type: [ChatOutfitDTO], description: 'What each Character is wearing now, for those the story has shown, in cast order.' })
    outfits: ChatOutfitDTO[];

    @ApiProperty({ type: () => ChatGoalDTO, isArray: true, description: 'What each Character is after now, for those who are after something, in cast order.' })
    goals: ChatGoalDTO[];

    @ApiProperty({ type: () => ChatNowNoteDTO, isArray: true, description: "Each Character's Now note, for those with one, in cast order." })
    nowNotes: ChatNowNoteDTO[];

    @ApiProperty({ description: 'The worn identity, under which the next User Message shows.' })
    identityName: string;

    @ApiProperty({ type: Number, nullable: true, description: "The worn Persona; null while the Chat wears its Story's Role." })
    personaId: number | null;

    @ApiProperty({
        type: [ChatPersonaImageDTO],
        description: 'The pictures of the Personas in this Chat: the worn one and those its User Messages were written as, where they still exist and have one.',
    })
    personaImages: ChatPersonaImageDTO[];

    @ApiProperty({ description: "The Story's Role's name, which the swap offers beside the Personas, its placeholders filled with this Chat's answers." })
    roleName: string;

    @ApiProperty({
        type: 'object',
        additionalProperties: { type: 'string' },
        nullable: true,
        description: "What this Chat answered to its Story's Opening questions, by placeholder key; null when it was asked none.",
    })
    openingAnswers: Record<string, string> | null;

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

    @ApiProperty({
        type: BranchedFromMessageDTO,
        nullable: true,
        description: 'The Chat menu line "Branched from <title>"; null when never branched, or once that Chat is deleted.',
    })
    branchedFrom: BranchedFromMessageDTO | null;

    @ApiProperty({ description: "The Chat's Author's note, the user's standing direction; empty when there is none." })
    authorsNote: string;

    @ApiProperty({ description: 'Read replies aloud: new replies of turns started in a tab play by themselves there. Off by default.' })
    autoRead: boolean;

    @ApiProperty({ type: [Number], description: 'The ids of the Characters sitting out of this Chat, in cast order; empty when everyone is in.' })
    sittingOut: number[];

    @ApiProperty({ type: [TraySavedReplyDTO], description: "The composer tray's Saved replies: the Story's own, then the app-wide ones, each in add order." })
    savedReplies: TraySavedReplyDTO[];

    @ApiProperty({ type: [ChatReplaceRuleDTO], description: "The Chat's Replace rules in apply order, app-wide then the Story's; parked rules (both targets off) left out." })
    replaceRules: ChatReplaceRuleDTO[];

    @ApiProperty({ type: [ChatBondDTO], description: 'Every current Bond in the Chat, with its levels or null.' })
    bonds: ChatBondDTO[];

    @ApiProperty({ type: MemoriesInPlayDTO, description: 'The Memories and Beliefs the last turn sent, for "In play" in the Memory drawer.' })
    memoriesInPlay: MemoriesInPlayDTO;

    @ApiProperty({ type: [BeliefDTO], description: 'Every Belief of the Chat, given-up ones included, oldest first.' })
    beliefs: BeliefDTO[];
}

/** A Branch answers with the new Chat, plus the User Message's text when it was branched from one. */
export class BranchResponseBodyDTO extends ChatResponseBodyDTO {
    @ApiProperty({ type: String, nullable: true, description: "The User Message's text, for the new Chat's composer; null when branched from an AI Message." })
    draft: string | null;
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

    @ApiProperty({ type: BondLevelsDTO, nullable: true, description: 'The current levels; null while the Bond has none yet.' })
    levels: BondLevelsDTO | null;

    @ApiProperty({ type: [BondChangeDTO], description: 'Every change of this Bond, newest first; the seed, if any, last.' })
    history: BondChangeDTO[];

    @ApiProperty({ type: () => [BondTrendPointDTO], description: 'The same changes oldest first, as the Bond chart draws them.' })
    trend: BondTrendPointDTO[];
}

export class BondTrendPointDTO implements BondTrendPoint {
    @ApiProperty({ description: 'The change, as the history lists it.' })
    id: number;

    @ApiProperty({ type: Number, nullable: true, description: 'The causing Message; null for the seed.' })
    messageId: number | null;

    @ApiProperty({ type: Number, nullable: true, description: "That Message's place in the Chat; null for the seed, which stands at the start." })
    position: number | null;

    @ApiProperty({ type: BondLevelsDTO, nullable: true, description: 'Its levels after the change; null while the Bond had none.' })
    levels: BondLevelsDTO | null;

    @ApiProperty({ description: 'True where the label changed: a pin on the chart. Never on the seed.' })
    labelChanged: boolean;
}

/** One change to a Character's Arc: its cause and Message, never the step's words (.scratch/arc-changes/spec.md). */
export class ArcChangeDTO implements ArcChange {
    @ApiProperty({ description: 'The causing AI Message.' })
    messageId: number;

    @ApiProperty({ description: 'The story event that caused it, shown as "After …".' })
    cause: string;

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

    @ApiProperty({
        type: [ArcChangeDTO],
        description: 'Every change to their Arc, in story order. Neither the Arc direction nor the step text is given in play.',
    })
    arcChanges: ArcChangeDTO[];
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

    @ApiProperty({ description: "The newest Message's place in the Chat: where the Bond charts end." })
    lastPosition: number;
}

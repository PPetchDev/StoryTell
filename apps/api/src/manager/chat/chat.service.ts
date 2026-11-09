import { Injectable, Logger } from '@nestjs/common';

import {
    AwaitingReplyError,
    BackgroundCallName,
    BackgroundFailedError,
    BackgroundStillSavingError,
    ChatNotFoundError,
    EmptyMessageError,
    MessageNotFoundError,
    NoFailedExtractionError,
    NoFailedJudgeError,
    NoTurnToRetryError,
    NotRegenerableError,
    NudgeSittingOutError,
    ReplyVersionNotFoundError,
    StoryNotPlayableError,
    TurnInProgressError,
} from '../../errors/chat.errors.js';
import { OutOfCreditError } from '../../errors/model-gateway.errors.js';
import { PersonaNotFoundError } from '../../errors/persona.errors.js';
import { CharacterNotFoundError, StoryNotFoundError } from '../../errors/story.errors.js';
import { BranchModelService } from '../../model/branch/branch.service.js';
import { ChatModelService } from '../../model/chat/chat.service.js';
import { ChatEntity, ChatSummary, TimeOfDay } from '../../model/chat/entities/chat.entity.js';
import { ThaiReadingEntity } from '../../model/chat/entities/thai-reading.entity.js';
import {
    AUTHOR_MODEL,
    BackgroundCallResponse,
    BackgroundStatus,
    MessageEntity,
    MessageKind,
    MessageResponse,
} from '../../model/chat/entities/message.entity.js';
import { ArcStepResponse } from '../../model/ledger/entities/arc-step.entity.js';
import { BondChangeResponse } from '../../model/ledger/entities/bond-change.entity.js';
import { SceneAdvanceResponse } from '../../model/ledger/entities/scene-advance.entity.js';
import { LedgerModelService, LedgerState, RollbackCounts } from '../../model/ledger/ledger.service.js';
import { MemoryEntity } from '../../model/memory/entities/memory.entity.js';
import { MemoryModelService } from '../../model/memory/memory.service.js';
import { PersonaModelService } from '../../model/persona/persona.service.js';
import { SnapshotModelService } from '../../model/snapshot/snapshot.service.js';
import { SettingsModelService } from '../../model/settings/settings.service.js';
import { StoryEntity } from '../../model/story/entities/story.entity.js';
import { StoryModelService } from '../../model/story/story.service.js';
import { ModelGateway, playModelName, TextCompletionRequest, TextCompletionResult } from '../../service/model-gateway/model-gateway.js';
import { latestLine } from '../excerpt.js';
import { exchangeUserText } from './exchange.js';
import { MissingField, playableStatus } from '../story/playable.js';
import { WornIdentity, wornIdentity } from './identity.js';
import { currentBonds, JudgeManagerService, latestJudged, SettledBackground } from './judge/judge.service.js';
import { latestExtracted, MemoryExtractionManagerService } from './memory/extraction.service.js';
import { charactersInExchange } from './memory/present.js';
import { promptStorySoFar, StorySoFarManagerService } from './story-so-far/story-so-far.service.js';
import { SuggestedRepliesManagerService } from './suggestions/suggested-replies.service.js';
import { WriteForMeManagerService } from './write-for-me/write-for-me.service.js';
import { ThaiReadingManagerService } from './thai-reading/thai-reading.service.js';
import { sourceFingerprint, thaiReadingSource } from './thai-reading/thai-reading.js';
import { SuggestedReply } from './suggestions/suggestions-prompt.js';
import { buildTurnPrompt, PromptArc, PromptBond, PromptHistoryMessage, PromptLayersInput, PromptMemory } from './turn/prompt.js';
import { chosenLore, LoreInPlay, loreInPlayOf, promptLore, selectLoreAt } from './lore/lore-select.js';
import { documentQuery } from '../document/document-search.js';
import { DocumentSearchManagerService, DocumentsInPlay, hasDocumentPassages } from './document-search.service.js';
import { CastName, ParseOptions, parseReply, partsToText, releasedText, ReplyPart } from './turn/reply-parser.js';
import { TurnStoppedError, TurnStream } from './turn/turn-stream.js';

/** A Chat as a Story's Chat list shows it (spec: "Lists and Home"). */
export interface ChatListItem extends ChatSummary {
    /** The Scene the Chat is on; null means free play. */
    sceneName: string | null;
    /** The latest Message as one plain line of about 100 characters. */
    latestLine: string;
    /** The Chat it was branched from, with that Chat's title now; null when never branched or that Chat is gone. */
    branchedFrom: { chatId: number; title: string } | null;
}

/** A Message on the Chat screen: what it is, and its current Thai reading or null. */
export type ChatMessageResponse = MessageResponse & { thaiReading: string | null };

/** A Chat as the Chat screen reads it: its Messages plus everything the notice line needs. */
export interface ChatDetail extends ChatSummary {
    /** The Scene the Chat is on; null means free play. */
    currentScene: { id: number; name: string } | null;
    /** The Time of day in the story (spec: "Story clock"); null until the story makes one clear. */
    timeOfDay: TimeOfDay | null;
    /** The worn identity's name, under which the next User Message shows. */
    identityName: string;
    /** The worn Persona; null while the Chat wears its Story's Role. */
    personaId: number | null;
    /** The Story's Role's name, which the swap offers beside the Personas. */
    roleName: string;
    /** Each with its current Thai reading (.scratch/write-for-me/spec.md), or null. */
    messages: ChatMessageResponse[];
    /** True when the last Message is a User Message, so its turn failed and Retry applies. */
    awaitingReply: boolean;
    playable: boolean;
    missing: MissingField[];
    /** True when the text pool's remaining credit is known and used up. */
    textCreditOut: boolean;
    /** The same for the image pool: it disables only the camera. */
    imageCreditOut: boolean;
    playModel: string;
    /** Set when the last AI Message came from a different model than the current play model. */
    drift: { lastModel: string; playModel: string; lastModelLabel: string; playModelLabel: string } | null;
    /**
     * The Chat it was branched from, with that Chat's title now and the Message the user tapped
     * there (null once that Message is gone); null when never branched or that Chat is gone.
     */
    branchedFrom: { chatId: number; title: string; messageId: number | null } | null;
    /** The Author's note (.scratch/authors-note/spec.md); empty when there is none. */
    authorsNote: string;
    /** The ids of the Characters sitting out (.scratch/speaker-controls/spec.md), in cast order. */
    sittingOut: number[];
}

/** What a Branch answers with: the new Chat, plus the User Message's text when it was branched from one. */
export interface BranchResult extends ChatDetail {
    draft: string | null;
}

/** What an edit answers with: the Chat, plus what the rewind rolled back for the notice. */
export interface EditResult extends ChatDetail {
    rolledBack: RollbackCounts;
}

/** A Bond as the dashboard shows it: its current value, expandable to its history. */
export interface DashboardBond {
    toward: { characterId: number | null; name: string };
    label: string;
    description: string;
    /** Every change of this Bond, newest first; the seed, if any, comes last. */
    history: BondChangeResponse[];
}

export interface DashboardCharacter {
    id: number;
    name: string;
    bonds: DashboardBond[];
    /** Oldest first. */
    arcSteps: ArcStepResponse[];
    /** The Arc directions copied into this Chat. */
    arcDirection: string;
}

export interface DashboardBackground {
    messageId: number;
    position: number;
    judge: BackgroundCallResponse;
    /** null on replies from before ticket 28, which were never extracted from. */
    memory: BackgroundCallResponse | null;
}

/** The read-only dashboard (spec: "Dashboard"). */
export interface ChatDashboard {
    chatId: number;
    storyId: number;
    title: string;
    identityName: string;
    characters: DashboardCharacter[];
    scene: {
        current: { id: number; name: string } | null;
        /** The advance that brought the Chat here; null while it is still on the first Scene. */
        advance: SceneAdvanceResponse | null;
    };
    /** The background status of the most recent AI Messages, newest first. */
    background: DashboardBackground[];
}

/** How many Reply versions the newest AI Message keeps, the shown one included (spec: .scratch/swipe/spec.md). */
export const MAX_REPLY_VERSIONS = 5;

const NOTHING_ROLLED_BACK: RollbackCounts = { memoryChanges: 0, bondChanges: 0, arcSteps: 0, sceneAdvances: 0 };

/** How many recent AI Messages the dashboard lists the background status of. */
export const DASHBOARD_BACKGROUND_MESSAGES = 10;

/**
 * Chats and the turn engine (spec: "Chat and turn engine"). One play-model call writes the
 * whole turn; the reply is parsed and guarded, and an AI Message is stored only once it is
 * complete, after which the judge and Memory extraction run in the background in parallel.
 */
@Injectable()
export class ChatManagerService {
    private readonly logger = new Logger(ChatManagerService.name);
    /** Chats whose turn is being written right now. */
    private readonly inFlight = new Set<number>();

    constructor(
        private readonly chatModel: ChatModelService,
        private readonly branchModel: BranchModelService,
        private readonly storyModel: StoryModelService,
        private readonly settingsModel: SettingsModelService,
        private readonly ledger: LedgerModelService,
        private readonly memoryModel: MemoryModelService,
        private readonly personaModel: PersonaModelService,
        private readonly snapshotModel: SnapshotModelService,
        private readonly judge: JudgeManagerService,
        private readonly extraction: MemoryExtractionManagerService,
        private readonly suggestedReplies: SuggestedRepliesManagerService,
        private readonly writeForMeWriter: WriteForMeManagerService,
        private readonly thaiReadings: ThaiReadingManagerService,
        private readonly storySoFar: StorySoFarManagerService,
        private readonly documentSearch: DocumentSearchManagerService,
        private readonly gateway: ModelGateway,
    ) {}

    async listChats(storyId: number): Promise<ChatListItem[]> {
        const story = await this.loadStory(storyId);
        const chats = await this.chatModel.findByStory(storyId);
        const latest = await this.chatModel.findLatestMessages(chats.map((chat) => chat.id));
        const latestOf = new Map(latest.map((message) => [message.chatId, message]));
        const titleOf = new Map(chats.map((chat) => [chat.id, chat.title]));
        return chats.map((chat) => {
            const sourceTitle = chat.branchedFromChatId === null ? undefined : titleOf.get(chat.branchedFromChatId);
            return {
                ...chat.toSummary(),
                sceneName: story.scenes.find((scene) => scene.id === chat.currentSceneId)?.name ?? null,
                latestLine: latestLine(latestOf.get(chat.id)),
                branchedFrom: sourceTitle === undefined ? null : { chatId: chat.branchedFromChatId!, title: sourceTitle },
            };
        });
    }

    /**
     * Spec: "Starting a Chat". The Opening becomes Message 1; the first Scene, or free play;
     * StartingBonds seed the first BondChanges and Arc directions are copied in.
     */
    async createChat(storyId: number): Promise<ChatDetail> {
        const story = await this.loadStory(storyId);
        this.requirePlayable(story);

        const existing = await this.chatModel.findByStory(storyId);
        const chat = await this.chatModel.saveChat(
            this.chatModel.createChat({
                storyId,
                title: defaultTitle(existing.map((other) => other.title)),
                currentSceneId: story.scenes[0]?.id ?? null,
            }),
        );
        await this.copyOpening(story, chat.id);
        await this.seedLedger(story, chat.id);
        return this.getChat(storyId, chat.id);
    }

    /**
     * Spec: "Reset Chat". The title and the worn identity stay; every Message, all Memory,
     * the Bond history, Arc steps, Scene advances and copied Arc directions go; the Opening as it is
     * now comes in again as Message 1, StartingBonds and Arc directions are re-seeded from
     * the current Story, and the Chat returns to the first Scene or free play. Snapshots lose
     * their Message link with the Messages (ON DELETE SET NULL). Like starting a Chat, it
     * needs a playable Story.
     */
    async resetChat(storyId: number, chatId: number): Promise<ChatDetail> {
        const { story, chat: loaded } = await this.load(storyId, chatId);
        this.requirePlayable(story);
        if (this.inFlight.has(loaded.id)) throw new TurnInProgressError();
        const chat = await this.settledForWrite(loaded);

        // Under the turn lock, so a Branch never copies a half-reset Chat.
        return this.writingTurn(chat.id, async () => {
            await this.ledger.clear(chat.id);
            // Column updates, not a save of the loaded Chat: a save would write its old Story so far back.
            await this.chatModel.setCurrentScene(chat.id, story.scenes[0]?.id ?? null);
            await this.storySoFar.clear(chat.id);
            await this.chatModel.clearMessages(chat.id);
            await this.copyOpening(story, chat.id);
            await this.seedLedger(story, chat.id);
            return this.getChat(storyId, chatId);
        });
    }

    /**
     * Spec: "Edit User Message N" and "Edit AI Message N". Every Message after it is deleted
     * for good, and every change those Messages caused is rolled back, newest first. An
     * edited User Message gets a fresh reply through the same turn as a send, so a failed
     * one leaves it with Retry. An edited AI Message loses its own changes too, is re-split
     * into parts from its `@Name:` text, and both background calls run again on it; the Chat
     * then waits for the user. The Opening copy is never judged or extracted from.
     */
    async editMessage(
        storyId: number,
        chatId: number,
        messageId: number,
        text: string,
        stream?: TurnStream,
        nudgeCharacterId?: number | null,
    ): Promise<EditResult> {
        if (text.trim() === '') throw new EmptyMessageError();
        const { story, chat: loaded } = await this.load(storyId, chatId);
        const found = loaded.messages.find((message) => message.id === messageId);
        if (!found) throw new MessageNotFoundError();

        if (found.kind === MessageKind.User) {
            const nudge = nudgeOf(story, loaded, nudgeCharacterId);
            const chat = await this.requireSendable(story, loaded);
            return this.writingTurn(chat.id, () =>
                // The fresh reply is written to the identity worn now, so the edited text is stamped with it.
                this.rewindAndWrite(
                    story,
                    chat.id,
                    found.position + 1,
                    () => this.chatModel.rewriteUserMessage(found, text, wornIdentity(story, chat)),
                    stream,
                    nudge,
                ),
            );
        }

        if (this.inFlight.has(loaded.id)) throw new TurnInProgressError();
        const chat = await this.settledForWrite(loaded);
        const message = chat.messages.find((candidate) => candidate.id === messageId) ?? found;
        // The user wrote this text, like the author wrote the Opening: the guard is off.
        const reply = parseReply(text, story.characters, wornIdentity(story, chat).name, { guard: false });
        for (const name of reply.unknownSpeakers) {
            this.logger.warn(`Chat ${chat.id}: unknown speaker "${name}" in the edited Message; kept by name with no Character link`);
        }
        // Under the turn lock, so a Branch never copies a half-made edit.
        return this.writingTurn(chat.id, async () => {
            const rolledBack = await this.ledger.rollbackFrom(chat.id, message.position);
            await this.storySoFar.rewound(chat, message.position);
            await this.chatModel.rewriteAiMessage(message, reply.parts);
            // Its Snapshots show a moment the edit took away; they stay in the Gallery.
            await this.snapshotModel.clearMessageLinks([message.id]);
            if (message.model !== AUTHOR_MODEL) await this.rerunBackground(story, chat.id, message.id);
            return { ...(await this.getChat(storyId, chatId)), rolledBack };
        });
    }

    /**
     * Spec: "Regenerate" and .scratch/swipe/spec.md. The newest AI Message is written again,
     * under the same gate as a send. Its Memory, Bond, Arc and Scene changes are rolled back as
     * an edit's are; then the turn runs again from the history without it (the User Message's
     * turn when one comes before it, a Continue otherwise), and the new reply is written into
     * the same Message as its last Reply version. The replaced one is kept as a version, with
     * its Snapshots. On a failed or stopped turn the Message keeps the reply it had; since its
     * changes were rolled back for the new turn's prompt, both background calls run on it again.
     */
    async regenerateMessage(
        storyId: number,
        chatId: number,
        messageId: number,
        stream?: TurnStream,
        nudgeCharacterId?: number | null,
    ): Promise<EditResult> {
        const { story, chat: loaded } = await this.load(storyId, chatId);
        // First: mid-turn, the Message may already be gone, deleted by the Regenerate under way.
        if (this.inFlight.has(loaded.id)) throw new TurnInProgressError();
        const message = loaded.messages.find((candidate) => candidate.id === messageId);
        if (!message) throw new MessageNotFoundError();
        const newest = loaded.messages[loaded.messages.length - 1];
        if (message !== newest || message.kind !== MessageKind.Ai || message.model === AUTHOR_MODEL) {
            throw new NotRegenerableError();
        }
        const nudge = nudgeOf(story, loaded, nudgeCharacterId);
        const chat = await this.requireSendable(story, loaded);

        return this.writingTurn(chat.id, async () => {
            // Stopped while the gate waited: nothing is rolled back or changed.
            if (stream?.signal.aborted) throw new TurnStoppedError();
            const rolledBack = await this.ledger.rollbackFrom(chat.id, message.position);
            await this.storySoFar.rewound(await this.reload(chat.id), message.position);
            // Reloaded: the rollback may have put the Chat back on an earlier Scene.
            const rewound = await this.reload(chat.id);
            const replaced = rewound.messages.find((candidate) => candidate.id === message.id) ?? message;
            rewound.messages = rewound.messages.filter((candidate) => candidate.id !== message.id);
            try {
                await this.writeTurn(story, rewound, stream, replaced, nudge);
            } catch (error) {
                await this.rerunBackground(story, chat.id, message.id);
                throw error;
            }
            return { ...(await this.getChat(story.id, chat.id)), rolledBack };
        });
    }

    /**
     * Spec: .scratch/swipe/spec.md, "Choosing a version". Shows the newest AI Message's Reply
     * version `version` (1-based, in the order they were written). Under the same gate as an AI
     * Message edit: the shown version's changes are rolled back, the two swap, and both
     * background calls run on the chosen one. The version already shown changes nothing.
     */
    async chooseReplyVersion(storyId: number, chatId: number, messageId: number, version: number): Promise<EditResult> {
        const { story, chat: loaded } = await this.load(storyId, chatId);
        if (this.inFlight.has(loaded.id)) throw new TurnInProgressError();
        const found = loaded.messages.find((candidate) => candidate.id === messageId);
        if (!found) throw new MessageNotFoundError();
        const ordinal = found.versionOrder()[version - 1];
        if (ordinal === undefined) throw new ReplyVersionNotFoundError();
        if (ordinal === (found.versionOrdinal ?? 1)) return { ...(await this.detail(story, loaded)), rolledBack: NOTHING_ROLLED_BACK };
        const settled = await this.settledForWrite(loaded);

        return this.writingTurn(settled.id, async () => {
            // Read again inside the lock: a send meanwhile may have dropped the versions.
            const chat = await this.reload(settled.id);
            const message = chat.messages.find((candidate) => candidate.id === messageId);
            const chosen = message?.versions?.find((candidate) => candidate.ordinal === ordinal);
            if (!message || !chosen) throw new ReplyVersionNotFoundError();
            const rolledBack = await this.ledger.rollbackFrom(chat.id, message.position);
            await this.storySoFar.rewound(chat, message.position);
            await this.chatModel.chooseVersion(message, chosen);
            this.startBackground(story, chat.id, message.id);
            return { ...(await this.getChat(storyId, chatId)), rolledBack };
        });
    }

    /**
     * Spec: .scratch/branch/spec.md. A new Chat holding the source's Messages up to and including
     * Message N, with everything the Chat knew there; the source is not touched. From a User
     * Message, N is the Message before it. No model is called, so neither an unplayable Story nor
     * credit being out nor a failed background call blocks it. Like an AI Message edit it waits
     * for pending background calls, and it holds the source's turn lock while it copies.
     * Answers with the new Chat, and the User Message's text as `draft` for its composer.
     */
    async branchChat(storyId: number, chatId: number, messageId: number): Promise<BranchResult> {
        const { chat: loaded } = await this.load(storyId, chatId);
        if (this.inFlight.has(loaded.id)) throw new TurnInProgressError();
        if (!loaded.messages.some((candidate) => candidate.id === messageId)) throw new MessageNotFoundError();
        const settled = await this.settledForWrite(loaded);

        return this.writingTurn(settled.id, async () => {
            // Read again inside the lock: an edit meanwhile may have deleted the Message.
            const chat = await this.reload(settled.id);
            const message = chat.messages.find((candidate) => candidate.id === messageId);
            if (!message) throw new MessageNotFoundError();
            const fromUser = message.kind === MessageKind.User;
            // A User Message is never first (the Opening is), so there is always a Message before it.
            const through = fromUser ? message.position - 1 : message.position;
            const taken = (await this.chatModel.findByStory(storyId)).map((other) => other.title);
            const branchId = await this.branchModel.copy(chat.id, through, {
                title: branchTitle(chat.title, taken),
                branchedFromMessageId: message.id,
            });
            const draft = fromUser ? (message.text ?? '') : null;
            return { ...(await this.getChat(storyId, branchId)), draft };
        });
    }

    /** Both background calls again on an AI Message whose ledger changes were just rolled back. */
    private async rerunBackground(story: StoryEntity, chatId: number, messageId: number): Promise<void> {
        await this.chatModel.setJudgeStatus(messageId, BackgroundStatus.Pending);
        await this.chatModel.setMemoryStatus(messageId, BackgroundStatus.Pending);
        this.startBackground(story, chatId, messageId);
    }

    /**
     * Inside the turn lock: rolls back every change from `fromPosition` on, applies `change`
     * to the Messages, then writes the turn, answering with what was rolled back. Shared by a
     * User Message edit. A failed turn throws with the rollback and change kept.
     */
    private async rewindAndWrite(
        story: StoryEntity,
        chatId: number,
        fromPosition: number,
        change: () => Promise<void>,
        stream: TurnStream | undefined,
        nudge: string | null,
    ): Promise<EditResult> {
        // Stopped while the gate waited: nothing is rolled back or changed.
        if (stream?.signal.aborted) throw new TurnStoppedError();
        const rolledBack = await this.ledger.rollbackFrom(chatId, fromPosition);
        await this.storySoFar.rewound(await this.reload(chatId), fromPosition);
        await change();
        // Reloaded: the rollback may have put the Chat back on an earlier Scene.
        await this.writeTurn(story, await this.reload(chatId), stream, undefined, nudge);
        return { ...(await this.getChat(story.id, chatId)), rolledBack };
    }

    /** Spec: "Start both background calls in parallel, with their status set to pending." */
    private startBackground(story: StoryEntity, chatId: number, messageId: number): void {
        const judged = this.judge.run(story, chatId, messageId);
        const extracted = this.extraction.run(story, chatId, messageId);
        // Spec: "Story so far". Once both are done, so it measures the Memory they leave; never awaited.
        void Promise.allSettled([judged, extracted]).then(() =>
            this.storySoFar.start(story, chatId, (chat) => this.promptLayersFor(story, chat)),
        );
    }

    /** The Opening becomes Message 1 with model "author", split by the same parser as replies. */
    private async copyOpening(story: StoryEntity, chatId: number): Promise<void> {
        // The author wrote the Opening, so the guard that cuts lines written as the Role is off.
        const opening = parseReply(story.opening, story.characters, story.role.name, { guard: false });
        await this.chatModel.addAiMessage(chatId, 0, AUTHOR_MODEL, opening.parts, null);
    }

    /** Spec: StartingBonds seed the Chat's first BondChanges, Arc directions are copied in. */
    private seedLedger(story: StoryEntity, chatId: number): Promise<void> {
        return this.ledger.seed(
            chatId,
            story.startingBonds.map((bond) => ({
                fromCharacterId: bond.fromCharacterId,
                toCharacterId: bond.toCharacterId,
                label: bond.label,
                description: bond.description,
            })),
            story.characters
                .filter((character) => character.arcDirections.trim() !== '')
                .map((character) => ({ characterId: character.id, text: character.arcDirections })),
        );
    }

    async getChat(storyId: number, chatId: number): Promise<ChatDetail> {
        const { story, chat } = await this.load(storyId, chatId);
        return this.detail(story, chat);
    }

    async renameChat(storyId: number, chatId: number, title: string): Promise<ChatDetail> {
        const { story, chat } = await this.load(storyId, chatId);
        if (title.trim() !== '') {
            chat.title = title.trim();
            // Only the title: saving the loaded Chat could write back a Story so far updated meanwhile.
            await this.chatModel.setTitle(chat.id, chat.title);
        }
        return this.detail(story, chat);
    }

    /**
     * Spec: "swap worn identity". The Chat wears the Persona from now on, or its Story's Role
     * for null. Chat state outside the ledger: an edit never rolls it back and reset keeps
     * it. Messages already written keep the identity stamped on them; a turn already being
     * written finishes under the identity it started with.
     */
    async swapIdentity(storyId: number, chatId: number, personaId: number | null): Promise<ChatDetail> {
        const { chat } = await this.load(storyId, chatId);
        if (personaId !== null && !(await this.personaModel.findOne(personaId))) throw new PersonaNotFoundError();
        await this.chatModel.setPersona(chat.id, personaId);
        return this.getChat(storyId, chatId);
    }

    /**
     * .scratch/authors-note/spec.md: the user's standing direction for this Chat, trimmed, read
     * from the next turn on; whitespace only clears it. Like swapping the worn identity it takes
     * no turn lock and waits for no background call: a turn already being written finishes with
     * the note it started with.
     */
    async setAuthorsNote(storyId: number, chatId: number, text: string): Promise<ChatDetail> {
        const { chat } = await this.load(storyId, chatId);
        await this.chatModel.setAuthorsNote(chat.id, text.trim());
        return this.getChat(storyId, chatId);
    }

    /**
     * .scratch/speaker-controls/spec.md, "Sitting out": replaces the whole set of Characters kept
     * out of this Chat's turns. An id outside the Story's cast is refused. Like the Author's note
     * it takes no turn lock and waits for no background call: a turn already being written
     * finishes with the set it started with.
     */
    async setSittingOut(storyId: number, chatId: number, characterIds: number[]): Promise<ChatDetail> {
        const { story, chat } = await this.load(storyId, chatId);
        const cast = new Set(story.characters.map((character) => character.id));
        if (characterIds.some((id) => !cast.has(id))) throw new CharacterNotFoundError();
        await this.chatModel.setSittingOut(chat.id, characterIds);
        return this.getChat(storyId, chatId);
    }

    /**
     * Spec: "Delete Chat". Its Messages and ledger records go with it; its Snapshots stay in
     * the Gallery, their Chat and Message links cleared by ON DELETE SET NULL.
     */
    async deleteChat(storyId: number, chatId: number): Promise<void> {
        const { chat } = await this.load(storyId, chatId);
        await this.chatModel.deleteChat(chat.id);
    }

    /** Spec: "Send flow". */
    async send(storyId: number, chatId: number, text: string, stream?: TurnStream, nudgeCharacterId?: number | null): Promise<ChatDetail> {
        if (text.trim() === '') throw new EmptyMessageError();
        const { story, chat: loaded } = await this.load(storyId, chatId);
        const nudge = nudgeOf(story, loaded, nudgeCharacterId);
        const chat = await this.requireSendable(story, loaded);

        return this.writingTurn(chat.id, async () => {
            // Stopped while the gate waited: nothing is stored, and the client keeps the text.
            if (stream?.signal.aborted) throw new TurnStoppedError();
            const userMessage = await this.chatModel.addUserMessage(
                chat.id,
                chat.messages.length,
                text,
                wornIdentity(story, chat),
            );
            chat.messages.push(userMessage);
            // The reply before it is settled on its shown version, even if this turn fails.
            await this.chatModel.dropReplyVersions(chat.id);
            await this.writeTurn(story, chat, stream, undefined, nudge);
            return this.getChat(storyId, chatId);
        });
    }

    /** Runs the same turn again for a User Message whose turn failed. */
    async retry(storyId: number, chatId: number, stream?: TurnStream, nudgeCharacterId?: number | null): Promise<ChatDetail> {
        const { story, chat: loaded } = await this.load(storyId, chatId);
        if (!awaitingReply(loaded)) throw new NoTurnToRetryError();
        const nudge = nudgeOf(story, loaded, nudgeCharacterId);
        const chat = await this.requireSendable(story, loaded);

        return this.writingTurn(chat.id, async () => {
            await this.writeTurn(story, chat, stream, undefined, nudge);
            return this.getChat(storyId, chatId);
        });
    }

    /**
     * Spec: "Continue". The same gate as a send, and refused while a User Message awaits its
     * reply (Retry is the way on there). No User Message is stored: the turn is written on
     * from the last AI Message, the Opening included. A failed call stores nothing. (Not
     * named `continue`, beside `send` and `retry`, since that is a reserved word.)
     */
    async continueChat(storyId: number, chatId: number, stream?: TurnStream, nudgeCharacterId?: number | null): Promise<ChatDetail> {
        const { story, chat: loaded } = await this.load(storyId, chatId);
        if (awaitingReply(loaded)) throw new AwaitingReplyError();
        const nudge = nudgeOf(story, loaded, nudgeCharacterId);
        const chat = await this.requireSendable(story, loaded);

        return this.writingTurn(chat.id, async () => {
            await this.writeTurn(story, chat, stream, undefined, nudge);
            return this.getChat(storyId, chatId);
        });
    }

    /**
     * Spec: "Retry re-runs only the failed call." Allowed on the latest judged AI Message
     * when its judge failed; it runs to the end before answering with the dashboard. It holds
     * the Chat's turn lock meanwhile, so a send, an edit, a reset or a Branch is refused.
     */
    async retryJudge(storyId: number, chatId: number, messageId: number): Promise<ChatDashboard> {
        const { story, chat } = await this.load(storyId, chatId);
        const message = chat.messages.find((candidate) => candidate.id === messageId);
        if (!message) throw new MessageNotFoundError();
        if (message.judgeStatus !== BackgroundStatus.Failed || latestJudged(chat)?.id !== message.id) {
            throw new NoFailedJudgeError();
        }
        // Under the turn lock, as a turn is, so a Branch never copies half of what it writes.
        return this.writingTurn(chat.id, async () => {
            await this.chatModel.setJudgeStatus(message.id, BackgroundStatus.Pending);
            // A press runs once: its answer comes at once, with no automatic retry.
            await this.judge.run(story, chat.id, message.id, false);
            return this.dashboard(storyId, chatId);
        });
    }

    /** The same for Memory extraction: a failed extraction on the latest extracted AI Message. */
    async retryExtraction(storyId: number, chatId: number, messageId: number): Promise<ChatDashboard> {
        const { story, chat } = await this.load(storyId, chatId);
        const message = chat.messages.find((candidate) => candidate.id === messageId);
        if (!message) throw new MessageNotFoundError();
        if (message.memoryStatus !== BackgroundStatus.Failed || latestExtracted(chat)?.id !== message.id) {
            throw new NoFailedExtractionError();
        }
        return this.writingTurn(chat.id, async () => {
            await this.chatModel.setMemoryStatus(message.id, BackgroundStatus.Pending);
            await this.extraction.run(story, chat.id, message.id, false);
            return this.dashboard(storyId, chatId);
        });
    }

    /**
     * Spec: "Documents in play": the passages the newest AI Message's search sent, or that it
     * failed. No model call: opening the drawer never spends.
     */
    async documentsInPlay(storyId: number, chatId: number): Promise<DocumentsInPlay> {
        const { story, chat } = await this.load(storyId, chatId);
        return this.documentSearch.inPlay(story, newestAiMessage(chat)?.documentPassages ?? null);
    }

    /**
     * Spec: "Lore in play": the entries a turn would send now with no new user message, as a
     * Continue would, for the Memory drawer.
     */
    async loreInPlay(storyId: number, chatId: number): Promise<LoreInPlay> {
        const { story, chat } = await this.load(storyId, chatId);
        return loreInPlayOf(selectLoreAt(promptLore(story), promptHistory(chat.messages)));
    }

    /** Spec: "Dashboard (read-only)". */
    async dashboard(storyId: number, chatId: number): Promise<ChatDashboard> {
        const { story, chat } = await this.load(storyId, chatId);
        const state = await this.ledger.state(chat.id);
        const identity = wornIdentity(story, chat);
        // Bonds toward the user are the user's whichever identity is worn: they show under the worn name.
        const nameOf = (characterId: number | null): string =>
            characterId === null
                ? identity.name
                : (story.characters.find((c) => c.id === characterId)?.name ?? 'a removed Character');

        const characters: DashboardCharacter[] = story.characters.map((character) => ({
            id: character.id,
            name: character.name,
            bonds: currentBonds(state.bondChanges)
                .filter((bond) => bond.fromCharacterId === character.id)
                .map((bond) => ({
                    toward: { characterId: bond.toCharacterId, name: nameOf(bond.toCharacterId) },
                    label: bond.label,
                    description: bond.description,
                    history: state.bondChanges
                        .filter(
                            (change) =>
                                change.fromCharacterId === bond.fromCharacterId &&
                                change.toCharacterId === bond.toCharacterId,
                        )
                        .map((change) => change.toResponse())
                        .reverse(),
                })),
            arcSteps: state.arcSteps.filter((step) => step.characterId === character.id).map((step) => step.toResponse()),
            arcDirection: state.arcDirections.find((direction) => direction.characterId === character.id)?.text ?? '',
        }));

        const scene = story.scenes.find((candidate) => candidate.id === chat.currentSceneId);
        const advance = state.sceneAdvances[state.sceneAdvances.length - 1];
        const background: DashboardBackground[] = chat.messages
            .filter((message) => message.kind === MessageKind.Ai && message.judgeStatus !== null)
            .slice(-DASHBOARD_BACKGROUND_MESSAGES)
            .reverse()
            .map((message) => ({
                messageId: message.id,
                position: message.position,
                judge: { status: message.judgeStatus!, error: message.judgeError },
                memory: message.memoryStatus === null ? null : { status: message.memoryStatus, error: message.memoryError },
            }));

        return {
            chatId: chat.id,
            storyId: story.id,
            title: chat.title,
            identityName: identity.name,
            characters,
            scene: {
                current: scene ? { id: scene.id, name: scene.name } : null,
                advance: advance ? advance.toResponse() : null,
            },
            background,
        };
    }

    /**
     * Spec: "Suggested replies". Three things the user might write next, from the turn's
     * layers and the whole history, written as the worn identity. Nothing is stored.
     * Refused while a turn is in flight or text credit is out. Unlike a send it never waits
     * for, or is blocked by, the previous reply's background calls: a slightly stale state is
     * fine for a suggestion.
     */
    async suggestReplies(storyId: number, chatId: number): Promise<SuggestedReply[]> {
        const { story, chat } = await this.load(storyId, chatId);
        if (this.inFlight.has(chat.id)) throw new TurnInProgressError();
        if (await this.textCreditOut()) throw new OutOfCreditError('text');
        const layers = await this.promptLayersFor(story, chat);
        const history = promptHistory(chat.messages);
        // The point after the newest Message, as Lore in play reads it.
        const chosen = chosenLore(selectLoreAt(layers.lore ?? [], history));
        // The passages the last turn found, still existing ones only, with no search call (.scratch/documents/spec.md).
        const documentPassages = await this.documentSearch.recorded(story.id, newestAiMessage(chat)?.documentPassages ?? null);
        return this.suggestedReplies.suggest({ ...layers, chosenLore: chosen, documentPassages, history }, { storyId: story.id, chatId: chat.id });
    }

    /**
     * .scratch/write-for-me/spec.md: the user's next Message, written as the worn identity from
     * the composer's draft (or from nothing), with the same layers, Lore and Document passages
     * Suggested replies read. Nothing is stored and no background call starts. Gated as
     * Suggested replies are: refused while a turn is in flight or text credit is out, and never
     * waiting for the previous reply's background calls.
     */
    async writeForMe(storyId: number, chatId: number, draft: string): Promise<string> {
        const { story, chat } = await this.load(storyId, chatId);
        if (this.inFlight.has(chat.id)) throw new TurnInProgressError();
        if (await this.textCreditOut()) throw new OutOfCreditError('text');
        const layers = await this.promptLayersFor(story, chat);
        const history = promptHistory(chat.messages);
        // The point after the newest Message, through the one Lore selection turns use.
        const chosen = chosenLore(selectLoreAt(layers.lore ?? [], history));
        // The passages the last turn found, still existing ones only, with no search call.
        const documentPassages = await this.documentSearch.recorded(story.id, newestAiMessage(chat)?.documentPassages ?? null);
        return this.writeForMeWriter.write(
            { ...layers, chosenLore: chosen, documentPassages, history, draft },
            { storyId: story.id, chatId: chat.id },
        );
    }

    /**
     * .scratch/write-for-me/spec.md, "Thai reading": a Thai translation of one Message's stored
     * text, made once and kept. Answered from what is stored when this text has a reading;
     * otherwise refused with text credit out, before any call. It takes no turn lock: a reading
     * of a text that changes meanwhile is kept under the old fingerprint and just never shows.
     */
    async thaiReading(storyId: number, chatId: number, messageId: number): Promise<{ messageId: number; text: string }> {
        const { story, chat } = await this.load(storyId, chatId);
        const message = chat.messages.find((candidate) => candidate.id === messageId);
        if (!message) throw new MessageNotFoundError();
        const source = thaiReadingSource(message.toResponse());
        const fingerprint = sourceFingerprint(source);
        // Already read: no call, so a double tap costs once, and no credit is needed.
        const stored = await this.chatModel.findThaiReading(message.id, fingerprint);
        if (stored) return { messageId: message.id, text: stored.text };
        if (await this.textCreditOut()) throw new OutOfCreditError('text');
        const names = [...story.characters.map((character) => character.name), wornIdentity(story, chat).name, message.identityName ?? ''];
        const text = await this.thaiReadings.make(message.id, source, fingerprint, names, { storyId: story.id, chatId: chat.id });
        return { messageId: message.id, text };
    }

    /**
     * One play-model call for the Chat's next turn. When the last Message is a User Message
     * it is that Message's turn; when it is an AI Message it is a Continue turn, written on
     * from the whole history with the continue instruction in place of user text (spec:
     * "Continue", and Regenerate's step 4). Throws the gateway's typed error on failure, with
     * nothing stored. On success both background calls start against the new AI Message.
     * With a `stream`, the reply is streamed to it as it is written; a stopped stream throws
     * `TurnStoppedError` with nothing stored.
     */
    private async writeTurn(story: StoryEntity, chat: ChatEntity, stream?: TurnStream, replacing?: MessageEntity, nudge: string | null = null): Promise<void> {
        const userText = exchangeUserText(chat.messages, chat.messages.length);
        const history: PromptHistoryMessage[] = (userText !== null ? chat.messages.slice(0, -1) : chat.messages)
            .map((message) => ({
                role: message.kind === MessageKind.User ? 'user' : 'assistant',
                text:
                    message.kind === MessageKind.User
                        ? (message.text ?? '')
                        : partsToText(message.parts.map((part) => part.toResponse())),
            }));
        const scene = story.scenes.find((candidate) => candidate.id === chat.currentSceneId) ?? null;
        const identity: WornIdentity = wornIdentity(story, chat);
        const sittingOut = sittingOutOf(story, chat);
        // Before the prompt is built (.scratch/documents/spec.md): out of text credit fails the turn here, with nothing stored.
        const documents = await this.documentSearch.forTurn(story, chat.id, documentQuery(history, userText));
        const [state, memories] = await Promise.all([this.ledger.state(chat.id), this.memoryModel.findByChat(chat.id)]);
        const prompt = buildTurnPrompt({
            story,
            identity,
            scene,
            ...promptLayers(story, state),
            memories: promptMemories(story, memories),
            storySoFar: promptStorySoFar(chat),
            timeOfDay: chat.timeOfDay,
            lore: promptLore(story),
            // The one selection, once per turn, at the reply's point: the user's new Message is before it.
            chosenLore: chosenLore(selectLoreAt(promptLore(story), promptHistory(chat.messages))),
            documentPassages: documents.passages,
            hasDocuments: documents.hasDocuments,
            authorsNote: chat.authorsNote,
            history,
            userText,
            present: inLatestExchange(story, chat, userText),
            sittingOut: sittingOut.map((character) => character.name),
            nudge,
        });
        if (prompt.trimmed > 0) {
            this.logger.log(`Chat ${chat.id}: left out the ${prompt.trimmed} oldest Messages to fit the prompt budget`);
        }
        if (prompt.memoriesLeftOut > 0) {
            this.logger.warn(`Chat ${chat.id}: left out ${prompt.memoriesLeftOut} unlocked Memories, the least relevant, to keep the Memory layer under its cap`);
        }

        const request: TextCompletionRequest = {
            kind: 'turn',
            messages: prompt.messages,
            maxTokens: prompt.maxTokens,
            stop: prompt.stop,
            servedFor: { storyId: story.id, chatId: chat.id },
        };
        const options = { sittingOut: sittingOut.map((character) => character.id) };
        const result = stream
            ? await this.streamReply(request, story.characters, identity.name, options, stream)
            : await this.gateway.completeText(request);

        const reply = parseReply(result.text, story.characters, identity.name, options);
        for (const name of reply.unknownSpeakers) {
            this.logger.warn(`Chat ${chat.id}: unknown speaker "${name}" in the reply; kept by name with no Character link`);
        }
        for (const name of reply.droppedSpeakers) {
            this.logger.warn(`Chat ${chat.id}: the reply wrote lines for ${name}, who is sitting out; dropped`);
        }
        if (reply.cutAtUserLine) {
            this.logger.warn(`Chat ${chat.id}: the reply wrote a line as ${identity.name}; cut off there`);
        }

        const parts: ReplyPart[] = reply.parts;
        // A Stop that came while the reply was parsed still stores nothing.
        if (stream?.signal.aborted) throw new TurnStoppedError();
        let aiMessageId: number;
        if (replacing) {
            // Regenerate: the new reply is the Message's last Reply version.
            await this.chatModel.replaceReply(replacing, result.model, parts, MAX_REPLY_VERSIONS, documents.record);
            aiMessageId = replacing.id;
        } else {
            aiMessageId = (
                await this.chatModel.addAiMessage(chat.id, chat.messages.length, result.model, parts, BackgroundStatus.Pending, documents.record)
            ).id;
            // A Message after the one with versions settles it on its shown version.
            await this.chatModel.dropReplyVersions(chat.id);
        }
        // Last, and only once stored: the client's final parts are the stored Message.
        stream?.onParts(parts);
        await this.chatModel.touchPlayed(chat.id);
        this.startBackground(story, chat.id, aiMessageId);
    }

    /**
     * The turn's call as a stream (spec: "The guard while streaming"). Each piece re-parses
     * the released reply for `onParts`; text that could still become a line written as the
     * worn identity is held back, and once such a line begins the call is aborted, leaving
     * the text before it for the usual parse and cut. The user's Stop throws. Each re-parse
     * drops the lines of Characters sitting out, as the final parse does, so none ever shows.
     */
    private async streamReply(
        request: TextCompletionRequest,
        cast: CastName[],
        identityName: string,
        options: ParseOptions,
        stream: TurnStream,
    ): Promise<TextCompletionResult> {
        if (stream.signal.aborted) throw new TurnStoppedError();
        const guard = new AbortController();
        let text = '';
        let released = '';
        stream.onStart();
        const result = await this.gateway.streamText(request, {
            signal: AbortSignal.any([stream.signal, guard.signal]),
            onText: (piece) => {
                text += piece;
                const release = releasedText(text, identityName);
                if (release.userLine) guard.abort();
                if (release.text !== released) {
                    released = release.text;
                    stream.onParts(parseReply(released, cast, identityName, options).parts);
                }
            },
        });
        if (stream.signal.aborted) throw new TurnStoppedError();
        return result;
    }

    /**
     * Layers 1–9 of a prompt as the Chat stands now: the worn identity, the current Scene,
     * every Bond and Arc, and the Memory, plus the Lore and the Author's note the closing
     * message reads, all read the way `writeTurn` reads them.
     */
    private async promptLayersFor(story: StoryEntity, chat: ChatEntity): Promise<PromptLayersInput> {
        const scene = story.scenes.find((candidate) => candidate.id === chat.currentSceneId) ?? null;
        const [state, memories] = await Promise.all([this.ledger.state(chat.id), this.memoryModel.findByChat(chat.id)]);
        return {
            story,
            identity: wornIdentity(story, chat),
            scene,
            ...promptLayers(story, state),
            memories: promptMemories(story, memories),
            storySoFar: promptStorySoFar(chat),
            timeOfDay: chat.timeOfDay,
            lore: promptLore(story),
            hasDocuments: hasDocumentPassages(story),
            authorsNote: chat.authorsNote,
            present: inLatestExchange(story, chat, null),
            sittingOut: sittingOutOf(story, chat).map((character) => character.name),
        };
    }

    /** Holds the Chat's turn lock while `work` runs; a second send meanwhile is refused. */
    private async writingTurn<T>(chatId: number, work: () => Promise<T>): Promise<T> {
        if (this.inFlight.has(chatId)) throw new TurnInProgressError();
        this.inFlight.add(chatId);
        try {
            return await work();
        } finally {
            this.inFlight.delete(chatId);
        }
    }

    /**
     * Spec: "Send flow", steps 1–2. Not playable, or text credit out, or a turn in flight,
     * refuses; a pending background call is waited for (a retry waiting out its delay runs at
     * once), and past the wait the user is told it is still saving; a call whose automatic retry
     * failed too blocks with Retry (either call failed blocks).
     * Returns the Chat as it is once the wait is over, since the judge may have moved it on.
     */
    private async requireSendable(story: StoryEntity, chat: ChatEntity): Promise<ChatEntity> {
        this.requirePlayable(story);
        if (await this.textCreditOut()) throw new OutOfCreditError('text');
        if (this.inFlight.has(chat.id)) throw new TurnInProgressError();
        const settled = await this.settleBackground(chat);
        if (settled.pending) throw new BackgroundStillSavingError();
        if (settled.failed.length > 0) throw new BackgroundFailedError(settled.failed);
        return settled.waited ? this.reload(chat.id) : chat;
    }

    /** A write that runs no turn (an AI Message edit, a reset) waits for pending background calls too. */
    private async settledForWrite(chat: ChatEntity): Promise<ChatEntity> {
        const settled = await this.settleBackground(chat);
        if (settled.pending) throw new BackgroundStillSavingError();
        return settled.waited ? this.reload(chat.id) : chat;
    }

    /** Both background calls settled together: the wait runs once for both. */
    private async settleBackground(chat: ChatEntity): Promise<{ pending: boolean; failed: BackgroundCallName[]; waited: boolean }> {
        const [judge, extraction]: SettledBackground[] = await Promise.all([this.judge.settle(chat), this.extraction.settle(chat)]);
        const failed: BackgroundCallName[] = [];
        if (judge.status === BackgroundStatus.Failed) failed.push('Bonds, Arcs and Scene');
        if (extraction.status === BackgroundStatus.Failed) failed.push('Memories');
        return {
            pending: judge.status === BackgroundStatus.Pending || extraction.status === BackgroundStatus.Pending,
            failed,
            waited: judge.waited || extraction.waited,
        };
    }

    private async reload(chatId: number): Promise<ChatEntity> {
        const chat = await this.chatModel.findWithMessages(chatId);
        if (!chat) throw new ChatNotFoundError();
        return chat;
    }

    private requirePlayable(story: StoryEntity): void {
        const status = playableStatus(story);
        if (!status.playable) throw new StoryNotPlayableError(status.missing);
    }

    private async textCreditOut(): Promise<boolean> {
        return (await this.creditOut()).text;
    }

    /** Whether each pool's remaining credit is known and used up. */
    private async creditOut(): Promise<{ text: boolean; image: boolean }> {
        const credit = await this.gateway.remainingCredit();
        const out = (remaining: number | null) => remaining !== null && remaining <= 0;
        return { text: out(credit.text.remainingUsd), image: out(credit.image.remainingUsd) };
    }

    private async detail(story: StoryEntity, chat: ChatEntity): Promise<ChatDetail> {
        const [settings, creditOut, source, readings] = await Promise.all([
            this.settingsModel.get(),
            this.creditOut(),
            // Read live, so a rename of the source shows.
            chat.branchedFromChatId === null ? null : this.chatModel.findOne(chat.branchedFromChatId),
            this.chatModel.findThaiReadings(chat.messages.map((message) => message.id)),
        ]);
        const scene = story.scenes.find((candidate) => candidate.id === chat.currentSceneId);
        const lastModel = lastAiModel(chat);
        const identity = wornIdentity(story, chat);
        return {
            ...chat.toSummary(),
            currentScene: scene ? { id: scene.id, name: scene.name } : null,
            timeOfDay: chat.timeOfDay,
            identityName: identity.name,
            personaId: identity.personaId,
            roleName: story.role.name,
            messages: withThaiReadings(
                chat.messages.map((message) => message.toResponse()),
                readings,
            ),
            awaitingReply: awaitingReply(chat),
            ...playableStatus(story),
            textCreditOut: creditOut.text,
            imageCreditOut: creditOut.image,
            playModel: settings.playModel,
            drift:
                lastModel !== null && lastModel !== settings.playModel
                    ? {
                          lastModel,
                          playModel: settings.playModel,
                          lastModelLabel: playModelName(lastModel),
                          playModelLabel: playModelName(settings.playModel),
                      }
                    : null,
            branchedFrom: source ? { chatId: source.id, title: source.title, messageId: chat.branchedFromMessageId } : null,
            authorsNote: chat.authorsNote,
            sittingOut: sittingOutOf(story, chat).map((character) => character.id),
        };
    }

    private async loadStory(storyId: number): Promise<StoryEntity> {
        const story = await this.storyModel.findFull(storyId);
        if (!story) throw new StoryNotFoundError();
        return story;
    }

    private async load(storyId: number, chatId: number): Promise<{ story: StoryEntity; chat: ChatEntity }> {
        const story = await this.loadStory(storyId);
        const chat = await this.chatModel.findWithMessages(chatId);
        if (!chat || chat.storyId !== storyId) throw new ChatNotFoundError();
        return { story, chat };
    }
}

/** Messages as the prompt reads them, the way `writeTurn` reads its history: the user's text, or the AI's `@Name:` text. */
function promptHistory(messages: MessageEntity[]): PromptHistoryMessage[] {
    return messages.map((message) => ({
        role: message.kind === MessageKind.User ? 'user' : 'assistant',
        text: message.kind === MessageKind.User ? (message.text ?? '') : partsToText(message.parts.map((part) => part.toResponse())),
    }));
}

/** The Feelings and Arcs layers from the ledger: every current Bond, and each Character's Arc. */
function promptLayers(story: StoryEntity, state: LedgerState): { bonds: PromptBond[]; arcs: PromptArc[] } {
    const nameOf = (characterId: number): string | null =>
        story.characters.find((character) => character.id === characterId)?.name ?? null;
    return {
        bonds: currentBonds(state.bondChanges).flatMap((bond) => {
            const fromName = nameOf(bond.fromCharacterId);
            const toName = bond.toCharacterId === null ? null : nameOf(bond.toCharacterId);
            if (!fromName || (bond.toCharacterId !== null && !toName)) return [];
            return [{ fromName, toName, label: bond.label, description: bond.description }];
        }),
        arcs: story.characters.map((character) => ({
            name: character.name,
            steps: state.arcSteps.filter((step) => step.characterId === character.id).map((step) => step.step),
            direction: state.arcDirections.find((direction) => direction.characterId === character.id)?.text ?? '',
        })),
    };
}

/** The Memory layer: every non-archived Memory in the stable order, with its Known by as names. */
function promptMemories(story: StoryEntity, memories: MemoryEntity[]): PromptMemory[] {
    const order = story.characters.map((character) => character.id);
    const nameOf = (characterId: number): string[] => {
        const character = story.characters.find((candidate) => candidate.id === characterId);
        return character ? [character.name] : [];
    };
    return memories
        .filter((memory) => !memory.archived)
        .map((memory) => ({ text: memory.text, knownBy: memory.knownByIds(order).flatMap(nameOf), locked: memory.locked }));
}

/**
 * The Characters sitting out of the Chat (.scratch/speaker-controls/spec.md), in cast order. A
 * Chat loaded without its set (only `findWithMessages` reads it) has nobody sitting out.
 */
function sittingOutOf(story: StoryEntity, chat: ChatEntity): CastName[] {
    const ids = new Set(chat.sittingOutIds());
    return story.characters.filter((character) => ids.has(character.id)).map((character) => ({ id: character.id, name: character.name }));
}

/**
 * The Characters in the latest exchange, for the reminder near the end of the turn prompt: who
 * spoke in or was named by the newest AI Message, or by the user's new message.
 */
function inLatestExchange(story: StoryEntity, chat: ChatEntity, userText: string | null): string[] {
    const lastAi = [...chat.messages].reverse().find((message) => message.kind === MessageKind.Ai);
    const parts = lastAi ? [...lastAi.parts].sort((a, b) => a.position - b.position).map((part) => part.toResponse()) : [];
    const cast = story.characters.map((character) => ({ id: character.id, name: character.name }));
    return charactersInExchange(cast, userText ?? '', parts).map((character) => character.name);
}

/** The title limit a rename keeps to (RenameChatRequestBodyDTO). */
const TITLE_MAX = 200;

/**
 * Spec: .scratch/branch/spec.md, "Title". "<title> (branch)", where <title> is the source's
 * title with any trailing " (branch)" or " (branch N)" taken off, so a Branch of a Branch never
 * stacks suffixes; when that is taken in the Story, the next free " (branch N)" from 2. Cut to
 * the title limit.
 */
function branchTitle(source: string, taken: string[]): string {
    const base = source.replace(/ \(branch(?: \d+)?\)$/, '');
    const titled = (suffix: string) => `${base.slice(0, TITLE_MAX - suffix.length)}${suffix}`;
    let title = titled(' (branch)');
    for (let n = 2; taken.includes(title); n++) title = titled(` (branch ${n})`);
    return title;
}

/** "Chat N" for the first title not yet taken in this Story. */
function defaultTitle(taken: string[]): string {
    let n = taken.length + 1;
    while (taken.includes(`Chat ${n}`)) n++;
    return `Chat ${n}`;
}

function awaitingReply(chat: ChatEntity): boolean {
    const last: MessageEntity | undefined = chat.messages[chat.messages.length - 1];
    return last?.kind === MessageKind.User;
}

/** The model of the last AI Message a model wrote; the Opening ("author") doesn't count. */
function lastAiModel(chat: ChatEntity): string | null {
    for (let i = chat.messages.length - 1; i >= 0; i--) {
        const message = chat.messages[i];
        if (message.kind === MessageKind.Ai && message.model && message.model !== AUTHOR_MODEL) {
            return message.model;
        }
    }
    return null;
}

/** The Chat's newest AI Message, the Opening included; null for a Chat with none. */
function newestAiMessage(chat: ChatEntity): MessageEntity | null {
    for (let i = chat.messages.length - 1; i >= 0; i--) {
        if (chat.messages[i].kind === MessageKind.Ai) return chat.messages[i];
    }
    return null;
}

/**
 * Each Message with its current Thai reading: the one whose fingerprint matches its stored text
 * now. A changed text (an edit, another Reply version) simply finds none.
 */
function withThaiReadings(messages: MessageResponse[], readings: ThaiReadingEntity[]): ChatMessageResponse[] {
    const byMessage = new Map<string, string>(readings.map((reading) => [`${reading.messageId}:${reading.sourceFingerprint}`, reading.text]));
    return messages.map((message) => ({
        ...message,
        thaiReading: byMessage.get(`${message.id}:${sourceFingerprint(thaiReadingSource(message))}`) ?? null,
    }));
}

/**
 * The nudged Character's name for the turn prompt (.scratch/speaker-controls/spec.md, "Nudge"), or
 * null for none. Checked before anything is stored: an id outside the cast is
 * `CharacterNotFoundError`, a Character sitting out is `NudgeSittingOutError`.
 */
function nudgeOf(story: StoryEntity, chat: ChatEntity, characterId: number | null | undefined): string | null {
    if (characterId === null || characterId === undefined) return null;
    const character = story.characters.find((candidate) => candidate.id === characterId);
    if (!character) throw new CharacterNotFoundError();
    if (chat.sittingOutIds().includes(character.id)) throw new NudgeSittingOutError(character.name);
    return character.name;
}

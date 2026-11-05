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
    StoryNotPlayableError,
    TurnInProgressError,
} from '../../errors/chat.errors.js';
import { OutOfCreditError } from '../../errors/model-gateway.errors.js';
import { PersonaNotFoundError } from '../../errors/persona.errors.js';
import { StoryNotFoundError } from '../../errors/story.errors.js';
import { ChatModelService } from '../../model/chat/chat.service.js';
import { ChatEntity, ChatSummary } from '../../model/chat/entities/chat.entity.js';
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
import { ModelGateway } from '../../service/model-gateway/model-gateway.js';
import { latestLine } from '../excerpt.js';
import { exchangeUserText } from './exchange.js';
import { MissingField, playableStatus } from '../story/playable.js';
import { WornIdentity, wornIdentity } from './identity.js';
import { currentBonds, JudgeManagerService, latestJudged, SettledBackground } from './judge/judge.service.js';
import { latestExtracted, MemoryExtractionManagerService } from './memory/extraction.service.js';
import { SuggestedRepliesManagerService } from './suggestions/suggested-replies.service.js';
import { SuggestedReply } from './suggestions/suggestions-prompt.js';
import { buildTurnPrompt, PromptArc, PromptBond, PromptHistoryMessage, PromptLayersInput, PromptMemory } from './turn/prompt.js';
import { parseReply, partsToText, ReplyPart } from './turn/reply-parser.js';

/** A Chat as a Story's Chat list shows it (spec: "Lists and Home"). */
export interface ChatListItem extends ChatSummary {
    /** The Scene the Chat is on; null means free play. */
    sceneName: string | null;
    /** The latest Message as one plain line of about 100 characters. */
    latestLine: string;
}

/** A Chat as the Chat screen reads it: its Messages plus everything the notice line needs. */
export interface ChatDetail extends ChatSummary {
    /** The Scene the Chat is on; null means free play. */
    currentScene: { id: number; name: string } | null;
    /** The worn identity's name, under which the next User Message shows. */
    identityName: string;
    /** The worn Persona; null while the Chat wears its Story's Role. */
    personaId: number | null;
    /** The Story's Role's name, which the swap offers beside the Personas. */
    roleName: string;
    messages: MessageResponse[];
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
    drift: { lastModel: string; playModel: string } | null;
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
        private readonly storyModel: StoryModelService,
        private readonly settingsModel: SettingsModelService,
        private readonly ledger: LedgerModelService,
        private readonly memoryModel: MemoryModelService,
        private readonly personaModel: PersonaModelService,
        private readonly snapshotModel: SnapshotModelService,
        private readonly judge: JudgeManagerService,
        private readonly extraction: MemoryExtractionManagerService,
        private readonly suggestedReplies: SuggestedRepliesManagerService,
        private readonly gateway: ModelGateway,
    ) {}

    async listChats(storyId: number): Promise<ChatListItem[]> {
        const story = await this.loadStory(storyId);
        const chats = await this.chatModel.findByStory(storyId);
        const latest = await this.chatModel.findLatestMessages(chats.map((chat) => chat.id));
        const latestOf = new Map(latest.map((message) => [message.chatId, message]));
        return chats.map((chat) => ({
            ...chat.toSummary(),
            sceneName: story.scenes.find((scene) => scene.id === chat.currentSceneId)?.name ?? null,
            latestLine: latestLine(latestOf.get(chat.id)),
        }));
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

        await this.ledger.clear(chat.id);
        chat.currentSceneId = story.scenes[0]?.id ?? null;
        await this.chatModel.saveChat(chat);
        await this.chatModel.clearMessages(chat.id);
        await this.copyOpening(story, chat.id);
        await this.seedLedger(story, chat.id);
        return this.getChat(storyId, chatId);
    }

    /**
     * Spec: "Edit User Message N" and "Edit AI Message N". Every Message after it is deleted
     * for good, and every change those Messages caused is rolled back, newest first. An
     * edited User Message gets a fresh reply through the same turn as a send, so a failed
     * one leaves it with Retry. An edited AI Message loses its own changes too, is re-split
     * into parts from its `@Name:` text, and both background calls run again on it; the Chat
     * then waits for the user. The Opening copy is never judged or extracted from.
     */
    async editMessage(storyId: number, chatId: number, messageId: number, text: string): Promise<EditResult> {
        if (text.trim() === '') throw new EmptyMessageError();
        const { story, chat: loaded } = await this.load(storyId, chatId);
        const found = loaded.messages.find((message) => message.id === messageId);
        if (!found) throw new MessageNotFoundError();

        if (found.kind === MessageKind.User) {
            const chat = await this.requireSendable(story, loaded);
            return this.writingTurn(chat.id, () =>
                // The fresh reply is written to the identity worn now, so the edited text is stamped with it.
                this.rewindAndWrite(story, chat.id, found.position + 1, () =>
                    this.chatModel.rewriteUserMessage(found, text, wornIdentity(story, chat)),
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
        const rolledBack = await this.ledger.rollbackFrom(chat.id, message.position);
        await this.chatModel.rewriteAiMessage(message, reply.parts);
        // Its Snapshots show a moment the edit took away; they stay in the Gallery.
        await this.snapshotModel.clearMessageLinks([message.id]);
        if (message.model !== AUTHOR_MODEL) {
            await this.chatModel.setJudgeStatus(message.id, BackgroundStatus.Pending);
            await this.chatModel.setMemoryStatus(message.id, BackgroundStatus.Pending);
            this.startBackground(story, chat.id, message.id);
        }
        return { ...(await this.getChat(storyId, chatId)), rolledBack };
    }

    /**
     * Spec: "Regenerate". The newest AI Message is replaced with a freshly written one, under
     * the same gate as a send. Its Memory, Bond, Arc and Scene changes are rolled back as an
     * edit's are, its Snapshots leave it for the Gallery, and it is deleted; then the turn
     * runs again: the User Message's turn when one comes before it, a Continue otherwise. On a
     * failed turn the old reply is already gone, so a User Message before it awaits Retry, and
     * otherwise the Chat simply ends at the AI Message before it. No version is kept.
     */
    async regenerateMessage(storyId: number, chatId: number, messageId: number): Promise<EditResult> {
        const { story, chat: loaded } = await this.load(storyId, chatId);
        // First: mid-turn, the Message may already be gone, deleted by the Regenerate under way.
        if (this.inFlight.has(loaded.id)) throw new TurnInProgressError();
        const message = loaded.messages.find((candidate) => candidate.id === messageId);
        if (!message) throw new MessageNotFoundError();
        const newest = loaded.messages[loaded.messages.length - 1];
        if (message !== newest || message.kind !== MessageKind.Ai || message.model === AUTHOR_MODEL) {
            throw new NotRegenerableError();
        }
        const chat = await this.requireSendable(story, loaded);

        return this.writingTurn(chat.id, () =>
            this.rewindAndWrite(story, chat.id, message.position, async () => {
                await this.snapshotModel.clearMessageLinks([message.id]);
                await this.chatModel.deleteMessage(message.id);
            }),
        );
    }

    /**
     * Inside the turn lock: rolls back every change from `fromPosition` on, applies `change`
     * to the Messages, then writes the turn, answering with what was rolled back. Shared by a
     * User Message edit and Regenerate. A failed turn throws with the rollback and change kept.
     */
    private async rewindAndWrite(story: StoryEntity, chatId: number, fromPosition: number, change: () => Promise<void>): Promise<EditResult> {
        const rolledBack = await this.ledger.rollbackFrom(chatId, fromPosition);
        await change();
        // Reloaded: the rollback may have put the Chat back on an earlier Scene.
        await this.writeTurn(story, await this.reload(chatId));
        return { ...(await this.getChat(story.id, chatId)), rolledBack };
    }

    /** Spec: "Start both background calls in parallel, with their status set to pending." */
    private startBackground(story: StoryEntity, chatId: number, messageId: number): void {
        this.judge.start(story, chatId, messageId);
        this.extraction.start(story, chatId, messageId);
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
            await this.chatModel.saveChat(chat);
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
     * Spec: "Delete Chat". Its Messages and ledger records go with it; its Snapshots stay in
     * the Gallery, their Chat and Message links cleared by ON DELETE SET NULL.
     */
    async deleteChat(storyId: number, chatId: number): Promise<void> {
        const { chat } = await this.load(storyId, chatId);
        await this.chatModel.deleteChat(chat.id);
    }

    /** Spec: "Send flow". */
    async send(storyId: number, chatId: number, text: string): Promise<ChatDetail> {
        if (text.trim() === '') throw new EmptyMessageError();
        const { story, chat: loaded } = await this.load(storyId, chatId);
        const chat = await this.requireSendable(story, loaded);

        return this.writingTurn(chat.id, async () => {
            const userMessage = await this.chatModel.addUserMessage(
                chat.id,
                chat.messages.length,
                text,
                wornIdentity(story, chat),
            );
            chat.messages.push(userMessage);
            await this.writeTurn(story, chat);
            return this.getChat(storyId, chatId);
        });
    }

    /** Runs the same turn again for a User Message whose turn failed. */
    async retry(storyId: number, chatId: number): Promise<ChatDetail> {
        const { story, chat: loaded } = await this.load(storyId, chatId);
        if (!awaitingReply(loaded)) throw new NoTurnToRetryError();
        const chat = await this.requireSendable(story, loaded);

        return this.writingTurn(chat.id, async () => {
            await this.writeTurn(story, chat);
            return this.getChat(storyId, chatId);
        });
    }

    /**
     * Spec: "Continue". The same gate as a send, and refused while a User Message awaits its
     * reply (Retry is the way on there). No User Message is stored: the turn is written on
     * from the last AI Message, the Opening included. A failed call stores nothing. (Not
     * named `continue`, beside `send` and `retry`, since that is a reserved word.)
     */
    async continueChat(storyId: number, chatId: number): Promise<ChatDetail> {
        const { story, chat: loaded } = await this.load(storyId, chatId);
        if (awaitingReply(loaded)) throw new AwaitingReplyError();
        const chat = await this.requireSendable(story, loaded);

        return this.writingTurn(chat.id, async () => {
            await this.writeTurn(story, chat);
            return this.getChat(storyId, chatId);
        });
    }

    /**
     * Spec: "Retry re-runs only the failed call." Allowed on the latest judged AI Message
     * when its judge failed; it runs to the end before answering with the dashboard.
     */
    async retryJudge(storyId: number, chatId: number, messageId: number): Promise<ChatDashboard> {
        const { story, chat } = await this.load(storyId, chatId);
        const message = chat.messages.find((candidate) => candidate.id === messageId);
        if (!message) throw new MessageNotFoundError();
        if (message.judgeStatus !== BackgroundStatus.Failed || latestJudged(chat)?.id !== message.id) {
            throw new NoFailedJudgeError();
        }
        await this.chatModel.setJudgeStatus(message.id, BackgroundStatus.Pending);
        await this.judge.run(story, chat.id, message.id);
        return this.dashboard(storyId, chatId);
    }

    /** The same for Memory extraction: a failed extraction on the latest extracted AI Message. */
    async retryExtraction(storyId: number, chatId: number, messageId: number): Promise<ChatDashboard> {
        const { story, chat } = await this.load(storyId, chatId);
        const message = chat.messages.find((candidate) => candidate.id === messageId);
        if (!message) throw new MessageNotFoundError();
        if (message.memoryStatus !== BackgroundStatus.Failed || latestExtracted(chat)?.id !== message.id) {
            throw new NoFailedExtractionError();
        }
        await this.chatModel.setMemoryStatus(message.id, BackgroundStatus.Pending);
        await this.extraction.run(story, chat.id, message.id);
        return this.dashboard(storyId, chatId);
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
        return this.suggestedReplies.suggest({ ...layers, history: promptHistory(chat.messages) }, { storyId: story.id, chatId: chat.id });
    }

    /**
     * One play-model call for the Chat's next turn. When the last Message is a User Message
     * it is that Message's turn; when it is an AI Message it is a Continue turn, written on
     * from the whole history with the continue instruction in place of user text (spec:
     * "Continue", and Regenerate's step 4). Throws the gateway's typed error on failure, with
     * nothing stored. On success both background calls start against the new AI Message.
     */
    private async writeTurn(story: StoryEntity, chat: ChatEntity): Promise<void> {
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
        const [state, memories] = await Promise.all([this.ledger.state(chat.id), this.memoryModel.findByChat(chat.id)]);
        const prompt = buildTurnPrompt({
            story,
            identity,
            scene,
            ...promptLayers(story, state),
            memories: promptMemories(story, memories),
            history,
            userText,
        });
        if (prompt.trimmed > 0) {
            this.logger.log(`Chat ${chat.id}: left out the ${prompt.trimmed} oldest Messages to fit the prompt budget`);
        }
        if (prompt.memoriesLeftOut > 0) {
            this.logger.warn(`Chat ${chat.id}: left out the ${prompt.memoriesLeftOut} oldest unlocked Memories to keep the Memory layer under its cap`);
        }

        const result = await this.gateway.completeText({
            kind: 'turn',
            messages: prompt.messages,
            maxTokens: prompt.maxTokens,
            stop: prompt.stop,
            servedFor: { storyId: story.id, chatId: chat.id },
        });

        const reply = parseReply(result.text, story.characters, identity.name);
        for (const name of reply.unknownSpeakers) {
            this.logger.warn(`Chat ${chat.id}: unknown speaker "${name}" in the reply; kept by name with no Character link`);
        }
        if (reply.cutAtUserLine) {
            this.logger.warn(`Chat ${chat.id}: the reply wrote a line as ${identity.name}; cut off there`);
        }

        const parts: ReplyPart[] = reply.parts;
        const aiMessage = await this.chatModel.addAiMessage(
            chat.id,
            chat.messages.length,
            result.model,
            parts,
            BackgroundStatus.Pending,
        );
        await this.chatModel.touchPlayed(chat.id);
        this.startBackground(story, chat.id, aiMessage.id);
    }

    /**
     * Layers 1–9 of a prompt as the Chat stands now: the worn identity, the current Scene,
     * every Bond and Arc, and the Memory, read the way `writeTurn` reads them.
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
     * refuses; a pending background call is waited for, and past the wait the user is told
     * it is still saving; a failed call blocks with Retry (either call failed blocks).
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
        const [settings, creditOut] = await Promise.all([this.settingsModel.get(), this.creditOut()]);
        const scene = story.scenes.find((candidate) => candidate.id === chat.currentSceneId);
        const lastModel = lastAiModel(chat);
        const identity = wornIdentity(story, chat);
        return {
            ...chat.toSummary(),
            currentScene: scene ? { id: scene.id, name: scene.name } : null,
            identityName: identity.name,
            personaId: identity.personaId,
            roleName: story.role.name,
            messages: chat.messages.map((message) => message.toResponse()),
            awaitingReply: awaitingReply(chat),
            ...playableStatus(story),
            textCreditOut: creditOut.text,
            imageCreditOut: creditOut.image,
            playModel: settings.playModel,
            drift:
                lastModel !== null && lastModel !== settings.playModel
                    ? { lastModel, playModel: settings.playModel }
                    : null,
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

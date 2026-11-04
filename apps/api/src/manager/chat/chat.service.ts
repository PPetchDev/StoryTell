import { Injectable, Logger } from '@nestjs/common';

import {
    ChatNotFoundError,
    EmptyMessageError,
    MessageNotFoundError,
    NoTurnToRetryError,
    StoryNotPlayableError,
    TurnInProgressError,
} from '../../errors/chat.errors.js';
import { OutOfCreditError } from '../../errors/model-gateway.errors.js';
import { StoryNotFoundError } from '../../errors/story.errors.js';
import { ChatModelService } from '../../model/chat/chat.service.js';
import { ChatEntity, ChatSummary } from '../../model/chat/entities/chat.entity.js';
import { AUTHOR_MODEL, MessageEntity, MessageKind, MessageResponse } from '../../model/chat/entities/message.entity.js';
import { SettingsModelService } from '../../model/settings/settings.service.js';
import { StoryEntity } from '../../model/story/entities/story.entity.js';
import { StoryModelService } from '../../model/story/story.service.js';
import { ModelGateway } from '../../service/model-gateway/model-gateway.js';
import { MissingField, playableStatus } from '../story/playable.js';
import { buildTurnPrompt, PromptHistoryMessage } from './turn/prompt.js';
import { parseReply, partsToText, ReplyPart } from './turn/reply-parser.js';

/** A Chat as the Chat screen reads it: its Messages plus everything the notice line needs. */
export interface ChatDetail extends ChatSummary {
    /** The Scene the Chat is on; null means free play. */
    currentScene: { id: number; name: string } | null;
    /** The worn identity's name, under which User Messages show. */
    identityName: string;
    messages: MessageResponse[];
    /** True when the last Message is a User Message, so its turn failed and Retry applies. */
    awaitingReply: boolean;
    playable: boolean;
    missing: MissingField[];
    /** True when the text pool's remaining credit is known and used up. */
    textCreditOut: boolean;
    playModel: string;
    /** Set when the last AI Message came from a different model than the current play model. */
    drift: { lastModel: string; playModel: string } | null;
}

/**
 * Chats and the turn engine (spec: "Chat and turn engine"). One play-model call writes the
 * whole turn; the reply is parsed and guarded, and an AI Message is stored only once it is
 * complete. The Feelings, Arcs and Memory layers and the background calls are added by
 * tickets 27 and 28.
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
        private readonly gateway: ModelGateway,
    ) {}

    async listChats(storyId: number): Promise<ChatSummary[]> {
        await this.loadStory(storyId);
        const chats = await this.chatModel.findByStory(storyId);
        return chats.map((chat) => chat.toSummary());
    }

    /** Spec: "Starting a Chat". The Opening becomes Message 1; the first Scene, or free play. */
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
        return this.getChat(storyId, chat.id);
    }

    /**
     * Spec: "Reset Chat". The title and the worn identity stay; every Message goes, the
     * Opening as it is now comes in again as Message 1, and the Chat returns to the first
     * Scene or free play. Like starting a Chat, it needs a playable Story.
     */
    async resetChat(storyId: number, chatId: number): Promise<ChatDetail> {
        const { story, chat } = await this.load(storyId, chatId);
        this.requirePlayable(story);
        if (this.inFlight.has(chat.id)) throw new TurnInProgressError();

        chat.currentSceneId = story.scenes[0]?.id ?? null;
        await this.chatModel.saveChat(chat);
        await this.chatModel.clearMessages(chat.id);
        await this.copyOpening(story, chat.id);
        return this.getChat(storyId, chatId);
    }

    /**
     * Spec: "Edit User Message N" and "Edit AI Message N". Every Message after it is deleted
     * for good. An edited User Message gets a fresh reply through the same turn as a send,
     * so a failed one leaves it with Retry. An edited AI Message is re-split into parts from
     * its `@Name:` text, and the Chat then waits for the user: no turn.
     */
    async editMessage(storyId: number, chatId: number, messageId: number, text: string): Promise<ChatDetail> {
        if (text.trim() === '') throw new EmptyMessageError();
        const { story, chat } = await this.load(storyId, chatId);
        const index = chat.messages.findIndex((message) => message.id === messageId);
        if (index < 0) throw new MessageNotFoundError();
        const message = chat.messages[index];

        if (message.kind === MessageKind.User) {
            await this.requireSendable(story, chat);
            return this.writingTurn(chat.id, async () => {
                await this.chatModel.rewriteUserMessage(message, text);
                message.text = text;
                chat.messages = chat.messages.slice(0, index + 1);
                await this.writeTurn(story, chat);
                return this.getChat(storyId, chatId);
            });
        }

        if (this.inFlight.has(chat.id)) throw new TurnInProgressError();
        // The user wrote this text, like the author wrote the Opening: the guard is off.
        const reply = parseReply(text, story.characters, story.role.name, { guard: false });
        for (const name of reply.unknownSpeakers) {
            this.logger.warn(`Chat ${chat.id}: unknown speaker "${name}" in the edited Message; kept by name with no Character link`);
        }
        await this.chatModel.rewriteAiMessage(message, reply.parts);
        return this.getChat(storyId, chatId);
    }

    /** The Opening becomes Message 1 with model "author", split by the same parser as replies. */
    private async copyOpening(story: StoryEntity, chatId: number): Promise<void> {
        // The author wrote the Opening, so the guard that cuts lines written as the Role is off.
        const opening = parseReply(story.opening, story.characters, story.role.name, { guard: false });
        await this.chatModel.addAiMessage(chatId, 0, AUTHOR_MODEL, opening.parts);
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

    /** Spec: "Delete Chat". Its Messages go with it. */
    async deleteChat(storyId: number, chatId: number): Promise<void> {
        const { chat } = await this.load(storyId, chatId);
        await this.chatModel.deleteChat(chat.id);
    }

    /** Spec: "Send flow". */
    async send(storyId: number, chatId: number, text: string): Promise<ChatDetail> {
        if (text.trim() === '') throw new EmptyMessageError();
        const { story, chat } = await this.load(storyId, chatId);
        await this.requireSendable(story, chat);

        return this.writingTurn(chat.id, async () => {
            const userMessage = await this.chatModel.addUserMessage(
                chat.id,
                chat.messages.length,
                text,
                story.role.name,
            );
            chat.messages.push(userMessage);
            await this.writeTurn(story, chat);
            return this.getChat(storyId, chatId);
        });
    }

    /** Runs the same turn again for a User Message whose turn failed. */
    async retry(storyId: number, chatId: number): Promise<ChatDetail> {
        const { story, chat } = await this.load(storyId, chatId);
        if (!awaitingReply(chat)) throw new NoTurnToRetryError();
        await this.requireSendable(story, chat);

        return this.writingTurn(chat.id, async () => {
            await this.writeTurn(story, chat);
            return this.getChat(storyId, chatId);
        });
    }

    /**
     * One play-model call for the last User Message of the Chat. Throws the gateway's typed
     * error on failure, leaving the User Message in place with nothing stored after it.
     */
    private async writeTurn(story: StoryEntity, chat: ChatEntity): Promise<void> {
        const userMessage = chat.messages[chat.messages.length - 1];
        const history: PromptHistoryMessage[] = chat.messages
            .slice(0, -1)
            .map((message) => ({
                role: message.kind === MessageKind.User ? 'user' : 'assistant',
                text:
                    message.kind === MessageKind.User
                        ? (message.text ?? '')
                        : partsToText(message.parts.map((part) => part.toResponse())),
            }));
        const scene = story.scenes.find((candidate) => candidate.id === chat.currentSceneId) ?? null;
        const prompt = buildTurnPrompt({
            story,
            identity: story.role,
            scene,
            history,
            userText: userMessage.text ?? '',
        });
        if (prompt.trimmed > 0) {
            this.logger.log(`Chat ${chat.id}: left out the ${prompt.trimmed} oldest Messages to fit the prompt budget`);
        }

        const result = await this.gateway.completeText({
            kind: 'turn',
            messages: prompt.messages,
            maxTokens: prompt.maxTokens,
            stop: prompt.stop,
            servedFor: { storyId: story.id, chatId: chat.id },
        });

        const reply = parseReply(result.text, story.characters, story.role.name);
        for (const name of reply.unknownSpeakers) {
            this.logger.warn(`Chat ${chat.id}: unknown speaker "${name}" in the reply; kept by name with no Character link`);
        }
        if (reply.cutAtUserLine) {
            this.logger.warn(`Chat ${chat.id}: the reply wrote a line as ${story.role.name}; cut off there`);
        }

        const parts: ReplyPart[] = reply.parts;
        await this.chatModel.addAiMessage(chat.id, chat.messages.length, result.model, parts);
        await this.chatModel.touchPlayed(chat.id);
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

    /** Spec: "Reject the send if the Story isn't playable, or if text credit is out." */
    private async requireSendable(story: StoryEntity, chat: ChatEntity): Promise<void> {
        this.requirePlayable(story);
        if (await this.textCreditOut()) throw new OutOfCreditError('text');
        if (this.inFlight.has(chat.id)) throw new TurnInProgressError();
    }

    private requirePlayable(story: StoryEntity): void {
        const status = playableStatus(story);
        if (!status.playable) throw new StoryNotPlayableError(status.missing);
    }

    private async textCreditOut(): Promise<boolean> {
        const remaining = (await this.gateway.remainingCredit()).text.remainingUsd;
        return remaining !== null && remaining <= 0;
    }

    private async detail(story: StoryEntity, chat: ChatEntity): Promise<ChatDetail> {
        const [settings, textCreditOut] = await Promise.all([this.settingsModel.get(), this.textCreditOut()]);
        const scene = story.scenes.find((candidate) => candidate.id === chat.currentSceneId);
        const lastModel = lastAiModel(chat);
        return {
            ...chat.toSummary(),
            currentScene: scene ? { id: scene.id, name: scene.name } : null,
            identityName: story.role.name,
            messages: chat.messages.map((message) => message.toResponse()),
            awaitingReply: awaitingReply(chat),
            ...playableStatus(story),
            textCreditOut,
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

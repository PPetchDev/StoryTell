import { Injectable, Logger } from '@nestjs/common';

import { AppConfig } from '../../../config/app-config.js';
import { AppError } from '../../../errors/app-error.js';
import { ChatModelService } from '../../../model/chat/chat.service.js';
import { ChatEntity } from '../../../model/chat/entities/chat.entity.js';
import { BackgroundStatus, MessageEntity, MessageKind } from '../../../model/chat/entities/message.entity.js';
import { BondChangeEntity } from '../../../model/ledger/entities/bond-change.entity.js';
import { LedgerModelService } from '../../../model/ledger/ledger.service.js';
import { StoryEntity } from '../../../model/story/entities/story.entity.js';
import { ModelGateway } from '../../../service/model-gateway/model-gateway.js';
import { partsToText } from '../turn/reply-parser.js';
import { applyJudgement } from './apply-judgement.js';
import { buildJudgePrompt, JUDGE_CONTEXT_MESSAGES, parseJudgement } from './judge-prompt.js';

/** What a send found when it looked at the previous AI Message's judge. */
export interface SettledBackground {
    /** null when no AI Message of the Chat has a judge (only the Opening so far). */
    status: BackgroundStatus | null;
    /** True when the caller waited or wrote: its loaded Chat may be stale and should be reloaded. */
    waited: boolean;
}

/** A Bond's current value is its latest BondChange. Keyed by direction, in first-seen order. */
export function currentBonds(changes: BondChangeEntity[]): BondChangeEntity[] {
    const latest = new Map<string, BondChangeEntity>();
    for (const change of changes) {
        latest.set(`${change.fromCharacterId}->${change.toCharacterId ?? 'user'}`, change);
    }
    return [...latest.values()];
}

/** The latest AI Message a model wrote, which is the only one whose judge can be pending or failed. */
export function latestJudged(chat: ChatEntity): MessageEntity | null {
    for (let i = chat.messages.length - 1; i >= 0; i--) {
        const message = chat.messages[i];
        if (message.kind === MessageKind.Ai && message.judgeStatus !== null) return message;
    }
    return null;
}

/**
 * The Bond, Arc and Scene judge (spec: "Background judge"): one V4 Flash call in JSON mode
 * after every turn, run in the background against the AI Message it judges. The result goes
 * through the apply rules into the ledger; a failure of any kind marks the Message failed
 * with the reason, and the next send is blocked until Retry runs the judge again.
 */
@Injectable()
export class JudgeManagerService {
    private readonly logger = new Logger(JudgeManagerService.name);
    /** The judge running for each Chat, so a send can wait for it. */
    private readonly running = new Map<number, Promise<void>>();

    constructor(
        private readonly chatModel: ChatModelService,
        private readonly ledger: LedgerModelService,
        private readonly gateway: ModelGateway,
        private readonly config: AppConfig,
    ) {}

    /** Runs the judge in the background. The Message's status must already be pending. */
    start(story: StoryEntity, chatId: number, messageId: number): void {
        void this.run(story, chatId, messageId);
    }

    /** Runs the judge and resolves once its status is done or failed. Never rejects. */
    run(story: StoryEntity, chatId: number, messageId: number): Promise<void> {
        const work = this.execute(story, chatId, messageId).finally(() => {
            if (this.running.get(chatId) === work) this.running.delete(chatId);
        });
        this.running.set(chatId, work);
        return work;
    }

    /**
     * Spec: "Send flow", step 2. Waits for a pending judge up to the configured time. A
     * pending Message with no judge running (the app restarted mid-call) is marked failed,
     * so it can be retried rather than waited on forever.
     */
    async settle(chat: ChatEntity): Promise<SettledBackground> {
        const last = latestJudged(chat);
        if (!last) return { status: null, waited: false };
        if (last.judgeStatus !== BackgroundStatus.Pending) return { status: last.judgeStatus, waited: false };

        const running = this.running.get(chat.id);
        if (!running) {
            await this.chatModel.setJudgeStatus(last.id, BackgroundStatus.Failed, 'The app restarted before the judge finished.');
            return { status: BackgroundStatus.Failed, waited: true };
        }
        const finished = await Promise.race([running.then(() => true), sleep(this.config.backgroundWaitMs)]);
        if (!finished) return { status: BackgroundStatus.Pending, waited: true };
        const fresh = await this.chatModel.findMessage(last.id);
        return { status: fresh?.judgeStatus ?? BackgroundStatus.Failed, waited: true };
    }

    private async execute(story: StoryEntity, chatId: number, messageId: number): Promise<void> {
        try {
            // Reloaded here, not taken from the caller: the Chat may have moved on since it was read.
            const chat = await this.chatModel.findWithMessages(chatId);
            const index = chat?.messages.findIndex((message) => message.id === messageId) ?? -1;
            if (!chat || index < 0) return;
            const message = chat.messages[index];
            const before = chat.messages.slice(0, index);
            const userMessage = before[before.length - 1]?.kind === MessageKind.User ? before[before.length - 1] : null;
            const context = (userMessage ? before.slice(0, -1) : before).slice(-JUDGE_CONTEXT_MESSAGES);
            const identityName = story.role.name;
            const nameOf = (characterId: number | null): string | null =>
                characterId === null ? null : (story.characters.find((c) => c.id === characterId)?.name ?? null);

            const state = await this.ledger.state(chat.id);
            const bonds = currentBonds(state.bondChanges);
            const scene = story.scenes.find((candidate) => candidate.id === chat.currentSceneId) ?? null;
            const prompt = buildJudgePrompt({
                cast: story.characters.map((character) => ({
                    name: character.name,
                    personality: character.personality,
                    arcDirection: state.arcDirections.find((d) => d.characterId === character.id)?.text ?? '',
                })),
                identityName,
                bonds: bonds.flatMap((bond) => {
                    const fromName = nameOf(bond.fromCharacterId);
                    const toName = nameOf(bond.toCharacterId);
                    return fromName && (bond.toCharacterId === null || toName)
                        ? [{ fromName, toName, label: bond.label, description: bond.description }]
                        : [];
                }),
                arcs: story.characters.map((character) => ({
                    name: character.name,
                    steps: state.arcSteps.filter((step) => step.characterId === character.id).map((step) => step.step),
                })),
                scene: scene ? { name: scene.name, moveOnCondition: scene.moveOnCondition } : null,
                recent: context.map((entry) => messageLine(entry, identityName)),
                userText: userMessage?.text ?? '',
                aiText: partsToText(message.parts.map((part) => part.toResponse())),
            });

            const result = await this.gateway.completeText({
                kind: 'judge',
                messages: prompt.messages,
                maxTokens: prompt.maxTokens,
                json: true,
                servedFor: { storyId: story.id, chatId: chat.id },
            });
            const judgement = parseJudgement(result.text);
            const applied = applyJudgement(
                {
                    cast: story.characters.map((character) => ({ id: character.id, name: character.name })),
                    identityName,
                    bonds,
                    scenes: story.scenes.map((candidate) => ({ id: candidate.id, name: candidate.name })),
                    currentSceneId: chat.currentSceneId,
                },
                judgement,
            );
            for (const reason of applied.rejected) {
                this.logger.log(`Chat ${chat.id}, Message ${message.id}: judge item dropped: ${reason}`);
            }
            await this.ledger.record(chat.id, message.id, applied);
        } catch (error) {
            const reason = error instanceof AppError ? error.message : `Unexpected error: ${String(error)}`;
            this.logger.warn(`Chat ${chatId}, Message ${messageId}: the judge failed: ${reason}`);
            try {
                await this.chatModel.setJudgeStatus(messageId, BackgroundStatus.Failed, reason);
            } catch (writeError) {
                this.logger.error(`Chat ${chatId}, Message ${messageId}: could not record the judge failure: ${String(writeError)}`);
            }
        }
    }
}

/** A Message as the judge's context shows it: `Name: text` for the user, `@Name:` text for the AI. */
function messageLine(message: MessageEntity, identityName: string): string {
    if (message.kind === MessageKind.User) return `${message.identityName ?? identityName}: ${message.text ?? ''}`;
    return partsToText(message.parts.map((part) => part.toResponse()));
}

/** Resolves to false after `ms`, for racing against work that resolves to true. */
export function sleep(ms: number): Promise<false> {
    return new Promise((resolve) => {
        const timer = setTimeout(() => resolve(false), ms);
        // A pending timer must not keep the process alive once the work it raced is done.
        timer.unref?.();
    });
}

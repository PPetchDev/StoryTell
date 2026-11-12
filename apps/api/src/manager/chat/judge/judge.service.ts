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
import { exchangeUserText } from '../exchange.js';
import { exchangeIdentityName } from '../identity.js';
import { repliesInScene } from '../scene-replies.js';
import { Attempt, BackgroundRuns } from '../background-runs.js';
import { partsToText } from '../turn/reply-parser.js';
import { applyJudgement, emotionsOfParts } from './apply-judgement.js';
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
 * after every turn, run in the background against the AI Message it judges. When the Story has an
 * Expression, the same call also tags the emotion of each line a Character speaks. The result goes
 * through the apply rules into the ledger. A failure of any kind is tried once more after
 * `backgroundRetryMs`; if that fails too, the Message is marked failed with the reason, and
 * the next send is blocked until Retry runs the judge again (.scratch/background-retry/spec.md).
 */
@Injectable()
export class JudgeManagerService {
    private readonly logger = new Logger(JudgeManagerService.name);
    /** The judge running for each Chat, both tries included, so a send can wait for it. */
    private readonly runs: BackgroundRuns;

    constructor(
        private readonly chatModel: ChatModelService,
        private readonly ledger: LedgerModelService,
        private readonly gateway: ModelGateway,
        private readonly config: AppConfig,
    ) {
        this.runs = new BackgroundRuns(config.backgroundRetryMs);
    }

    /** Runs the judge in the background. The Message's status must already be pending. */
    start(story: StoryEntity, chatId: number, messageId: number): void {
        void this.run(story, chatId, messageId);
    }

    /**
     * Runs the judge and resolves once its status is done or failed. Never rejects. With
     * `autoRetry` (the background after a reply), a failure is tried once more first; a Retry
     * press runs it once.
     */
    run(story: StoryEntity, chatId: number, messageId: number, autoRetry = true): Promise<void> {
        return this.runs.run(
            chatId,
            () => this.execute(story, chatId, messageId),
            (reason) => this.recordFailure(chatId, messageId, reason),
            autoRetry,
        );
    }

    /**
     * Spec: "Send flow", step 2. Waits for a pending judge up to the configured time; a retry
     * still waiting out its delay is run at once. A pending Message with no judge running (the
     * app restarted mid-call) is marked failed, so it can be retried rather than waited on forever.
     */
    async settle(chat: ChatEntity): Promise<SettledBackground> {
        const last = latestJudged(chat);
        if (!last) return { status: null, waited: false };
        if (last.judgeStatus !== BackgroundStatus.Pending) return { status: last.judgeStatus, waited: false };

        const running = this.runs.current(chat.id);
        if (!running) {
            await this.chatModel.setJudgeStatus(last.id, BackgroundStatus.Failed, 'The app restarted before the judge finished.');
            return { status: BackgroundStatus.Failed, waited: true };
        }
        this.runs.hurry(chat.id);
        const finished = await Promise.race([running.then(() => true), sleep(this.config.backgroundWaitMs)]);
        if (!finished) return { status: BackgroundStatus.Pending, waited: true };
        const fresh = await this.chatModel.findMessage(last.id);
        return { status: fresh?.judgeStatus ?? BackgroundStatus.Failed, waited: true };
    }

    /** One try of the judge: its result applied, or why it failed. Never rejects. */
    private async execute(story: StoryEntity, chatId: number, messageId: number): Promise<Attempt> {
        try {
            // Reloaded here, not taken from the caller: the Chat may have moved on since it was read.
            const chat = await this.chatModel.findWithMessages(chatId);
            const index = chat?.messages.findIndex((message) => message.id === messageId) ?? -1;
            if (!chat || index < 0) return { ok: true };
            const message = chat.messages[index];
            const before = chat.messages.slice(0, index);
            const userText = exchangeUserText(chat.messages, index);
            const context = (userText !== null ? before.slice(0, -1) : before).slice(-JUDGE_CONTEXT_MESSAGES);
            const identityName = exchangeIdentityName(story, chat, index);
            const nameOf = (characterId: number | null): string | null =>
                characterId === null ? null : (story.characters.find((c) => c.id === characterId)?.name ?? null);

            const state = await this.ledger.state(chat.id);
            const bonds = currentBonds(state.bondChanges);
            const scene = story.scenes.find((candidate) => candidate.id === chat.currentSceneId) ?? null;
            // Up to and including the judged reply (.scratch/scene-flow/spec.md); null in free play.
            const replies = repliesInScene({
                currentSceneId: scene?.id ?? null,
                messages: chat.messages.slice(0, index + 1),
                sceneAdvances: state.sceneAdvances,
            });
            // Read with the Chat as it is now, like the Scene: who sits out when the judge runs.
            const sittingOut = chat.sittingOutIds();
            const replyParts = message.parts.map((part) => part.toResponse());
            // Lines are tagged only where a tag can show (.scratch/expressions/spec.md): otherwise the prompt is as before.
            const tagLines = story.characters.some((character) => (character.expressions ?? []).length > 0);
            const prompt = buildJudgePrompt({
                cast: story.characters.map((character) => ({
                    name: character.name,
                    personality: character.personality,
                    arcDirection: state.arcDirections.find((d) => d.characterId === character.id)?.text ?? '',
                    ...(sittingOut.includes(character.id) ? { sittingOut: true } : {}),
                })),
                identityName,
                bonds: bonds.flatMap((bond) => {
                    const fromName = nameOf(bond.fromCharacterId);
                    const toName = nameOf(bond.toCharacterId);
                    return fromName && (bond.toCharacterId === null || toName)
                        ? [{ fromName, toName, label: bond.label, description: bond.description, levels: bond.levels() }]
                        : [];
                }),
                arcs: story.characters.map((character) => ({
                    name: character.name,
                    steps: state.arcSteps.filter((step) => step.characterId === character.id).map((step) => step.step),
                })),
                // A Scene its Bond gates alone move on shows "(gates only)": its move_on is not asked for (.scratch/bond-axes/spec.md).
                scene: scene
                    ? {
                          name: scene.name,
                          moveOnCondition: scene.moveOnCondition,
                          ...((scene.gates ?? []).length > 0 && scene.moveOnCondition.trim() === '' ? { gatesOnly: true } : {}),
                          replies: replies ?? 0,
                      }
                    : null,
                timeOfDay: chat.timeOfDay,
                storySoFar: chat.storySoFar,
                recent: context.map((entry) => messageLine(entry, identityName)),
                userText,
                aiText: partsToText(replyParts),
                ...(tagLines ? { expressionParts: replyParts } : {}),
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
                    bonds: bonds.map((bond) => ({
                        fromCharacterId: bond.fromCharacterId,
                        toCharacterId: bond.toCharacterId,
                        label: bond.label,
                        description: bond.description,
                        levels: bond.levels(),
                    })),
                    scenes: story.scenes.map((candidate) => ({
                        id: candidate.id,
                        name: candidate.name,
                        moveOnCondition: candidate.moveOnCondition,
                        gates: (candidate.gates ?? []).map(({ fromCharacterId, toCharacterId, axis, atLeast }) => ({ fromCharacterId, toCharacterId, axis, atLeast })),
                    })),
                    currentSceneId: chat.currentSceneId,
                    timeOfDay: chat.timeOfDay,
                    sittingOut,
                    repliesInScene: replies,
                },
                judgement,
            );
            for (const reason of applied.rejected) {
                this.logger.log(`Chat ${chat.id}, Message ${message.id}: judge item dropped: ${reason}`);
            }
            if (applied.passedBy !== null && applied.scene) {
                this.logger.log(
                    `Chat ${chat.id}, Message ${message.id}: after ${replies} replies the story passed Scene "${applied.scene.fromSceneName}" by: ${applied.passedBy}`,
                );
            }
            // Written with the rest of the judgement, in its one transaction, never after it. Without
            // Expressions the parts are not touched, so the record is exactly as before.
            const emotions = tagLines ? emotionsOfParts(message.parts, judgement.expressions) : undefined;
            await this.ledger.record(chat.id, message.id, { ...applied, ...(emotions ? { emotions } : {}) });
            return { ok: true };
        } catch (error) {
            const reason = error instanceof AppError ? error.message : `Unexpected error: ${String(error)}`;
            this.logger.warn(`Chat ${chatId}, Message ${messageId}: the judge failed: ${reason}`);
            return { ok: false, reason };
        }
    }

    private async recordFailure(chatId: number, messageId: number, reason: string): Promise<void> {
        try {
            await this.chatModel.setJudgeStatus(messageId, BackgroundStatus.Failed, reason);
        } catch (writeError) {
            this.logger.error(`Chat ${chatId}, Message ${messageId}: could not record the judge failure: ${String(writeError)}`);
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

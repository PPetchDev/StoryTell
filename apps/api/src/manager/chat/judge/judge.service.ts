import { Injectable, Logger } from '@nestjs/common';
import { YourFaceModelService } from '../../../model/your-face/your-face.service.js';

import { AppConfig } from '../../../config/app-config.js';
import { AppError } from '../../../errors/app-error.js';
import { ChatModelService } from '../../../model/chat/chat.service.js';
import { ChatEntity } from '../../../model/chat/entities/chat.entity.js';
import { BackgroundStatus, MessageEntity, MessageKind } from '../../../model/chat/entities/message.entity.js';
import { BondChangeEntity } from '../../../model/ledger/entities/bond-change.entity.js';
import { LedgerModelService } from '../../../model/ledger/ledger.service.js';
import { StoryEntity } from '../../../model/story/entities/story.entity.js';
import { RoleStat } from '../../../model/story/entities/role.entity.js';
import { ModelGateway } from '../../../service/model-gateway/model-gateway.js';
import { exchangeUserText } from '../exchange.js';
import { exchangeIdentityName } from '../identity.js';
import { repliesInScene } from '../scene-replies.js';
import { applySuddenEvent, judgeSuddenEventSection } from '../sudden-event/sudden-event.js';
import { aiEventOffered, chatEventState, readNewEventFrom, takeNewEvent, withAiEvents } from '../sudden-event/ai-events.js';
import { SuddenEventStepKind } from '../../../model/ledger/entities/sudden-event-step.entity.js';
import { applyDetails, currentDetails, judgeDetailsSection, placeAge } from '../details/details.js';
import { applyFacts, factsState, judgeFactsSection } from '../details/facts.js';
import { applyNow, currentNowNotes, judgeNowSection } from '../details/now-notes.js';
import { applyItems, itemsState, judgeItemsSection, readJudgedItemsFrom, withItemsJudge } from '../details/items.js';
import { applyEnding, ENDING_SUGGEST_AFTER_REPLIES, endingState, judgeEndingSection } from '../ending/ending.js';
import { AUTHOR_MODEL } from '../../../model/chat/entities/message.entity.js';
import { Attempt, BackgroundRuns } from '../background-runs.js';
import { partsToText } from '../turn/reply-parser.js';
import { applyJudgement, emotionsOfParts } from './apply-judgement.js';
import { buildJudgePrompt, JUDGE_CONTEXT_MESSAGES, parseJudgement } from './judge-prompt.js';
import { applyRollOffer, judgeRollOfferSection, rollOfferAllowed } from '../roll-offer/roll-offer.js';
import { StageManagerService } from '../stage/stage.service.js';
import { applySecretReveals, hasLevelledSecret, judgeSecretsSection, secretsState, storySecrets } from '../secrets/secrets.js';

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
        private readonly stage: StageManagerService,
        private readonly yourFaces: YourFaceModelService,
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
            const nextScene = scene ? (story.scenes[story.scenes.indexOf(scene) + 1] ?? null) : null;
            // Up to and including the judged reply (.scratch/scene-flow/spec.md); null in free play.
            const replies = repliesInScene({
                currentSceneId: scene?.id ?? null,
                messages: chat.messages.slice(0, index + 1),
                sceneAdvances: state.sceneAdvances,
            });
            // Read with the Chat as it is now, like the Scene: who sits out when the judge runs.
            const sittingOut = chat.sittingOutIds();
            // The Chat's Sudden events before this reply (.scratch/sudden-events/spec.md): a step of its own, left by a judgement run before, is not counted.
            // With the events the Chat made up (.scratch/ai-events/spec.md): an accepted one runs as the author's do.
            const events = chatEventState(
                story.suddenEvents ?? [],
                state.chatSuddenEvents.filter((event) => event.messageId !== message.id),
                state.suddenEventSteps.filter((step) => step.messageId !== message.id),
            );
            // An Epilogue stands outside the Sudden events (docs/ui-audit-2026-11-16.md M6): it closes the story, so it is
            // not one of an event's replies and starts none. The event is where it was if the user plays on.
            const eventsJudged = !message.epilogue;
            // Sudden events the story makes up (.scratch/ai-events/spec.md): offered rarely, never with one under way.
            const aiEvents = {
                on: story.aiEvents === true,
                offered: aiEventOffered({
                    on: story.aiEvents === true,
                    epilogue: !!message.epilogue,
                    active: events.active !== null,
                    replyIds: chat.messages
                        .slice(0, index + 1)
                        .filter((written) => written.kind === MessageKind.Ai && written.model !== AUTHOR_MODEL)
                        .map((written) => written.id),
                    proposalMessageIds: state.chatSuddenEvents.flatMap((event) => (event.messageId !== null && event.messageId !== message.id ? [event.messageId] : [])),
                    stepMessageIds: state.suddenEventSteps.filter((step) => step.messageId !== message.id).map((step) => step.messageId),
                }),
            };
            // The Place, the Weather and the Outfits before this reply (.scratch/info-box/spec.md), read as the Sudden events are.
            const detailsBefore = state.detailChanges.filter((change) => change.messageId !== message.id);
            const details = currentDetails(detailsBefore);
            // How long ago the Place was noted, up to the judged reply (.scratch/cache-and-voices/spec.md).
            const ageOfPlace = placeAge(detailsBefore, chat.messages.slice(0, index + 1).map((written) => written.id));
            const detailsCast = story.characters.map((character) => ({ id: character.id, name: character.name }));
            // The Chat's Established facts before this reply (.scratch/story-quality/spec.md), read the same way.
            // With the topics the user deleted, which stay deleted (.scratch/facts-panel/spec.md).
            const factsBefore = factsState(state.detailChanges.filter((change) => change.messageId !== message.id));
            const facts = factsBefore.facts.map(({ topic, fact }) => ({ topic, fact }));
            // The Now notes before this reply (.scratch/growing-cards/spec.md), read the same way; the user's own have no Message.
            const nowNotes = currentNowNotes(state.detailChanges.filter((change) => change.messageId !== message.id));
            // The Items before this reply (.scratch/story-items/spec.md), read the same way, with the names the user deleted.
            const itemsBefore = itemsState(state.detailChanges.filter((change) => change.messageId !== message.id));
            const items = itemsBefore.items.map(({ name, holder, how, end }) => ({ name, holder, how, end }));
            // The Chat's Ending before this reply (.scratch/endings/spec.md), read the same way: only one not yet reached is asked about.
            const endings = endingState(
                story.endings ?? [],
                state.endingsReached.filter((record) => record.messageId !== message.id),
                {
                    // An Ending of the Judge's own, only once the story has had room to run, and never on the Epilogue itself.
                    suggestions:
                        chat.endingSuggestions &&
                        !message.epilogue &&
                        chat.messages.slice(0, index + 1).filter((written) => written.kind === MessageKind.Ai && written.model !== AUTHOR_MODEL).length >=
                            ENDING_SUGGEST_AFTER_REPLIES,
                },
            );
            const replyParts = message.parts.map((part) => part.toResponse());
            // .scratch/your-faces/spec.md: the user's own line gets a face the Judge guesses when they picked
            // none, and only where it can show: the Role or Persona it was written as has Expressions.
            const userMessage = index > 0 && chat.messages[index - 1].kind === MessageKind.User ? chat.messages[index - 1] : null;
            const askFace =
                userMessage !== null &&
                userMessage.faceBy !== 'user' &&
                (userMessage.personaId === null
                    ? (story.role.expressions ?? []).length > 0
                    : (await this.yourFaces.list({ personaId: userMessage.personaId })).length > 0);
            // Lines are tagged only where a tag can show (.scratch/expressions/spec.md): otherwise the prompt is as before.
            const tagLines = story.characters.some((character) => (character.expressions ?? []).length > 0);
            const offering = rollOffering(story, chat, index);
            // The Secrets on offer when the reply was written (.scratch/secret-reveals/spec.md): this Message's own reveals left out.
            const secretsShape = hasLevelledSecret(story.characters);
            const secrets = secretsState({
                secrets: storySecrets(story.characters),
                bonds: bonds.map((bond) => ({ fromCharacterId: bond.fromCharacterId, toCharacterId: bond.toCharacterId, levels: bond.levels() })),
                reveals: state.secretReveals.filter((reveal) => reveal.messageId !== message.id),
                sittingOut,
            });
            // Items go on before the made-up events (.scratch/story-items/spec.md): their shape on every call, their section last but for a new event's.
            const prompt = withAiEvents(withItemsJudge(buildJudgePrompt({
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
                          situation: scene.situation,
                          moveOnCondition: scene.moveOnCondition,
                          ...((scene.gates ?? []).length > 0 && scene.moveOnCondition.trim() === '' ? { gatesOnly: true } : {}),
                          replies: replies ?? 0,
                          // Where passing by goes, as apply-judgement moves it: the next Scene in order, or free play.
                          next: nextScene ? { name: nextScene.name, situation: nextScene.situation } : null,
                      }
                    : null,
                timeOfDay: chat.timeOfDay,
                storySoFar: chat.storySoFar,
                recent: context.map((entry) => messageLine(entry, identityName)),
                userText,
                aiText: partsToText(replyParts),
                ...(tagLines ? { expressionParts: replyParts } : {}),
                suddenEventSection: eventsJudged ? judgeSuddenEventSection(events) : null,
                detailsSection: judgeDetailsSection(details, detailsCast, ageOfPlace),
                endingSection: judgeEndingSection(endings),
                factsSection: judgeFactsSection(facts),
                nowSection: judgeNowSection(nowNotes, detailsCast),
                rollOfferSection: offering.section,
                ...(secretsShape ? { secretsShape, secretsSection: judgeSecretsSection(secrets.offered) } : {}),
                ...(askFace ? { userFace: true } : {}),
            }), judgeItemsSection(items)), aiEvents);

            const result = await this.gateway.completeText({
                kind: 'judge',
                messages: prompt.messages,
                maxTokens: prompt.maxTokens,
                json: true,
                servedFor: { storyId: story.id, chatId: chat.id, messageId: message.id },
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
            const stepped = eventsJudged ? applySuddenEvent(events, judgement.suddenEvent ?? null) : { step: null, rejected: [] };
            const detailed = applyDetails({ current: details, cast: detailsCast, sittingOut }, judgement.details ?? null);
            const ended = applyEnding(endings, judgement.ending ?? null);
            // Only the user's own words change a listed fact (.scratch/story-quality/spec.md).
            const facted = applyFacts(facts, judgement.facts ?? null, userText ?? '', factsBefore.clearedByUser);
            const offered = applyRollOffer(offering, judgement.rollOffer ?? null);
            const revealed = applySecretReveals(secrets.offered, judgement.secretsRevealed ?? []);
            for (const reason of revealed.rejected) this.logger.log(`Chat ${chat.id}, Message ${message.id}: judge item dropped: ${reason}`);
            for (const reason of offered.rejected) this.logger.log(`Chat ${chat.id}, Message ${message.id}: judge item dropped: ${reason}`);
            const proposed = takeNewEvent(
                { offered: aiEvents.offered, startedAnother: stepped.step?.kind === SuddenEventStepKind.Start, exchange: `${userText ?? ''}\n${partsToText(replyParts)}` },
                aiEvents.on ? readNewEventFrom(result.text) : null,
            );
            for (const reason of proposed.rejected) this.logger.log(`Chat ${chat.id}, Message ${message.id}: judge item dropped: ${reason}`);
            const noted = applyNow({ current: nowNotes, cast: detailsCast, sittingOut, identityName }, judgement.now ?? []);
            // The Judge extracts the Item changes; the code decides what is taken (.scratch/story-items/spec.md).
            const itemed = applyItems(
                { current: items, identityName, cast: detailsCast.map((member) => member.name), userText: userText ?? '', clearedByUser: itemsBefore.clearedByUser },
                readJudgedItemsFrom(result.text),
            );
            for (const reason of [...applied.rejected, ...stepped.rejected, ...detailed.rejected, ...noted.rejected, ...ended.rejected, ...facted.rejected, ...itemed.rejected]) {
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
            await this.ledger.record(chat.id, message.id, { ...applied, suddenEvent: stepped.step, details: [...detailed.changes, ...facted.changes, ...noted.changes, ...itemed.changes], ending: ended.reached, ...(emotions ? { emotions } : {}), ...(proposed.event ? { newEvent: proposed.event } : {}), rollOffer: offered.offer, ...(revealed.reveals.length > 0 ? { secretReveals: revealed.reveals } : {}) });
            if (askFace && userMessage && judgement.userFace) await this.chatModel.setJudgedFace(userMessage.id, judgement.userFace);
            // The place, light, outfits and line emotions are settled: dress the stage (.scratch/dressed-stage/spec.md).
            this.stage.dress(story.id, chat.id);
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

/**
 * Whether the judged reply may carry a Roll offer, and the Judge's section when it may
 * (.scratch/judge-rolls/spec.md): read with the Chat up to and including the reply.
 */
function rollOffering(story: StoryEntity, chat: ChatEntity, index: number): { allowed: boolean; stats: RoleStat[]; section: string | null } {
    const stats = story.role.stats ?? [];
    const allowed = rollOfferAllowed({ rollOffers: story.rollOffers ?? true, messages: chat.messages.slice(0, index + 1), index });
    return { allowed, stats, section: allowed ? judgeRollOfferSection(stats) : null };
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

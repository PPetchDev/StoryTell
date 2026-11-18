import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, IsNull, MoreThanOrEqual, Repository } from 'typeorm';

import { ChatEntity, TimeOfDay } from '../chat/entities/chat.entity.js';
import { BackgroundStatus, MessageEntity } from '../chat/entities/message.entity.js';
import { BeliefAuthor, BeliefEntity, BeliefSnapshot } from '../memory/entities/belief.entity.js';
import { MemoryKnownByEntity } from '../memory/entities/memory-known-by.entity.js';
import { MemoryAuthor, MemoryEntity, MemorySnapshot } from '../memory/entities/memory.entity.js';
import { createMemory, setKnownBy } from '../memory/memory.service.js';
import type { Emotion } from '../story/emotion.js';
import { BondLevels } from './bond-axes.js';
import { ArcStepEntity } from './entities/arc-step.entity.js';
import { BeliefChangeEntity, BeliefChangeKind } from './entities/belief-change.entity.js';
import { BondChangeEntity } from './entities/bond-change.entity.js';
import { ChatArcDirectionEntity } from './entities/chat-arc-direction.entity.js';
import { MemoryChangeEntity, MemoryChangeKind } from './entities/memory-change.entity.js';
import { SceneAdvanceEntity } from './entities/scene-advance.entity.js';
import { SuddenEventStepEntity, SuddenEventStepKind } from './entities/sudden-event-step.entity.js';
import { DetailChangeEntity, DetailKind } from './entities/detail-change.entity.js';
import { DiaryEntryEntity } from './entities/diary-entry.entity.js';
import { EndingReachedEntity } from './entities/ending-reached.entity.js';
import { TimeChangeEntity } from './entities/time-change.entity.js';

/** A StartingBond as it is seeded into a Chat: no event, no causing Message. */
export interface BondSeed {
    fromCharacterId: number;
    toCharacterId: number | null;
    label: string;
    description: string;
    /** Its starting levels on the Bond axes (.scratch/bond-axes/spec.md, "Storage"). */
    levels: BondLevels;
}

/** A Starting Belief as it is seeded into a Chat: the author's, with no causing Message. */
export interface BeliefSeed {
    characterId: number;
    text: string;
}

export interface ArcDirectionSeed {
    characterId: number;
    text: string;
}

export interface NewBondChange {
    fromCharacterId: number;
    toCharacterId: number | null;
    label: string;
    description: string;
    /** Its levels after the change; null while the Bond has none yet. */
    levels: BondLevels | null;
    before: { label: string; description: string } | null;
    event: string;
}

export interface NewArcStep {
    characterId: number;
    step: string;
    event: string;
}

export interface NewSceneAdvance {
    /** Null only for a user's Move on from free play (.scratch/scene-chapters/spec.md). */
    fromSceneId: number | null;
    fromSceneName: string;
    toSceneId: number | null;
    toSceneName: string | null;
    event: string;
}

export interface NewTimeChange {
    fromTime: TimeOfDay | null;
    toTime: TimeOfDay;
}

/** A Place, the Weather or one Character's Outfit as a judged reply set it (.scratch/info-box/spec.md), after the apply rules. */
export interface NewDetailChange {
    kind: DetailKind;
    /** The Character an Outfit is of; null for the Place and the Weather. */
    characterId: number | null;
    value: string;
}

/** What a judged reply did to a Sudden event (.scratch/sudden-events/spec.md), after the apply rules. */
export interface NewSuddenEventStep {
    suddenEventId: number;
    kind: SuddenEventStepKind;
    gauge: number;
    turnsLeft: number;
    reason: string;
}

/** The emotion the judge tagged one speech part of the judged Message with (.scratch/expressions/spec.md). */
export interface PartEmotion {
    partId: number;
    emotion: Emotion;
}

/** A Chat reaching an Ending, as a judged reply showed it (.scratch/endings/spec.md), after the apply rules. */
export interface NewEndingReached {
    /** The author's Ending; null for one the Judge suggested. */
    endingId: number | null;
    /** A suggested Ending's name; null for the author's. */
    name: string | null;
    reason: string;
}

/** What one judgement changed, recorded together against the AI Message that caused it. */
export interface MessageChanges {
    bonds: NewBondChange[];
    arcs: NewArcStep[];
    scene: NewSceneAdvance | null;
    /** The Time of day moving on; null or left out when it stayed. */
    time?: NewTimeChange | null;
    /** The Sudden event step this reply made; null or left out when it made none. */
    suddenEvent?: NewSuddenEventStep | null;
    /** The Place, the Weather and the Outfits this reply set; left out or empty when it set none. */
    details?: NewDetailChange[];
    /** The Ending this reply reached; null or left out when it reached none. */
    ending?: NewEndingReached | null;
    /**
     * The emotion of each tagged speech part of the Message; every other part of it is cleared. Not
     * ledger rows: nothing rolls them back, since whatever undoes a judgement replaces the parts.
     * Left out, the parts are not touched.
     */
    emotions?: PartEmotion[];
}

/**
 * One operation an extraction asks for, after the apply rules (spec: "Memory extraction").
 * A merge arrives as its deletes plus its add, all with the same event. Applied in order.
 */
export type NewMemoryChange =
    | { kind: 'add'; text: string; knownBy: number[]; event: string }
    | { kind: 'update'; memoryId: number; text: string; event: string }
    | { kind: 'delete'; memoryId: number; event: string }
    | { kind: 'archive'; memoryId: number; event: string }
    | { kind: 'known_by'; memoryId: number; add: number[]; event: string };

/**
 * What an extraction does to the Beliefs, after the apply rules (.scratch/memory-by-meaning/spec.md,
 * "Beliefs"): a Belief made, or an active one given up. Applied in order, after the Memory changes.
 */
export type NewBeliefChange =
    | { kind: 'add'; characterId: number; text: string; contradictsMemoryId: number | null; event: string }
    | { kind: 'give_up'; beliefId: number; event: string };

/** Everything the ledger holds for a Chat, oldest first. */
export interface LedgerState {
    bondChanges: BondChangeEntity[];
    arcSteps: ArcStepEntity[];
    sceneAdvances: SceneAdvanceEntity[];
    arcDirections: ChatArcDirectionEntity[];
    /** Every Sudden event step of the Chat (.scratch/sudden-events/spec.md): its event state is read from them. */
    suddenEventSteps: SuddenEventStepEntity[];
    /** Every Place, Weather and Outfit record of the Chat (.scratch/info-box/spec.md): the newest of each is current. */
    detailChanges: DetailChangeEntity[];
    /** The Chat's record of reaching an Ending (.scratch/endings/spec.md); at most one in practice. */
    endingsReached: EndingReachedEntity[];
}

/** Counts by kind for the rollback notice (spec: "3 Memories rolled back"). */
export interface RollbackCounts {
    memoryChanges: number;
    bondChanges: number;
    arcSteps: number;
    sceneAdvances: number;
}

/**
 * The change ledger (spec: "Change ledger and rollback"): every AI-made change to Memory,
 * Bonds, Arcs, the Scene and the Time of day as a record against its causing AI Message, so a
 * rewind can undo them. Small interface: seed, record for a Message (the judge's changes, or
 * the extraction's), roll back from a Message, clear. Rollback undoes newest first and returns
 * counts by kind.
 */
@Injectable()
export class LedgerModelService {
    constructor(
        @InjectDataSource() private readonly dataSource: DataSource,
        @InjectRepository(BondChangeEntity) private readonly bondChanges: Repository<BondChangeEntity>,
        @InjectRepository(ArcStepEntity) private readonly arcSteps: Repository<ArcStepEntity>,
        @InjectRepository(SceneAdvanceEntity) private readonly sceneAdvances: Repository<SceneAdvanceEntity>,
        @InjectRepository(ChatArcDirectionEntity) private readonly arcDirections: Repository<ChatArcDirectionEntity>,
        @InjectRepository(SuddenEventStepEntity) private readonly suddenEventSteps: Repository<SuddenEventStepEntity>,
        @InjectRepository(DetailChangeEntity) private readonly detailChanges: Repository<DetailChangeEntity>,
        @InjectRepository(DiaryEntryEntity) private readonly diaryEntries: Repository<DiaryEntryEntity>,
        @InjectRepository(EndingReachedEntity) private readonly endingsReached: Repository<EndingReachedEntity>,
    ) {}

    /**
     * Seeds a Chat's first BondChanges from StartingBonds, copies the Arc directions in, and writes one
     * Belief per Starting Belief (.scratch/memory-by-meaning/spec.md), the author's, tied to no Message.
     */
    seed(chatId: number, bonds: BondSeed[], directions: ArcDirectionSeed[], beliefs: BeliefSeed[] = []): Promise<void> {
        return this.dataSource.transaction(async (manager) => {
            await manager.save(
                bonds.map((bond) =>
                    manager.create(BondChangeEntity, {
                        chatId,
                        fromCharacterId: bond.fromCharacterId,
                        toCharacterId: bond.toCharacterId,
                        label: bond.label,
                        description: bond.description,
                        beforeLabel: null,
                        beforeDescription: null,
                        ...levelColumns(bond.levels),
                        event: null,
                        messageId: null,
                    }),
                ),
            );
            await manager.save(
                directions.map((direction) =>
                    manager.create(ChatArcDirectionEntity, {
                        chatId,
                        characterId: direction.characterId,
                        text: direction.text,
                    }),
                ),
            );
            for (const belief of beliefs) {
                await manager.save(
                    manager.create(BeliefEntity, {
                        chatId,
                        characterId: belief.characterId,
                        text: belief.text,
                        contradictsMemoryId: null,
                        writtenBy: BeliefAuthor.User,
                        messageId: null,
                        givenUpMessageId: null,
                    }),
                );
            }
        });
    }

    /**
     * Copies a Character's Arc direction into each of `chatIds` that holds no copy for it yet
     * (spec: "Add Character … its Arc directions are copied in"). A Chat that already holds one
     * keeps it, since the author's later edits reach only new or reset Chats.
     */
    async copyArcDirectionWhereMissing(chatIds: number[], direction: ArcDirectionSeed): Promise<void> {
        if (chatIds.length === 0) return;
        const held = await this.arcDirections.find({
            where: { chatId: In(chatIds), characterId: direction.characterId },
            select: { chatId: true },
        });
        const holding = new Set(held.map((row) => row.chatId));
        const missing = chatIds.filter((chatId) => !holding.has(chatId));
        await this.arcDirections.save(
            missing.map((chatId) =>
                this.arcDirections.create({ chatId, characterId: direction.characterId, text: direction.text }),
            ),
        );
    }

    async state(chatId: number): Promise<LedgerState> {
        const [bondChanges, arcSteps, sceneAdvances, arcDirections, suddenEventSteps, detailChanges, endingsReached] = await Promise.all([
            this.bondChanges.find({ where: { chatId }, order: { id: 'ASC' } }),
            this.arcSteps.find({ where: { chatId }, order: { id: 'ASC' } }),
            this.sceneAdvances.find({ where: { chatId }, order: { id: 'ASC' } }),
            this.arcDirections.find({ where: { chatId }, order: { id: 'ASC' } }),
            this.suddenEventStepsOf(chatId),
            this.detailChangesOf(chatId),
            this.endingsReachedOf([chatId]),
        ]);
        return { bondChanges, arcSteps, sceneAdvances, arcDirections, suddenEventSteps, detailChanges, endingsReached };
    }

    /** The records of these Chats reaching an Ending (.scratch/endings/spec.md), oldest first. */
    endingsReachedOf(chatIds: number[]): Promise<EndingReachedEntity[]> {
        if (chatIds.length === 0) return Promise.resolve([]);
        return this.endingsReached.find({ where: { chatId: In(chatIds) }, order: { id: 'ASC' } });
    }

    /**
     * Waves away the Chat's suggested Ending (.scratch/endings/spec.md): its record goes, and the
     * Judge suggests no more in this Chat. Answers false when the Chat has none.
     */
    dismissSuggestedEnding(chatId: number): Promise<boolean> {
        return this.dataSource.transaction(async (manager) => {
            const result = await manager.delete(EndingReachedEntity, { chatId, endingId: IsNull() });
            if ((result.affected ?? 0) === 0) return false;
            await manager.update(ChatEntity, { id: chatId }, { endingSuggestions: false });
            return true;
        });
    }

    /** The Chat's Diary entries (.scratch/diary/spec.md), every Character's, oldest first. */
    diaryEntriesOf(chatId: number): Promise<DiaryEntryEntity[]> {
        return this.diaryEntries.find({ where: { chatId }, order: { id: 'ASC' } });
    }

    /** Keeps an entry a Character wrote, against the AI Message the story stood at. */
    addDiaryEntry(entry: { chatId: number; characterId: number; messageId: number; moment: string | null; text: string; innerLife: string | null }): Promise<DiaryEntryEntity> {
        return this.diaryEntries.save(this.diaryEntries.create(entry));
    }

    /** Deletes one entry of the Chat; false when the Chat has none with that id. */
    async deleteDiaryEntry(chatId: number, entryId: number): Promise<boolean> {
        const result = await this.diaryEntries.delete({ id: entryId, chatId });
        return (result.affected ?? 0) > 0;
    }

    /** The Chat's Place, Weather and Outfit records alone, oldest first: the newest of each is current. */
    detailChangesOf(chatId: number): Promise<DetailChangeEntity[]> {
        return this.detailChanges.find({ where: { chatId }, order: { id: 'ASC' } });
    }

    /**
     * The user's own Now note for one Character (.scratch/growing-cards/spec.md): a detail record tied
     * to no Message, so no rewind takes it away; "" clears the note. It is the newest record, so it is
     * current until a later judgement changes the note.
     */
    async setUserNowNote(chatId: number, characterId: number, value: string): Promise<void> {
        await this.detailChanges.save(this.detailChanges.create({ chatId, kind: DetailKind.Now, characterId, value, messageId: null }));
    }

    /**
     * The user's own Established fact (.scratch/facts-panel/spec.md), `topic: fact`, or `topic: ` to
     * delete it: a detail record tied to no Message, like the user's Now note, so no rewind takes it away.
     */
    async setUserFact(chatId: number, value: string): Promise<void> {
        await this.detailChanges.save(this.detailChanges.create({ chatId, kind: DetailKind.Fact, characterId: null, value, messageId: null }));
    }

    /** The Chat's Sudden event steps alone, oldest first: what its event state is read from. */
    suddenEventStepsOf(chatId: number): Promise<SuddenEventStepEntity[]> {
        return this.suddenEventSteps.find({ where: { chatId }, order: { id: 'ASC' } });
    }

    /** The Chat's BondChanges alone, oldest first: what the current Bonds are read from. */
    bondChangesOf(chatId: number): Promise<BondChangeEntity[]> {
        return this.bondChanges.find({ where: { chatId }, order: { id: 'ASC' } });
    }

    /** The Chat's latest SceneAdvance, or null while it has never moved on from a Scene. */
    lastSceneAdvance(chatId: number): Promise<SceneAdvanceEntity | null> {
        return this.sceneAdvances.findOne({ where: { chatId }, order: { id: 'DESC' } });
    }

    /**
     * The user's Move on (.scratch/scene-chapters/spec.md): a Scene advance against the Chat's newest AI
     * Message, as the Judge's are, so taking that Message back takes it back. It touches nothing else of
     * the Message: its Judge stays as it was.
     */
    moveScene(chatId: number, messageId: number, advance: NewSceneAdvance): Promise<SceneAdvanceEntity> {
        return this.dataSource.transaction(async (manager) => {
            const saved = await manager.save(manager.create(SceneAdvanceEntity, { chatId, messageId, ...advance, movedBy: 'user' }));
            await manager.update(ChatEntity, { id: chatId }, { currentSceneId: advance.toSceneId });
            return saved;
        });
    }

    /** The Chat's Scene advances, oldest first: each ends a Chapter (.scratch/scene-chapters/spec.md). */
    sceneAdvancesOf(chatId: number): Promise<SceneAdvanceEntity[]> {
        return this.sceneAdvances.find({ where: { chatId }, order: { id: 'ASC' } });
    }

    /**
     * The AI's summary of a Chapter. It lands only while the Chapter has none and the user has not
     * written their own: an advance rolled back meanwhile, or the user's save, makes it a no-op.
     * Answers whether it landed.
     */
    async writeChapter(advanceId: number, text: string): Promise<boolean> {
        const result = await this.sceneAdvances.update(
            { id: advanceId, chapterBy: 'ai', chapterSummary: IsNull() },
            { chapterSummary: text, chapterFailed: null, chapterUpdatedAt: new Date() },
        );
        return (result.affected ?? 0) > 0;
    }

    /** Records why the AI's summary failed, unless the Chapter got a summary meanwhile. */
    async failChapter(advanceId: number, reason: string): Promise<void> {
        await this.sceneAdvances.update({ id: advanceId, chapterSummary: IsNull() }, { chapterFailed: reason });
    }

    /** The user's own summary of a Chapter: the AI never writes over it. False when the Chat has no such Chapter. */
    async saveUserChapter(chatId: number, advanceId: number, text: string): Promise<boolean> {
        const result = await this.sceneAdvances.update(
            { id: advanceId, chatId },
            { chapterSummary: text, chapterBy: 'user', chapterFailed: null, chapterUpdatedAt: new Date() },
        );
        return (result.affected ?? 0) > 0;
    }

    /**
     * Records what a judgement changed against the AI Message that caused it, moves the Chat
     * to the advanced Scene, writes its parts' emotions, and marks the Message's judge done, all in
     * one transaction: the judge is done exactly when its tags are there, and a failure writes
     * nothing, so a retry records each change once.
     */
    record(chatId: number, messageId: number, changes: MessageChanges): Promise<void> {
        return this.dataSource.transaction(async (manager) => {
            await manager.save(
                changes.bonds.map((bond) =>
                    manager.create(BondChangeEntity, {
                        chatId,
                        fromCharacterId: bond.fromCharacterId,
                        toCharacterId: bond.toCharacterId,
                        label: bond.label,
                        description: bond.description,
                        beforeLabel: bond.before?.label ?? null,
                        beforeDescription: bond.before?.description ?? null,
                        ...levelColumns(bond.levels),
                        event: bond.event,
                        messageId,
                    }),
                ),
            );
            await manager.save(
                changes.arcs.map((arc) =>
                    manager.create(ArcStepEntity, { chatId, messageId, ...arc }),
                ),
            );
            if (changes.scene) {
                await manager.save(manager.create(SceneAdvanceEntity, { chatId, messageId, ...changes.scene }));
                await manager.update(ChatEntity, { id: chatId }, { currentSceneId: changes.scene.toSceneId });
            }
            if (changes.time) {
                await manager.save(manager.create(TimeChangeEntity, { chatId, messageId, ...changes.time }));
                await manager.update(ChatEntity, { id: chatId }, { timeOfDay: changes.time.toTime });
            }
            if (changes.suddenEvent) {
                await manager.save(manager.create(SuddenEventStepEntity, { chatId, messageId, ...changes.suddenEvent }));
            }
            if (changes.ending) {
                await manager.save(manager.create(EndingReachedEntity, { chatId, messageId, ...changes.ending }));
            }
            if (changes.details && changes.details.length > 0) {
                await manager.save(changes.details.map((detail) => manager.create(DetailChangeEntity, { chatId, messageId, ...detail })));
            }
            if (changes.emotions) {
                // One statement: each tagged part gets its emotion, every other part of the Message none.
                await manager.query(
                    `UPDATE "message_part" p SET "emotion" = t."emotion"
                     FROM "message_part" q LEFT JOIN unnest($2::int[], $3::text[]) AS t("id", "emotion") ON t."id" = q."id"
                     WHERE p."id" = q."id" AND p."message_id" = $1`,
                    [messageId, changes.emotions.map((tag) => tag.partId), changes.emotions.map((tag) => tag.emotion)],
                );
            }
            await manager.update(
                MessageEntity,
                { id: messageId },
                { judgeStatus: BackgroundStatus.Done, judgeError: null },
            );
        });
    }

    /**
     * Applies what an extraction asked for to the Memories, records each change with the
     * fields before and after, and marks the Message's extraction done, all in one
     * transaction. The Memories are re-read here, not trusted from the call's input: the
     * user may have locked or deleted one while the extraction ran, and a locked Memory takes
     * nothing but Known-by additions (spec: "Backend rules"). Returns the ids of the Memories
     * added and of those whose text it changed, which are then embedded
     * (.scratch/memory-by-meaning/spec.md, "Embedding Memories").
     */
    recordMemories(
        chatId: number,
        messageId: number,
        changes: NewMemoryChange[],
        beliefChanges: NewBeliefChange[] = [],
    ): Promise<{ added: number[]; reworded: number[] }> {
        return this.dataSource.transaction(async (manager) => {
            const added: number[] = [];
            const reworded: number[] = [];
            const load = (memoryId: number) =>
                manager.findOne(MemoryEntity, { where: { id: memoryId, chatId }, relations: { knownBy: true } });
            const note = (memoryId: number, kind: MemoryChangeKind, before: MemorySnapshot | null, after: MemorySnapshot | null, event: string) =>
                manager.save(manager.create(MemoryChangeEntity, { chatId, memoryId, kind, before, after, event, messageId }));

            for (const change of changes) {
                if (change.kind === 'add') {
                    const memory = await createMemory(manager, {
                        chatId,
                        text: change.text,
                        knownBy: change.knownBy,
                        writtenBy: MemoryAuthor.Ai,
                        locked: false,
                        archived: false,
                        messageId,
                    });
                    await note(memory.id, MemoryChangeKind.Add, null, memory.snapshot(), change.event);
                    added.push(memory.id);
                    continue;
                }
                const memory = await load(change.memoryId);
                if (!memory || memory.archived) continue;
                const before = memory.snapshot();
                if (change.kind === 'known_by') {
                    const knownBy = [...new Set([...before.knownBy, ...change.add])];
                    if (knownBy.length === before.knownBy.length) continue;
                    await setKnownBy(manager, memory.id, knownBy);
                    await note(memory.id, MemoryChangeKind.KnownBy, before, { ...before, knownBy }, change.event);
                    continue;
                }
                if (memory.locked) continue;
                if (change.kind === 'update') {
                    // New text drops the old text's vector until it is embedded again.
                    await manager.update(MemoryEntity, { id: memory.id }, { text: change.text, embedding: null, embeddingModel: null });
                    await note(memory.id, MemoryChangeKind.Update, before, { ...before, text: change.text }, change.event);
                    if (!reworded.includes(memory.id)) reworded.push(memory.id);
                } else if (change.kind === 'archive') {
                    await manager.update(MemoryEntity, { id: memory.id }, { archived: true });
                    await note(memory.id, MemoryChangeKind.Archive, before, { ...before, archived: true }, change.event);
                } else {
                    await manager.delete(MemoryEntity, { id: memory.id });
                    await note(memory.id, MemoryChangeKind.Delete, before, null, change.event);
                }
            }
            await recordBeliefChanges(manager, chatId, messageId, beliefChanges);
            await manager.update(
                MessageEntity,
                { id: messageId },
                { memoryStatus: BackgroundStatus.Done, memoryError: null },
            );
            return { added, reworded };
        });
    }

    /**
     * Undoes every record caused by the Messages at `fromPosition` and after, newest first,
     * in one transaction. A SceneAdvance puts the Chat back on the Scene it left (the Scene
     * may be gone since: free play then). A MemoryChange puts the Memory's fields back as
     * they were: an added Memory goes, even if the user edited it since; a deleted one comes
     * back under its old id. Returns the counts by kind. Given a caller's `outer` manager it
     * runs inside that transaction (a Branch's copy); without one it opens its own.
     */
    rollbackFrom(chatId: number, fromPosition: number, outer?: EntityManager): Promise<RollbackCounts> {
        const work = async (manager: EntityManager): Promise<RollbackCounts> => {
            const messages = await manager.find(MessageEntity, {
                where: { chatId, position: MoreThanOrEqual(fromPosition) },
                select: { id: true, position: true },
            });
            const counts: RollbackCounts = { memoryChanges: 0, bondChanges: 0, arcSteps: 0, sceneAdvances: 0 };
            if (messages.length === 0) return counts;
            const ids = messages.map((message) => message.id);
            const positionOf = new Map(messages.map((message) => [message.id, message.position]));
            const newestFirst = <T extends { id: number; messageId: number | null }>(records: T[]): T[] =>
                [...records].sort(
                    (a, b) =>
                        (positionOf.get(b.messageId ?? -1) ?? -1) - (positionOf.get(a.messageId ?? -1) ?? -1) ||
                        b.id - a.id,
                );

            // Beliefs first: a Belief made or given up there goes back before the Memories do (not counted, as a Time change isn't).
            const beliefChanges = newestFirst(await manager.find(BeliefChangeEntity, { where: { messageId: In(ids) } }));
            for (const change of beliefChanges) {
                await undoBeliefChange(manager, chatId, change);
                await manager.delete(BeliefChangeEntity, { id: change.id });
            }
            const memoryChanges = newestFirst(await manager.find(MemoryChangeEntity, { where: { messageId: In(ids) } }));
            for (const change of memoryChanges) {
                await undoMemoryChange(manager, chatId, change);
                await manager.delete(MemoryChangeEntity, { id: change.id });
                counts.memoryChanges++;
            }
            const advances = newestFirst(await manager.find(SceneAdvanceEntity, { where: { messageId: In(ids) } }));
            for (const advance of advances) {
                await manager.update(ChatEntity, { id: chatId }, { currentSceneId: advance.fromSceneId });
                await manager.delete(SceneAdvanceEntity, { id: advance.id });
                counts.sceneAdvances++;
            }
            // Not counted: the rollback notice leaves the Time of day out (spec: "Story clock").
            const times = newestFirst(await manager.find(TimeChangeEntity, { where: { messageId: In(ids) } }));
            for (const time of times) {
                await manager.update(ChatEntity, { id: chatId }, { timeOfDay: time.fromTime });
                await manager.delete(TimeChangeEntity, { id: time.id });
            }
            // Not counted either: a Sudden event's steps hold their own state, so taking them away is the whole undo.
            await manager.delete(SuddenEventStepEntity, { messageId: In(ids) });
            // The same for the Place, the Weather and the Outfits: the record before each is current again.
            await manager.delete(DetailChangeEntity, { messageId: In(ids) });
            // An Ending reached there is no longer reached (.scratch/endings/spec.md). Not counted.
            await manager.delete(EndingReachedEntity, { messageId: In(ids) });
            // A Diary entry tells the story up to its Message: it goes with it (.scratch/diary/spec.md). Not counted.
            await manager.delete(DiaryEntryEntity, { messageId: In(ids) });
            const arcs = newestFirst(await manager.find(ArcStepEntity, { where: { messageId: In(ids) } }));
            for (const arc of arcs) {
                await manager.delete(ArcStepEntity, { id: arc.id });
                counts.arcSteps++;
            }
            const bonds = newestFirst(await manager.find(BondChangeEntity, { where: { messageId: In(ids) } }));
            for (const bond of bonds) {
                await manager.delete(BondChangeEntity, { id: bond.id });
                counts.bondChanges++;
            }
            return counts;
        };
        return outer ? work(outer) : this.dataSource.transaction(work);
    }

    /**
     * Spec: "Reset Chat". All Memory (user-written included), Bond history, Arc steps, Scene
     * advances, Time of day changes and copied Arc directions go, and the Chat has no time of day.
     */
    clear(chatId: number): Promise<void> {
        return this.dataSource.transaction(async (manager: EntityManager) => {
            await manager.delete(TimeChangeEntity, { chatId });
            // A fresh start: the Judge may suggest an Ending again (.scratch/endings/spec.md).
            await manager.update(ChatEntity, { id: chatId }, { timeOfDay: null, endingSuggestions: true });
            await manager.delete(SuddenEventStepEntity, { chatId });
            await manager.delete(DetailChangeEntity, { chatId });
            await manager.delete(DiaryEntryEntity, { chatId });
            await manager.delete(EndingReachedEntity, { chatId });
            await manager.delete(BeliefChangeEntity, { chatId });
            await manager.delete(BeliefEntity, { chatId });
            await manager.delete(MemoryChangeEntity, { chatId });
            await manager.delete(MemoryEntity, { chatId });
            await manager.delete(SceneAdvanceEntity, { chatId });
            await manager.delete(ArcStepEntity, { chatId });
            await manager.delete(BondChangeEntity, { chatId });
            await manager.delete(ChatArcDirectionEntity, { chatId });
        });
    }
}

/**
 * Writes what an extraction does to the Beliefs, each with its record. Re-read here: a Belief the
 * user deleted or a give-up already recorded is skipped, and a Memory gone since (a merge in
 * the same extraction) is no longer linked.
 */
async function recordBeliefChanges(manager: EntityManager, chatId: number, messageId: number, changes: NewBeliefChange[]): Promise<void> {
    const note = (beliefId: number, kind: BeliefChangeKind, before: BeliefSnapshot | null, after: BeliefSnapshot | null, event: string) =>
        manager.save(manager.create(BeliefChangeEntity, { chatId, beliefId, kind, before, after, event, messageId }));
    for (const change of changes) {
        if (change.kind === 'add') {
            const contradicts =
                change.contradictsMemoryId !== null && (await manager.exists(MemoryEntity, { where: { id: change.contradictsMemoryId, chatId } }))
                    ? change.contradictsMemoryId
                    : null;
            const belief = await manager.save(
                manager.create(BeliefEntity, {
                    chatId,
                    characterId: change.characterId,
                    text: change.text,
                    contradictsMemoryId: contradicts,
                    writtenBy: BeliefAuthor.Ai,
                    messageId,
                    givenUpMessageId: null,
                }),
            );
            await note(belief.id, BeliefChangeKind.Add, null, belief.snapshot(), change.event);
            continue;
        }
        const belief = await manager.findOne(BeliefEntity, { where: { id: change.beliefId, chatId } });
        if (!belief || belief.givenUpMessageId !== null) continue;
        const before = belief.snapshot();
        await manager.update(BeliefEntity, { id: belief.id }, { givenUpMessageId: messageId });
        await note(belief.id, BeliefChangeKind.GiveUp, before, { ...before, givenUpMessageId: messageId }, change.event);
    }
}

/**
 * Puts a Belief back as it was before one change. An add is undone by deleting the Belief, whatever
 * the user did to it since; a give-up by holding it again; an update by its old text; a delete by
 * re-inserting it under its old id, linked only to what this Chat still holds.
 */
async function undoBeliefChange(manager: EntityManager, chatId: number, change: BeliefChangeEntity): Promise<void> {
    if (change.kind === BeliefChangeKind.Add) {
        await manager.delete(BeliefEntity, { id: change.beliefId, chatId });
        return;
    }
    const before = change.before;
    if (!before) return;
    if (change.kind === BeliefChangeKind.Delete) {
        if (await manager.exists(BeliefEntity, { where: { id: change.beliefId } })) return;
        const memoryHeld = before.contradictsMemoryId !== null && (await manager.exists(MemoryEntity, { where: { id: before.contradictsMemoryId, chatId } }));
        const messageHeld = before.givenUpMessageId !== null && (await manager.exists(MessageEntity, { where: { id: before.givenUpMessageId, chatId } }));
        await manager.query(
            `INSERT INTO "belief" ("id", "chat_id", "character_id", "text", "contradicts_memory_id", "written_by", "message_id", "given_up_message_id")
             VALUES ($1, $2, $3, $4, $5, $6, NULL, $7)`,
            [change.beliefId, chatId, before.characterId, before.text, memoryHeld ? before.contradictsMemoryId : null, before.writtenBy, messageHeld ? before.givenUpMessageId : null],
        );
        return;
    }
    if (change.kind === BeliefChangeKind.GiveUp) {
        await manager.update(BeliefEntity, { id: change.beliefId, chatId }, { givenUpMessageId: null });
    } else {
        await manager.update(BeliefEntity, { id: change.beliefId, chatId }, { text: before.text });
    }
}

/** A Bond change's level columns: all four null while the Bond has no levels yet. */
function levelColumns(levels: BondLevels | null): Pick<BondChangeEntity, 'trust' | 'affection' | 'desire' | 'tension'> {
    return {
        trust: levels?.trust ?? null,
        affection: levels?.affection ?? null,
        desire: levels?.desire ?? null,
        tension: levels?.tension ?? null,
    };
}

/**
 * Puts a Memory back as it was before one change. An add is undone by deleting the Memory
 * whatever the user did to it since (spec: story 93). A delete is undone by re-inserting the
 * Memory under its old id. An update, archive or Known-by addition puts back only the fields
 * it touched, so a user edit since (which locks the Memory) keeps its text.
 */
async function undoMemoryChange(manager: EntityManager, chatId: number, change: MemoryChangeEntity): Promise<void> {
    if (change.kind === MemoryChangeKind.Add) {
        await manager.delete(MemoryEntity, { id: change.memoryId, chatId });
        return;
    }
    const before = change.before;
    if (!before) return;
    if (change.kind === MemoryChangeKind.Delete) {
        const exists = await manager.exists(MemoryEntity, { where: { id: change.memoryId } });
        if (exists) return;
        await createMemory(manager, {
            id: change.memoryId,
            chatId,
            text: before.text,
            knownBy: before.knownBy,
            writtenBy: before.writtenBy,
            locked: before.locked,
            archived: before.archived,
            messageId: await causingMessageOf(manager, chatId, change.memoryId),
        });
        return;
    }
    const memory = await manager.findOne(MemoryEntity, { where: { id: change.memoryId, chatId }, relations: { knownBy: true } });
    if (!memory) return;
    if (change.kind === MemoryChangeKind.Update) {
        // The text goes back, so the vector of the undone text goes; the next extraction embeds it again.
        if (!memory.locked) await manager.update(MemoryEntity, { id: memory.id }, { text: before.text, embedding: null, embeddingModel: null });
    } else if (change.kind === MemoryChangeKind.Archive) {
        await manager.update(MemoryEntity, { id: memory.id }, { archived: before.archived });
    } else {
        const added = (change.after?.knownBy ?? []).filter((id) => !before.knownBy.includes(id));
        if (added.length > 0) await manager.delete(MemoryKnownByEntity, { memoryId: memory.id, characterId: In(added) });
    }
}

/** The Message that added a Memory the AI wrote, from its add record; null for a user-written one. */
async function causingMessageOf(manager: EntityManager, chatId: number, memoryId: number): Promise<number | null> {
    const add = await manager.findOne(MemoryChangeEntity, { where: { chatId, memoryId, kind: MemoryChangeKind.Add } });
    return add?.messageId ?? null;
}

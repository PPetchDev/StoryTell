import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, MoreThanOrEqual, Repository } from 'typeorm';

import { ChatEntity, TimeOfDay } from '../chat/entities/chat.entity.js';
import { BackgroundStatus, MessageEntity } from '../chat/entities/message.entity.js';
import { MemoryKnownByEntity } from '../memory/entities/memory-known-by.entity.js';
import { MemoryAuthor, MemoryEntity, MemorySnapshot } from '../memory/entities/memory.entity.js';
import { createMemory, setKnownBy } from '../memory/memory.service.js';
import type { Emotion } from '../story/emotion.js';
import { BondLevels } from './bond-axes.js';
import { ArcStepEntity } from './entities/arc-step.entity.js';
import { BondChangeEntity } from './entities/bond-change.entity.js';
import { ChatArcDirectionEntity } from './entities/chat-arc-direction.entity.js';
import { MemoryChangeEntity, MemoryChangeKind } from './entities/memory-change.entity.js';
import { SceneAdvanceEntity } from './entities/scene-advance.entity.js';
import { TimeChangeEntity } from './entities/time-change.entity.js';

/** A StartingBond as it is seeded into a Chat: no event, no causing Message. */
export interface BondSeed {
    fromCharacterId: number;
    toCharacterId: number | null;
    label: string;
    description: string;
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
    fromSceneId: number;
    fromSceneName: string;
    toSceneId: number | null;
    toSceneName: string | null;
    event: string;
}

export interface NewTimeChange {
    fromTime: TimeOfDay | null;
    toTime: TimeOfDay;
}

/** The emotion the judge tagged one speech part of the judged Message with (.scratch/expressions/spec.md). */
export interface PartEmotion {
    partId: number;
    emotion: Emotion;
}

/** What one judgement changed, recorded together against the AI Message that caused it. */
export interface MessageChanges {
    bonds: NewBondChange[];
    arcs: NewArcStep[];
    scene: NewSceneAdvance | null;
    /** The Time of day moving on; null or left out when it stayed. */
    time?: NewTimeChange | null;
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

/** Everything the ledger holds for a Chat, oldest first. */
export interface LedgerState {
    bondChanges: BondChangeEntity[];
    arcSteps: ArcStepEntity[];
    sceneAdvances: SceneAdvanceEntity[];
    arcDirections: ChatArcDirectionEntity[];
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
    ) {}

    /** Seeds a Chat's first BondChanges from StartingBonds and copies the Arc directions in. */
    seed(chatId: number, bonds: BondSeed[], directions: ArcDirectionSeed[]): Promise<void> {
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
        const [bondChanges, arcSteps, sceneAdvances, arcDirections] = await Promise.all([
            this.bondChanges.find({ where: { chatId }, order: { id: 'ASC' } }),
            this.arcSteps.find({ where: { chatId }, order: { id: 'ASC' } }),
            this.sceneAdvances.find({ where: { chatId }, order: { id: 'ASC' } }),
            this.arcDirections.find({ where: { chatId }, order: { id: 'ASC' } }),
        ]);
        return { bondChanges, arcSteps, sceneAdvances, arcDirections };
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
     * added, for the "Memory added" toast.
     */
    recordMemories(chatId: number, messageId: number, changes: NewMemoryChange[]): Promise<number[]> {
        return this.dataSource.transaction(async (manager) => {
            const added: number[] = [];
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
                    await manager.update(MemoryEntity, { id: memory.id }, { text: change.text });
                    await note(memory.id, MemoryChangeKind.Update, before, { ...before, text: change.text }, change.event);
                } else if (change.kind === 'archive') {
                    await manager.update(MemoryEntity, { id: memory.id }, { archived: true });
                    await note(memory.id, MemoryChangeKind.Archive, before, { ...before, archived: true }, change.event);
                } else {
                    await manager.delete(MemoryEntity, { id: memory.id });
                    await note(memory.id, MemoryChangeKind.Delete, before, null, change.event);
                }
            }
            await manager.update(
                MessageEntity,
                { id: messageId },
                { memoryStatus: BackgroundStatus.Done, memoryError: null },
            );
            return added;
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
            await manager.update(ChatEntity, { id: chatId }, { timeOfDay: null });
            await manager.delete(MemoryChangeEntity, { chatId });
            await manager.delete(MemoryEntity, { chatId });
            await manager.delete(SceneAdvanceEntity, { chatId });
            await manager.delete(ArcStepEntity, { chatId });
            await manager.delete(BondChangeEntity, { chatId });
            await manager.delete(ChatArcDirectionEntity, { chatId });
        });
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
        if (!memory.locked) await manager.update(MemoryEntity, { id: memory.id }, { text: before.text });
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

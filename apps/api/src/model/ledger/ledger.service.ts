import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, MoreThanOrEqual, Repository } from 'typeorm';

import { ChatEntity } from '../chat/entities/chat.entity.js';
import { BackgroundStatus, MessageEntity } from '../chat/entities/message.entity.js';
import { ArcStepEntity } from './entities/arc-step.entity.js';
import { BondChangeEntity } from './entities/bond-change.entity.js';
import { ChatArcDirectionEntity } from './entities/chat-arc-direction.entity.js';
import { SceneAdvanceEntity } from './entities/scene-advance.entity.js';

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

/** What one judgement changed, recorded together against the AI Message that caused it. */
export interface MessageChanges {
    bonds: NewBondChange[];
    arcs: NewArcStep[];
    scene: NewSceneAdvance | null;
}

/** Everything the ledger holds for a Chat, oldest first. */
export interface LedgerState {
    bondChanges: BondChangeEntity[];
    arcSteps: ArcStepEntity[];
    sceneAdvances: SceneAdvanceEntity[];
    arcDirections: ChatArcDirectionEntity[];
}

/** Counts by kind for the rollback notice (spec: "3 Memories rolled back"). */
export interface RollbackCounts {
    bondChanges: number;
    arcSteps: number;
    sceneAdvances: number;
}

/**
 * The change ledger (spec: "Change ledger and rollback"): every AI-made change to Bonds,
 * Arcs and the Scene as a record against its causing AI Message, so a rewind can undo them.
 * Small interface: seed, record for a Message, roll back from a Message, clear. Rollback
 * undoes newest first and returns counts by kind. Ticket 28 adds MemoryChange records.
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

    async state(chatId: number): Promise<LedgerState> {
        const [bondChanges, arcSteps, sceneAdvances, arcDirections] = await Promise.all([
            this.bondChanges.find({ where: { chatId }, order: { id: 'ASC' } }),
            this.arcSteps.find({ where: { chatId }, order: { id: 'ASC' } }),
            this.sceneAdvances.find({ where: { chatId }, order: { id: 'ASC' } }),
            this.arcDirections.find({ where: { chatId }, order: { id: 'ASC' } }),
        ]);
        return { bondChanges, arcSteps, sceneAdvances, arcDirections };
    }

    /**
     * Records what a judgement changed against the AI Message that caused it, moves the Chat
     * to the advanced Scene, and marks the Message's judge done, all in one transaction.
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
            await manager.update(
                MessageEntity,
                { id: messageId },
                { judgeStatus: BackgroundStatus.Done, judgeError: null },
            );
        });
    }

    /**
     * Undoes every record caused by the Messages at `fromPosition` and after, newest first,
     * in one transaction. A SceneAdvance puts the Chat back on the Scene it left (the Scene
     * may be gone since: free play then). Returns the counts by kind.
     */
    rollbackFrom(chatId: number, fromPosition: number): Promise<RollbackCounts> {
        return this.dataSource.transaction(async (manager) => {
            const messages = await manager.find(MessageEntity, {
                where: { chatId, position: MoreThanOrEqual(fromPosition) },
                select: { id: true, position: true },
            });
            const counts: RollbackCounts = { bondChanges: 0, arcSteps: 0, sceneAdvances: 0 };
            if (messages.length === 0) return counts;
            const ids = messages.map((message) => message.id);
            const positionOf = new Map(messages.map((message) => [message.id, message.position]));
            const newestFirst = <T extends { id: number; messageId: number | null }>(records: T[]): T[] =>
                [...records].sort(
                    (a, b) =>
                        (positionOf.get(b.messageId ?? -1) ?? -1) - (positionOf.get(a.messageId ?? -1) ?? -1) ||
                        b.id - a.id,
                );

            const advances = newestFirst(await manager.find(SceneAdvanceEntity, { where: { messageId: In(ids) } }));
            for (const advance of advances) {
                await manager.update(ChatEntity, { id: chatId }, { currentSceneId: advance.fromSceneId });
                await manager.delete(SceneAdvanceEntity, { id: advance.id });
                counts.sceneAdvances++;
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
        });
    }

    /** Spec: "Reset Chat". Bond history, Arc steps, Scene advances and copied Arc directions go. */
    clear(chatId: number): Promise<void> {
        return this.dataSource.transaction(async (manager: EntityManager) => {
            await manager.delete(SceneAdvanceEntity, { chatId });
            await manager.delete(ArcStepEntity, { chatId });
            await manager.delete(BondChangeEntity, { chatId });
            await manager.delete(ChatArcDirectionEntity, { chatId });
        });
    }
}

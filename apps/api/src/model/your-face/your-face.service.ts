import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';

import { EXPRESSION_EMOTIONS, ExpressionEmotion } from '../story/emotion.js';
import type { PortraitCrop } from '../story/entities/character.entity.js';
import { FaceOwner, IdentityExpressionEntity } from './entities/identity-expression.entity.js';

/** The files of one identity Expression. */
export interface FaceFiles {
    imagePath: string;
    cutoutPath: string | null;
}

const ownerWhere = (owner: FaceOwner) => ('roleId' in owner ? { roleId: owner.roleId } : { personaId: owner.personaId });
const byEmotionOrder = (a: IdentityExpressionEntity, b: IdentityExpressionEntity) => EXPRESSION_EMOTIONS.indexOf(a.emotion) - EXPRESSION_EMOTIONS.indexOf(b.emotion);

/** The Role's and Personas' Expressions (.scratch/your-faces/spec.md), as rows. */
@Injectable()
export class YourFaceModelService {
    constructor(
        @InjectRepository(IdentityExpressionEntity) private readonly faces: Repository<IdentityExpressionEntity>,
        @InjectDataSource() private readonly dataSource: DataSource,
    ) {}

    /** The owner's Expressions, in the fixed order of the emotions. */
    async list(owner: FaceOwner): Promise<IdentityExpressionEntity[]> {
        return (await this.faces.findBy(ownerWhere(owner))).sort(byEmotionOrder);
    }

    /** The Expressions of several Personas at once, in the order of the emotions. */
    async listForPersonas(personaIds: readonly number[]): Promise<IdentityExpressionEntity[]> {
        if (personaIds.length === 0) return [];
        return (await this.faces.findBy({ personaId: In([...personaIds]) })).sort(byEmotionOrder);
    }

    /**
     * Inserts or replaces the emotion's Expression (with no cut-out); `crop: 'keep'` keeps the
     * replaced one's square. Answers the replaced one's files, or null.
     */
    async put(owner: FaceOwner, columns: { emotion: ExpressionEmotion; imagePath: string; crop: PortraitCrop | null | 'keep'; drawnFrom: string | null }): Promise<FaceFiles | null> {
        return this.dataSource.transaction(async (manager) => {
            const previous = await manager.findOne(IdentityExpressionEntity, { where: { ...ownerWhere(owner), emotion: columns.emotion }, lock: { mode: 'pessimistic_write' } });
            if (previous) await manager.delete(IdentityExpressionEntity, { id: previous.id });
            const crop = columns.crop === 'keep' ? (previous?.crop ?? null) : columns.crop;
            await manager.insert(IdentityExpressionEntity, {
                roleId: 'roleId' in owner ? owner.roleId : null,
                personaId: 'personaId' in owner ? owner.personaId : null,
                emotion: columns.emotion,
                imagePath: columns.imagePath,
                crop,
                drawnFrom: columns.drawnFrom,
                cutoutPath: null,
            });
            return previous ? { imagePath: previous.imagePath, cutoutPath: previous.cutoutPath } : null;
        });
    }

    /** Copies Expressions onto another owner (Duplicate Story), each with its files already written. */
    async insertMany(owner: FaceOwner, rows: ReadonlyArray<{ emotion: ExpressionEmotion; imagePath: string; crop: PortraitCrop | null; drawnFrom: string | null; cutoutPath: string | null }>): Promise<void> {
        if (rows.length === 0) return;
        await this.faces.insert(
            rows.map((row) => ({
                ...row,
                roleId: 'roleId' in owner ? owner.roleId : null,
                personaId: 'personaId' in owner ? owner.personaId : null,
            })),
        );
    }

    /** Sets or clears its own square; answers whether the Expression was there. */
    async setCrop(owner: FaceOwner, emotion: ExpressionEmotion, crop: PortraitCrop | null): Promise<boolean> {
        const result = await this.faces.update({ ...ownerWhere(owner), emotion }, { crop });
        return (result.affected ?? 0) > 0;
    }

    /** Deletes the row; answers its files, or null when there was none. */
    async remove(owner: FaceOwner, emotion: ExpressionEmotion): Promise<FaceFiles | null> {
        const face = await this.faces.findOneBy({ ...ownerWhere(owner), emotion });
        if (!face) return null;
        await this.faces.delete({ id: face.id });
        return { imagePath: face.imagePath, cutoutPath: face.cutoutPath };
    }

    /**
     * Sets the cut-out of the Expression showing `imagePath`. Answers the cut-out it replaced (or
     * null), or false when that picture is no longer the Expression.
     */
    async setCutout(owner: FaceOwner, emotion: ExpressionEmotion, imagePath: string, cutoutPath: string): Promise<string | null | false> {
        return this.dataSource.transaction(async (manager) => {
            const face = await manager.findOne(IdentityExpressionEntity, { where: { ...ownerWhere(owner), emotion, imagePath }, lock: { mode: 'pessimistic_write' } });
            if (!face) return false;
            await manager.update(IdentityExpressionEntity, { id: face.id }, { cutoutPath });
            return face.cutoutPath;
        });
    }
}

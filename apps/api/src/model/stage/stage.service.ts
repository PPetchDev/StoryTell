import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { OutfitSpriteEntity, PlacePictureEntity, StageLight } from './stage.entities.js';

/** A failed drawing is tried again after this long (.scratch/dressed-stage/spec.md). */
export const STAGE_RETRY_AFTER_MS = 30 * 60_000;

/** The call kinds a dressed stage spends on, counted against its daily cap. */
export const STAGE_CALL_KINDS = ['place_picture', 'outfit_sprite', 'image_cutout'] as const;

/** Place pictures and outfit sprites (.scratch/dressed-stage/spec.md). */
@Injectable()
export class StageModelService {
    constructor(
        @InjectRepository(PlacePictureEntity) private readonly places: Repository<PlacePictureEntity>,
        @InjectRepository(OutfitSpriteEntity) private readonly sprites: Repository<OutfitSpriteEntity>,
        @InjectDataSource() private readonly dataSource: DataSource,
    ) {}

    /**
     * Takes the drawing of a place in a light: a new row marked drawing, or a failed one old enough
     * to try again. Null when it is drawn, being drawn, or failed lately.
     */
    async claimPlace(storyId: number, placeKey: string, light: StageLight, now = new Date()): Promise<number | null> {
        const inserted = await this.dataSource.query(
            `INSERT INTO "place_picture" ("story_id", "place_key", "light", "status") VALUES ($1, $2, $3, 'drawing')
             ON CONFLICT ("story_id", "place_key", "light") DO UPDATE SET "status" = 'drawing', "created_at" = now()
             WHERE "place_picture"."status" = 'failed' AND "place_picture"."created_at" < $4
             RETURNING "id"`,
            [storyId, placeKey, light, new Date(now.getTime() - STAGE_RETRY_AFTER_MS)],
        );
        return (inserted as { id: number }[])[0]?.id ?? null;
    }

    /** The place's drawn pictures, in any light. */
    readyPlaces(storyId: number, placeKey: string): Promise<PlacePictureEntity[]> {
        return this.places.find({ where: { storyId, placeKey, status: 'ready' }, order: { id: 'ASC' } });
    }

    async readyPlace(storyId: number, placeKey: string, light: StageLight): Promise<string | null> {
        return (await this.places.findOneBy({ storyId, placeKey, light, status: 'ready' }))?.imagePath ?? null;
    }

    async finishPlace(id: number, imagePath: string): Promise<void> {
        await this.places.update({ id }, { status: 'ready', imagePath });
    }

    async failPlace(id: number): Promise<void> {
        await this.places.update({ id }, { status: 'failed', createdAt: new Date() });
    }

    /** As `claimPlace`, for one Character's outfit and emotion in a Chat. */
    async claimSprite(chatId: number, characterId: number, outfitKey: string, emotion: string, now = new Date()): Promise<number | null> {
        const inserted = await this.dataSource.query(
            `INSERT INTO "outfit_sprite" ("chat_id", "character_id", "outfit_key", "emotion", "status") VALUES ($1, $2, $3, $4, 'drawing')
             ON CONFLICT ("chat_id", "character_id", "outfit_key", "emotion") DO UPDATE SET "status" = 'drawing', "created_at" = now()
             WHERE "outfit_sprite"."status" = 'failed' AND "outfit_sprite"."created_at" < $5
             RETURNING "id"`,
            [chatId, characterId, outfitKey, emotion, new Date(now.getTime() - STAGE_RETRY_AFTER_MS)],
        );
        return (inserted as { id: number }[])[0]?.id ?? null;
    }

    /** The drawn sprites of one Character's outfit in a Chat. */
    readySprites(chatId: number, characterId: number, outfitKey: string): Promise<OutfitSpriteEntity[]> {
        return this.sprites.find({ where: { chatId, characterId, outfitKey, status: 'ready' }, order: { id: 'ASC' } });
    }

    async finishSprite(id: number, files: { sourcePath: string; imagePath: string; cutOut: boolean }): Promise<void> {
        await this.sprites.update({ id }, { status: 'ready', ...files });
    }

    async failSprite(id: number): Promise<void> {
        await this.sprites.update({ id }, { status: 'failed', createdAt: new Date() });
    }

    /** How many of the Chat's sprites, and its Story's places, are being drawn now. */
    async drawingFor(storyId: number, chatId: number): Promise<number> {
        const [places, sprites] = await Promise.all([
            this.places.countBy({ storyId, status: 'drawing' }),
            this.sprites.countBy({ chatId, status: 'drawing' }),
        ]);
        return places + sprites;
    }

    /** After a restart nothing is drawing: those rows failed, and are tried again later. */
    async failInterrupted(): Promise<void> {
        await this.places.update({ status: 'drawing' }, { status: 'failed', createdAt: new Date() });
        await this.sprites.update({ status: 'drawing' }, { status: 'failed', createdAt: new Date() });
    }

    /** What the Chat's dressed stage spent in the last day, in USD. */
    async spentToday(chatId: number, now = new Date()): Promise<number> {
        const rows: { usd: string | null }[] = await this.dataSource.query(
            `SELECT sum("cost_usd") AS "usd" FROM "usage_record" WHERE "chat_id" = $1 AND "kind" = ANY($2) AND "created_at" > $3`,
            [chatId, [...STAGE_CALL_KINDS], new Date(now.getTime() - 24 * 60 * 60_000)],
        );
        return Number(rows[0]?.usd ?? 0);
    }

    /** The files of a Chat's sprites, for deleting with it. */
    async chatFiles(chatId: number): Promise<string[]> {
        const rows = await this.sprites.findBy({ chatId });
        return rows.flatMap((row) => [row.sourcePath, row.imagePath].filter((file): file is string => file !== null));
    }

    /** The files of a Story's places and its Chats' sprites, for deleting with it. */
    async storyFiles(storyId: number): Promise<string[]> {
        const places = await this.places.findBy({ storyId });
        const sprites: { source_path: string | null; image_path: string | null }[] = await this.dataSource.query(
            `SELECT s."source_path", s."image_path" FROM "outfit_sprite" s JOIN "chat" c ON c."id" = s."chat_id" WHERE c."story_id" = $1`,
            [storyId],
        );
        return [
            ...places.map((row) => row.imagePath),
            ...sprites.flatMap((row) => [row.source_path, row.image_path]),
        ].filter((file): file is string => file !== null);
    }
}

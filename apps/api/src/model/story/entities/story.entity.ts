import {
    Column,
    CreateDateColumn,
    Entity,
    JoinColumn,
    ManyToOne,
    OneToMany,
    OneToOne,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';

import type { SnapshotEntity } from '../../snapshot/entities/snapshot.entity.js';
import type { CharacterEntity, CharacterResponse } from './character.entity.js';
import type { LoreEntryEntity, LoreEntryResponse } from './lore-entry.entity.js';
import type { RoleEntity, RoleResponse } from './role.entity.js';
import type { SceneEntity, SceneResponse } from './scene.entity.js';
import type { StartingBondEntity, StartingBondResponse } from './starting-bond.entity.js';

export enum Pov {
    First = 'first',
    Second = 'second',
    Third = 'third',
}

export enum Tense {
    Past = 'past',
    Present = 'present',
}

export enum ReplyLength {
    Short = 'short',
    Medium = 'medium',
    Long = 'long',
}

/** The point of a Cover kept in view when it is cropped, in fractions of the picture's width and height. */
export interface CoverFocus {
    x: number;
    y: number;
}

/** Where a Cover's picture comes from. Only an upload's file belongs to the Cover. */
export enum CoverSource {
    Snapshot = 'snapshot',
    ReferenceImage = 'reference_image',
    Upload = 'upload',
}

/** The picture the author chose for the Story. */
export interface StoryCover {
    source: CoverSource;
    /** Relative to the image folder; served by `GET /api/images/{path}`. */
    imagePath: string;
    /** Null while none is chosen: the picture is centred. */
    focus: CoverFocus | null;
    /** The Snapshot it shows, when `source` is `snapshot`. */
    snapshotId: number | null;
    /** The Character whose Reference image it shows, when `source` is `reference_image`. */
    characterId: number | null;
}

export interface StorySummary {
    id: number;
    title: string;
    createdAt: string;
    updatedAt: string;
}

/** The whole Story as the editor reads it, without the derived playable status. */
export interface StoryResponse extends StorySummary {
    setting: string;
    opening: string;
    style: { pov: Pov; tense: Tense; replyLength: ReplyLength; imageStyle: string };
    role: RoleResponse;
    characters: CharacterResponse[];
    startingBonds: StartingBondResponse[];
    scenes: SceneResponse[];
    /** In add order. */
    lore: LoreEntryResponse[];
    /** Null while the author has chosen none. */
    cover: StoryCover | null;
}

@Entity('story')
export class StoryEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'text' })
    title: string;

    @Column({ type: 'text', default: '' })
    setting: string;

    @Column({ type: 'text', default: '' })
    opening: string;

    @Column({ type: 'enum', enum: Pov, enumName: 'story_pov_enum', default: Pov.Second })
    pov: Pov;

    @Column({ type: 'enum', enum: Tense, enumName: 'story_tense_enum', default: Tense.Past })
    tense: Tense;

    @Column({
        name: 'reply_length',
        type: 'enum',
        enum: ReplyLength,
        enumName: 'story_reply_length_enum',
        default: ReplyLength.Medium,
    })
    replyLength: ReplyLength;

    @Column({ name: 'image_style', type: 'text', default: '' })
    imageStyle: string;

    // The Cover is at most one of the next three (CHECK chk_story_one_cover); see cover().
    // Written only by StoryModelService.setCover(); saveStory() writes the authored fields alone,
    // so an editor save holding an older copy of the Story never puts back an older Cover.
    @Column({ name: 'cover_snapshot_id', type: 'integer', nullable: true })
    coverSnapshotId: number | null;

    /** ON DELETE SET NULL to `character`; read against the loaded `characters`. */
    @Column({ name: 'cover_character_id', type: 'integer', nullable: true })
    coverCharacterId: number | null;

    /** An uploaded Cover's own file, relative to the image folder. */
    @Column({ name: 'cover_image_path', type: 'text', nullable: true })
    coverImagePath: string | null;

    @Column({ name: 'cover_focus', type: 'jsonb', nullable: true })
    coverFocus: CoverFocus | null;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
    updatedAt: Date;

    // Loaded only through StoryModelService.findFull(); never auto-loaded.
    @OneToOne('RoleEntity', 'story')
    role: Relation<RoleEntity>;

    @OneToMany('CharacterEntity', 'story')
    characters: Relation<CharacterEntity[]>;

    @OneToMany('StartingBondEntity', 'story')
    startingBonds: Relation<StartingBondEntity[]>;

    @OneToMany('SceneEntity', 'story')
    scenes: Relation<SceneEntity[]>;

    @OneToMany('LoreEntryEntity', 'story')
    lore: Relation<LoreEntryEntity[]>;

    /** ON DELETE SET NULL: a deleted Snapshot leaves the Story without a Cover. */
    @ManyToOne('SnapshotEntity', { onDelete: 'SET NULL', nullable: true })
    @JoinColumn({ name: 'cover_snapshot_id' })
    coverSnapshot: Relation<SnapshotEntity> | null;

    toSummary(): StorySummary {
        return {
            id: this.id,
            title: this.title,
            createdAt: this.createdAt.toISOString(),
            updatedAt: this.updatedAt.toISOString(),
        };
    }

    /** Needs the relations loaded (StoryModelService.findFull). */
    toResponse(): StoryResponse {
        return {
            ...this.toSummary(),
            setting: this.setting,
            opening: this.opening,
            style: {
                pov: this.pov,
                tense: this.tense,
                replyLength: this.replyLength,
                imageStyle: this.imageStyle,
            },
            role: this.role.toResponse(),
            characters: this.characters.map((character) => character.toResponse()),
            startingBonds: this.startingBonds.map((bond) => bond.toResponse()),
            scenes: this.scenes.map((scene) => scene.toResponse()),
            lore: this.lore.map((entry) => entry.toResponse()),
            cover: this.cover(),
        };
    }

    /**
     * The Cover as it stands, or null when none is chosen. A Character's Cover follows their
     * Reference image, so it shows their newest one. Needs `characters` and `coverSnapshot`
     * loaded (StoryModelService.findFull).
     */
    cover(): StoryCover | null {
        const focus = this.coverFocus ? { x: this.coverFocus.x, y: this.coverFocus.y } : null;
        const base = { focus, snapshotId: null, characterId: null };
        if (this.coverSnapshot) {
            return { ...base, source: CoverSource.Snapshot, imagePath: this.coverSnapshot.imagePath, snapshotId: this.coverSnapshot.id };
        }
        const character = this.characters.find((candidate) => candidate.id === this.coverCharacterId);
        if (character?.referenceImagePath) {
            return {
                ...base,
                source: CoverSource.ReferenceImage,
                imagePath: character.referenceImagePath,
                characterId: character.id,
            };
        }
        if (this.coverImagePath) return { ...base, source: CoverSource.Upload, imagePath: this.coverImagePath };
        return null;
    }
}

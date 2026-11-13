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

import type { DocumentEntity, DocumentSummary } from '../../document/entities/document.entity.js';
import type { ReplaceRuleEntity, ReplaceRuleResponse } from '../../replace-rule/entities/replace-rule.entity.js';
import type { SavedReplyEntity, SavedReplyResponse } from '../../saved-reply/entities/saved-reply.entity.js';
import type { SnapshotEntity } from '../../snapshot/entities/snapshot.entity.js';
import type { CharacterEntity, CharacterResponse } from './character.entity.js';
import type { LoreEntryEntity, LoreEntryResponse } from './lore-entry.entity.js';
import type { RoleEntity, RoleResponse } from './role.entity.js';
import type { SceneEntity, SceneResponse } from './scene.entity.js';
import type { StartingBeliefEntity, StartingBeliefResponse } from './starting-belief.entity.js';
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

/** What sits behind a Story's Chats (.scratch/chat-looks/spec.md, "Backdrop"). */
export enum Backdrop {
    None = 'none',
    Cover = 'cover',
    Snapshot = 'snapshot',
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
    /** What Characters believe when a Chat starts (.scratch/memory-by-meaning/spec.md), in the author's order. */
    startingBeliefs: StartingBeliefResponse[];
    scenes: SceneResponse[];
    /** In add order. */
    lore: LoreEntryResponse[];
    /** In add order, without text or vectors (.scratch/documents/spec.md). */
    documents: DocumentSummary[];
    /** The Story's own Saved replies, in add order (.scratch/saved-replies-and-replace-rules/spec.md). */
    savedReplies: SavedReplyResponse[];
    /** The Story's own Replace rules, in apply order (after the app-wide ones). */
    replaceRules: ReplaceRuleResponse[];
    /** Null while the author has chosen none. */
    cover: StoryCover | null;
    /** The Kokoro voice narration is read aloud in; null for the default (.scratch/read-aloud/spec.md). */
    narrationVoice: string | null;
    /** What sits behind its Chats' Messages (.scratch/chat-looks/spec.md, "Backdrop"). */
    backdrop: Backdrop;
}

@Entity('story')
export class StoryEntity {
    @PrimaryGeneratedColumn()
    id: number;

    /** The Account it belongs to (.scratch/accounts/spec.md: "Ownership"). */
    @Column({ name: 'user_id', type: 'integer' })
    userId: number;

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

    /** A Kokoro voice id; null means DEFAULT_NARRATION_VOICE. */
    @Column({ name: 'narration_voice', type: 'text', nullable: true })
    narrationVoice: string | null;

    @Column({ type: 'enum', enum: Backdrop, enumName: 'story_backdrop_enum', default: Backdrop.None })
    backdrop: Backdrop;

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

    @OneToMany('StartingBeliefEntity', 'story')
    startingBeliefs: Relation<StartingBeliefEntity[]>;

    @OneToMany('SceneEntity', 'story')
    scenes: Relation<SceneEntity[]>;

    @OneToMany('LoreEntryEntity', 'story')
    lore: Relation<LoreEntryEntity[]>;

    /** Loaded without text; passages are never loaded with the Story. */
    @OneToMany('DocumentEntity', 'story')
    documents: Relation<DocumentEntity[]>;

    /** The Story's own Saved replies; app-wide ones have no Story. */
    @OneToMany('SavedReplyEntity', 'story')
    savedReplies: Relation<SavedReplyEntity[]>;

    /** The Story's own Replace rules; app-wide ones have no Story. */
    @OneToMany('ReplaceRuleEntity', 'story')
    replaceRules: Relation<ReplaceRuleEntity[]>;

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
            startingBeliefs: (this.startingBeliefs ?? []).map((belief) => belief.toResponse()),
            scenes: this.scenes.map((scene) => scene.toResponse()),
            lore: this.lore.map((entry) => entry.toResponse()),
            documents: this.documents.map((document) => document.toSummary()),
            savedReplies: this.savedReplies.map((line) => line.toResponse()),
            replaceRules: this.replaceRules.map((rule) => rule.toResponse()),
            cover: this.cover(),
            narrationVoice: this.narrationVoice,
            backdrop: this.backdrop,
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

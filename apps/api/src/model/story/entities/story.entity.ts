import {
    Column,
    CreateDateColumn,
    Entity,
    OneToMany,
    OneToOne,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';

import type { CharacterEntity, CharacterResponse } from './character.entity.js';
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
        };
    }
}

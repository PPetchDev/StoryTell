import {
    Column,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    OneToMany,
    PrimaryGeneratedColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';

import { EXPRESSION_EMOTIONS } from '../emotion.js';
import type { CharacterExpressionEntity, ExpressionResponse } from './character-expression.entity.js';
import type { StoryEntity } from './story.entity.js';

/** A square of the Reference image, in fractions of the image's width: left edge, top edge, side. */
export interface PortraitCrop {
    x: number;
    y: number;
    size: number;
}

export interface CharacterResponse {
    id: number;
    name: string;
    appearance: string;
    personality: string;
    voice: string;
    exampleLines: string[];
    background: string;
    secrets: string;
    arcDirections: string;
    /** Path of the Reference image relative to the image folder; null while there is none. */
    referenceImagePath: string | null;
    /** The square of the Reference image shown beside their lines in a Chat; null while none is chosen. */
    portraitCrop: PortraitCrop | null;
    /** The Kokoro voice their lines are read aloud in; null reads them in the Narration voice. Apart from `voice`, how they talk on the page. */
    speakingVoice: string | null;
    /** Their pictures per emotion, in the fixed order of the emotions (.scratch/expressions/spec.md). */
    expressions: ExpressionResponse[];
}

/** An AI-played figure in one Story's cast. Ordered by `position` within the Story. */
@Entity('character')
export class CharacterEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Index()
    @Column({ name: 'story_id', type: 'integer' })
    storyId: number;

    @ManyToOne('StoryEntity', 'characters', { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'story_id' })
    story: Relation<StoryEntity>;

    @Column({ type: 'integer' })
    position: number;

    @Column({ type: 'text', default: '' })
    name: string;

    @Column({ type: 'text', default: '' })
    appearance: string;

    @Column({ type: 'text', default: '' })
    personality: string;

    @Column({ type: 'text', default: '' })
    voice: string;

    @Column({ name: 'example_lines', type: 'jsonb', default: () => "'[]'" })
    exampleLines: string[];

    @Column({ type: 'text', default: '' })
    background: string;

    @Column({ type: 'text', default: '' })
    secrets: string;

    @Column({ name: 'arc_directions', type: 'text', default: '' })
    arcDirections: string;

    // Shown on the Character page and, as the Portrait, beside their lines in a Chat. The file is
    // written and deleted by the Reference image module and by Story and Character deletion.
    @Column({ name: 'reference_image_path', type: 'text', nullable: true })
    referenceImagePath: string | null;

    // Cleared whenever the Reference image changes, since it frames that image.
    @Column({ name: 'portrait_crop', type: 'jsonb', nullable: true })
    portraitCrop: PortraitCrop | null;

    /** A Kokoro voice id; null means "read in the Narration voice". */
    @Column({ name: 'speaking_voice', type: 'text', nullable: true })
    speakingVoice: string | null;

    // Loaded only through StoryModelService.findFull(). A save of the Character never touches them
    // (orphanedRowAction 'disable' on the other side), so an autosave holding an older read is safe.
    @OneToMany('CharacterExpressionEntity', 'character')
    expressions: Relation<CharacterExpressionEntity[]>;

    toResponse(): CharacterResponse {
        return {
            id: this.id,
            name: this.name,
            appearance: this.appearance,
            personality: this.personality,
            voice: this.voice,
            exampleLines: [...this.exampleLines],
            background: this.background,
            secrets: this.secrets,
            arcDirections: this.arcDirections,
            referenceImagePath: this.referenceImagePath,
            portraitCrop: this.portraitCrop ? { ...this.portraitCrop } : null,
            speakingVoice: this.speakingVoice,
            expressions: [...(this.expressions ?? [])]
                .sort((a, b) => EXPRESSION_EMOTIONS.indexOf(a.emotion) - EXPRESSION_EMOTIONS.indexOf(b.emotion))
                .map((expression) => expression.toResponse(this.referenceImagePath)),
        };
    }
}

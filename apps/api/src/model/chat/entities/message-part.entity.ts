import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import type { Relation } from 'typeorm';

import type { Emotion } from '../../story/emotion.js';
import type { CharacterEntity } from '../../story/entities/character.entity.js';
import type { MessageEntity } from './message.entity.js';

export enum MessagePartKind {
    Narration = 'narration',
    Speech = 'speech',
}

export type MessagePartResponse =
    | { kind: 'narration'; text: string }
    | {
          kind: 'speech';
          characterId: number | null;
          speakerName: string;
          text: string;
          /** What the Judge tagged the line with; null until then (.scratch/expressions/spec.md). */
          emotion: Emotion | null;
      };

/**
 * A part as a Reply version keeps it: as the Message answered it when it was put away. A version
 * stored before Expressions has no `emotion` on its speech.
 */
export type StoredMessagePart =
    | { kind: 'narration'; text: string }
    | { kind: 'speech'; characterId: number | null; speakerName: string; text: string; emotion?: Emotion | null };

/**
 * A part not yet judged, as the API answers it: a reply still being written, or the Opening
 * preview. Its speech carries `emotion: null`, as a stored part's does until the Judge tags it.
 */
export function untaggedPartResponse(
    part: { kind: 'narration'; text: string } | { kind: 'speech'; characterId: number | null; speakerName: string; text: string },
): MessagePartResponse {
    if (part.kind === 'narration') return { kind: 'narration', text: part.text };
    return { kind: 'speech', characterId: part.characterId, speakerName: part.speakerName, text: part.text, emotion: null };
}

/**
 * One part of an AI Message, in order: narration, or one speaker's speech. A speech part
 * keeps the stamped speaker name even when its Character link is gone.
 */
@Entity('message_part')
export class MessagePartEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Index()
    @Column({ name: 'message_id', type: 'integer' })
    messageId: number;

    @ManyToOne('MessageEntity', 'parts', { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'message_id' })
    message: Relation<MessageEntity>;

    @Column({ type: 'integer' })
    position: number;

    @Column({ type: 'enum', enum: MessagePartKind, enumName: 'message_part_kind_enum' })
    kind: MessagePartKind;

    @Column({ name: 'character_id', type: 'integer', nullable: true })
    characterId: number | null;

    @ManyToOne('CharacterEntity', { onDelete: 'SET NULL', nullable: true })
    @JoinColumn({ name: 'character_id' })
    character: Relation<CharacterEntity> | null;

    @Column({ name: 'speaker_name', type: 'text', nullable: true })
    speakerName: string | null;

    @Column({ type: 'text' })
    text: string;

    /** What the Judge tagged a speech line with (.scratch/expressions/spec.md); null until then, and always for narration. */
    @Column({ type: 'text', nullable: true })
    emotion: Emotion | null;

    toResponse(): MessagePartResponse {
        if (this.kind === MessagePartKind.Narration) return { kind: 'narration', text: this.text };
        return {
            kind: 'speech',
            characterId: this.characterId,
            speakerName: this.speakerName ?? '',
            text: this.text,
            emotion: this.emotion ?? null,
        };
    }
}

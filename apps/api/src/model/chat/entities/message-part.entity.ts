import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import type { Relation } from 'typeorm';

import type { CharacterEntity } from '../../story/entities/character.entity.js';
import type { MessageEntity } from './message.entity.js';

export enum MessagePartKind {
    Narration = 'narration',
    Speech = 'speech',
}

export type MessagePartResponse =
    | { kind: 'narration'; text: string }
    | { kind: 'speech'; characterId: number | null; speakerName: string; text: string };

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

    toResponse(): MessagePartResponse {
        if (this.kind === MessagePartKind.Narration) return { kind: 'narration', text: this.text };
        return {
            kind: 'speech',
            characterId: this.characterId,
            speakerName: this.speakerName ?? '',
            text: this.text,
        };
    }
}

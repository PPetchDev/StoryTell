import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';

import type { ChatEntity } from '../../chat/entities/chat.entity.js';
import type { MessageEntity } from '../../chat/entities/message.entity.js';
import type { CharacterEntity } from '../../story/entities/character.entity.js';

export interface BondChangeResponse {
    id: number;
    fromCharacterId: number;
    /** null means toward the user. */
    toCharacterId: number | null;
    label: string;
    description: string;
    /** null when the pair were strangers before. */
    before: { label: string; description: string } | null;
    /** The story event that caused it; null for a StartingBond seed. */
    event: string | null;
    /** The causing AI Message; null for a StartingBond seed. */
    messageId: number | null;
    createdAt: string;
}

/**
 * One change of a Bond (spec: "Change ledger and rollback"). A Bond's current value is its
 * latest BondChange; a StartingBond seed has no event and no causing Message. Directional:
 * from a Character toward the user (`toCharacterId` null) or toward another Character.
 */
@Entity('bond_change')
export class BondChangeEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Index()
    @Column({ name: 'chat_id', type: 'integer' })
    chatId: number;

    @ManyToOne('ChatEntity', { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'chat_id' })
    chat: Relation<ChatEntity>;

    @Column({ name: 'from_character_id', type: 'integer' })
    fromCharacterId: number;

    @ManyToOne('CharacterEntity', { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'from_character_id' })
    fromCharacter: Relation<CharacterEntity>;

    @Column({ name: 'to_character_id', type: 'integer', nullable: true })
    toCharacterId: number | null;

    @ManyToOne('CharacterEntity', { onDelete: 'CASCADE', nullable: true })
    @JoinColumn({ name: 'to_character_id' })
    toCharacter: Relation<CharacterEntity> | null;

    @Column({ type: 'text' })
    label: string;

    @Column({ type: 'text' })
    description: string;

    @Column({ name: 'before_label', type: 'text', nullable: true })
    beforeLabel: string | null;

    @Column({ name: 'before_description', type: 'text', nullable: true })
    beforeDescription: string | null;

    @Column({ type: 'text', nullable: true })
    event: string | null;

    @Index()
    @Column({ name: 'message_id', type: 'integer', nullable: true })
    messageId: number | null;

    @ManyToOne('MessageEntity', { onDelete: 'CASCADE', nullable: true })
    @JoinColumn({ name: 'message_id' })
    message: Relation<MessageEntity> | null;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;

    toResponse(): BondChangeResponse {
        return {
            id: this.id,
            fromCharacterId: this.fromCharacterId,
            toCharacterId: this.toCharacterId,
            label: this.label,
            description: this.description,
            before:
                this.beforeLabel === null
                    ? null
                    : { label: this.beforeLabel, description: this.beforeDescription ?? '' },
            event: this.event,
            messageId: this.messageId,
            createdAt: this.createdAt.toISOString(),
        };
    }
}

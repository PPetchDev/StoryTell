import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import type { Relation } from 'typeorm';

import type { ChatEntity } from '../../chat/entities/chat.entity.js';
import type { MessageEntity } from '../../chat/entities/message.entity.js';
import type { CharacterSecretEntity } from '../../story/entities/character-secret.entity.js';

/**
 * A Chat's reply revealing one of a Character's Secrets to the user (.scratch/secret-reveals/spec.md),
 * recorded against that AI Message, so a rewind of the Message un-reveals it. Once per Secret per Chat.
 */
@Entity('secret_reveal')
export class SecretRevealEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Index()
    @Column({ name: 'chat_id', type: 'integer' })
    chatId: number;

    @ManyToOne('ChatEntity', { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'chat_id' })
    chat: Relation<ChatEntity>;

    @Index()
    @Column({ name: 'secret_id', type: 'integer' })
    secretId: number;

    @ManyToOne('CharacterSecretEntity', { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'secret_id' })
    secret: Relation<CharacterSecretEntity>;

    @Index()
    @Column({ name: 'message_id', type: 'integer' })
    messageId: number;

    @ManyToOne('MessageEntity', { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'message_id' })
    message: Relation<MessageEntity>;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;
}

import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    OneToMany,
    PrimaryGeneratedColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';

import type { ChatEntity } from './chat.entity.js';
import type { MessagePartEntity, MessagePartResponse } from './message-part.entity.js';

export enum MessageKind {
    User = 'user',
    Ai = 'ai',
}

/** The model recorded on the Opening, which no model wrote. */
export const AUTHOR_MODEL = 'author';

export interface UserMessageResponse {
    id: number;
    kind: 'user';
    text: string;
    /** The identity the user wore when writing it, stamped. */
    identityName: string;
    createdAt: string;
}

export interface AiMessageResponse {
    id: number;
    kind: 'ai';
    /** The model that wrote it, or "author" for the Opening. */
    model: string;
    parts: MessagePartResponse[];
    createdAt: string;
}

export type MessageResponse = UserMessageResponse | AiMessageResponse;

/**
 * One entry in a Chat's history (spec: "Message"): what the user wrote, or the AI's reply
 * as ordered parts. An AI Message exists only once its turn completed. The status of the
 * two background calls is added by tickets 27 and 28.
 */
@Entity('message')
export class MessageEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Index()
    @Column({ name: 'chat_id', type: 'integer' })
    chatId: number;

    @ManyToOne('ChatEntity', 'messages', { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'chat_id' })
    chat: Relation<ChatEntity>;

    @Column({ type: 'integer' })
    position: number;

    @Column({ type: 'enum', enum: MessageKind, enumName: 'message_kind_enum' })
    kind: MessageKind;

    @Column({ type: 'text', nullable: true })
    text: string | null;

    @Column({ name: 'identity_name', type: 'text', nullable: true })
    identityName: string | null;

    @Column({ type: 'text', nullable: true })
    model: string | null;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;

    @OneToMany('MessagePartEntity', 'message')
    parts: Relation<MessagePartEntity[]>;

    /** An AI Message needs its parts loaded (ChatModelService.findWithMessages). */
    toResponse(): MessageResponse {
        if (this.kind === MessageKind.User) {
            return {
                id: this.id,
                kind: 'user',
                text: this.text ?? '',
                identityName: this.identityName ?? '',
                createdAt: this.createdAt.toISOString(),
            };
        }
        return {
            id: this.id,
            kind: 'ai',
            model: this.model ?? AUTHOR_MODEL,
            parts: this.parts.map((part) => part.toResponse()),
            createdAt: this.createdAt.toISOString(),
        };
    }
}

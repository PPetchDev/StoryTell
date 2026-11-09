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

import type { PersonaEntity } from '../../persona/entities/persona.entity.js';
import type { ChatEntity } from './chat.entity.js';
import type { MessagePartEntity, MessagePartResponse } from './message-part.entity.js';
import type { ReplyVersionEntity } from './reply-version.entity.js';

export enum MessageKind {
    User = 'user',
    Ai = 'ai',
}

/** A turn's Document search: the passages it sent, in the order sent, or that it failed. */
export interface DocumentPassagesUsed {
    status: 'found' | 'failed';
    passageIds: number[];
}

/** The model recorded on the Opening, which no model wrote. */
export const AUTHOR_MODEL = 'author';

/** The state of one of an AI Message's background calls (spec: "BackgroundStatus"). */
export enum BackgroundStatus {
    Pending = 'pending',
    Done = 'done',
    Failed = 'failed',
}

export interface BackgroundCallResponse {
    status: BackgroundStatus;
    /** Why the call failed; null otherwise. */
    error: string | null;
}

export interface UserMessageResponse {
    id: number;
    kind: 'user';
    text: string;
    /** The identity the user wore when writing it, stamped: kept after a rename or delete. */
    identityName: string;
    /** The Persona worn when writing it; null for the Role and once that Persona is deleted. */
    personaId: number | null;
    createdAt: string;
}

/** Where the shown Reply version stands among the newest AI Message's versions: the n and m of ‹ n/m ›. */
export interface ReplyVersionsResponse {
    /** 1-based, in the order the versions were written. */
    current: number;
    count: number;
}

export interface AiMessageResponse {
    id: number;
    kind: 'ai';
    /** The model that wrote it, or "author" for the Opening. */
    model: string;
    parts: MessagePartResponse[];
    /** The Bond, Arc and Scene judge's status; null for the Opening, which is never judged. */
    judge: BackgroundCallResponse | null;
    /** Memory extraction's status; null for the Opening, and for replies from before ticket 28. */
    memory: BackgroundCallResponse | null;
    /** Its Reply versions; null while it has only the one (spec: .scratch/swipe/spec.md). */
    versions: ReplyVersionsResponse | null;
    createdAt: string;
}

export type MessageResponse = UserMessageResponse | AiMessageResponse;

/**
 * One entry in a Chat's history (spec: "Message"): what the user wrote, or the AI's reply
 * as ordered parts. An AI Message exists only once its turn completed, and then records the
 * status of its two background calls: the judge (ticket 27) and Memory extraction (ticket 28).
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

    // The Persona a User Message was written as; the stamped name above outlives it.
    @Column({ name: 'persona_id', type: 'integer', nullable: true })
    personaId: number | null;

    @ManyToOne('PersonaEntity', { onDelete: 'SET NULL', nullable: true })
    @JoinColumn({ name: 'persona_id' })
    persona: Relation<PersonaEntity> | null;

    @Column({ type: 'text', nullable: true })
    model: string | null;

    // The judge's status on an AI Message a model wrote; NULL on User Messages and the Opening.
    @Column({
        name: 'judge_status',
        type: 'enum',
        enum: BackgroundStatus,
        enumName: 'background_status_enum',
        nullable: true,
    })
    judgeStatus: BackgroundStatus | null;

    @Column({ name: 'judge_error', type: 'text', nullable: true })
    judgeError: string | null;

    // Memory extraction's status; set together with the judge's on every reply a model wrote.
    @Column({
        name: 'memory_status',
        type: 'enum',
        enum: BackgroundStatus,
        enumName: 'background_status_enum',
        nullable: true,
    })
    memoryStatus: BackgroundStatus | null;

    @Column({ name: 'memory_error', type: 'text', nullable: true })
    memoryError: string | null;

    /**
     * What the turn that wrote this AI Message found in the Story's Documents
     * (.scratch/documents/spec.md: "What a turn used"); NULL when the Story had none. Regenerate
     * and a User Message edit overwrite it; choosing an older Reply version keeps it.
     */
    @Column({ name: 'document_passages', type: 'jsonb', nullable: true })
    documentPassages: DocumentPassagesUsed | null;

    // The shown Reply version's place among the Message's versions; NULL while it has no others.
    @Column({ name: 'version_ordinal', type: 'integer', nullable: true })
    versionOrdinal: number | null;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;

    @OneToMany('MessagePartEntity', 'message')
    parts: Relation<MessagePartEntity[]>;

    /** The Reply versions not shown; loaded by ChatModelService.findWithMessages. */
    @OneToMany('ReplyVersionEntity', 'message')
    versions?: Relation<ReplyVersionEntity[]>;

    /** The ordinals of every version, the shown one included, in the order they were written. */
    versionOrder(): number[] {
        const shown = this.versionOrdinal ?? 1;
        return [shown, ...(this.versions ?? []).map((version) => version.ordinal)].sort((a, b) => a - b);
    }

    private versionsResponse(): ReplyVersionsResponse | null {
        if (!this.versions || this.versions.length === 0) return null;
        const order = this.versionOrder();
        return { current: order.indexOf(this.versionOrdinal ?? 1) + 1, count: order.length };
    }

    /** An AI Message needs its parts loaded (ChatModelService.findWithMessages). */
    toResponse(): MessageResponse {
        if (this.kind === MessageKind.User) {
            return {
                id: this.id,
                kind: 'user',
                text: this.text ?? '',
                identityName: this.identityName ?? '',
                personaId: this.personaId,
                createdAt: this.createdAt.toISOString(),
            };
        }
        return {
            id: this.id,
            kind: 'ai',
            model: this.model ?? AUTHOR_MODEL,
            parts: this.parts.map((part) => part.toResponse()),
            judge: this.judgeStatus === null ? null : { status: this.judgeStatus, error: this.judgeError },
            memory: this.memoryStatus === null ? null : { status: this.memoryStatus, error: this.memoryError },
            versions: this.versionsResponse(),
            createdAt: this.createdAt.toISOString(),
        };
    }
}

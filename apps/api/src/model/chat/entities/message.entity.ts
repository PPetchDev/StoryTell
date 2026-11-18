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

/**
 * What a turn's Memory choice sent (.scratch/memory-by-meaning/spec.md: "Used last turn"): the
 * Memories and the Beliefs, by id, for "In play" in the Memory drawer.
 */
export interface MemoriesUsed {
    memoryIds: number[];
    beliefIds: number[];
    /**
     * The Memories the search picked, without the Settled ones it was sent with
     * (.scratch/prompt-cache/spec.md): what the next Settled Memories are read off. Left out on
     * turns recorded before it, whose `memoryIds` were exactly what the search picked.
     */
    pickedIds?: number[];
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
    /** The Roll it was sent with (.scratch/roll/spec.md); null without one. */
    roll: MessageRoll | null;
    createdAt: string;
}

/** A User Message's Roll: what the d20 showed, the number to reach, and how it came out. */
export interface MessageRoll {
    value: number;
    target: number;
    outcome: 'critical_success' | 'success' | 'failure' | 'critical_failure';
    /** The Stat it was made for and the number it added (.scratch/judge-rolls/spec.md); left out without one. */
    stat?: { name: string; bonus: number };
}

/** A Roll offer as stored on the AI Message the Judge made it on (.scratch/judge-rolls/spec.md). */
export interface StoredRollOffer {
    /** One short question to the user: what is at stake. */
    stakes: string;
    /** The Role's Stat that applies, as named when the offer was made; null for none. */
    stat: string | null;
    /** The user waved it away; it still counts for the gap between offers. */
    dismissed: boolean;
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
    /** Whether it was written as the story's Epilogue (.scratch/endings/spec.md). */
    epilogue: boolean;
    /** Whether a Character sent it on their own while the user was away (.scratch/reach-outs/spec.md). */
    reachOut?: boolean;
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

    /**
     * The Roll a User Message was sent with (.scratch/roll/spec.md): what the d20 showed, 1 to 20,
     * and the number it had to reach. Both NULL without a Roll. Thrown once, on the send: an edit
     * of the Message keeps it, and every reply written to the Message reads it.
     */
    @Column({ type: 'smallint', nullable: true })
    roll: number | null;

    @Column({ name: 'roll_target', type: 'smallint', nullable: true })
    rollTarget: number | null;

    /** The Stat the Roll was made for, as the Role named it then, and its number (.scratch/judge-rolls/spec.md). Both NULL without one. */
    @Column({ name: 'roll_stat', type: 'text', nullable: true })
    rollStat: string | null;

    @Column({ name: 'roll_bonus', type: 'smallint', nullable: true })
    rollBonus: number | null;

    /**
     * The Roll offer the Judge left on this AI Message (.scratch/judge-rolls/spec.md); NULL without
     * one. Each judgement of the Message writes it again, and a rewind clears it.
     */
    @Column({ name: 'roll_offer', type: 'jsonb', nullable: true })
    rollOffer: StoredRollOffer | null;

    /**
     * An AI Message written as the story's Epilogue (.scratch/endings/spec.md). It stays with the
     * Message, so Again writes every Reply version of it as an Epilogue.
     */
    @Column({ type: 'boolean', default: false })
    epilogue: boolean;

    /**
     * An AI Message a Character sent on their own while the user was away (.scratch/reach-outs/spec.md).
     * It stays with the Message, so Regenerate writes every Reply version of it as a Reach-out.
     */
    @Column({ name: 'reach_out', type: 'boolean', default: false })
    reachOut: boolean;

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

    /**
     * What the turn that wrote this AI Message chose of the Memory (.scratch/memory-by-meaning/spec.md);
     * NULL on the Opening and on turns from before. Overwritten as `documentPassages` is.
     */
    @Column({ name: 'memories_used', type: 'jsonb', nullable: true })
    memoriesUsed: MemoriesUsed | null;

    /**
     * The turn's search query as a vector at unit length, and its model: what Suggested replies,
     * Write for me and Snapshots choose Memories with. NULL when the turn made no search or it
     * failed. Not loaded with the Message (ChatModelService.contextQueryOf reads it).
     */
    @Column({ name: 'context_query', type: 'real', array: true, nullable: true, select: false })
    contextQuery?: number[] | null;

    @Column({ name: 'context_query_model', type: 'text', nullable: true, select: false })
    contextQueryModel?: string | null;

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

    /** The Message's Roll with its outcome: a 20 and a 1 are critical, otherwise reaching the number succeeds. */
    rollResponse(): MessageRoll | null {
        if (this.roll === null || this.roll === undefined || this.rollTarget === null || this.rollTarget === undefined) return null;
        // A Stat adds to the throw (.scratch/judge-rolls/spec.md); a natural 20 and 1 stay critical.
        const stat = this.rollStat !== null && this.rollStat !== undefined ? { name: this.rollStat, bonus: this.rollBonus ?? 0 } : null;
        const total = this.roll + (stat?.bonus ?? 0);
        const outcome = this.roll >= 20 ? 'critical_success' : this.roll <= 1 ? 'critical_failure' : total >= this.rollTarget ? 'success' : 'failure';
        return { value: this.roll, target: this.rollTarget, outcome, ...(stat ? { stat } : {}) };
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
                roll: this.rollResponse(),
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
            epilogue: this.epilogue ?? false,
            reachOut: this.reachOut ?? false,
            createdAt: this.createdAt.toISOString(),
        };
    }
}

import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** What the app did to a reply after it was written (.scratch/reply-repair/spec.md, "Reply repair"). */
export enum RepairKind {
    /** Quoted speech moved onto speech lines, in code. */
    SpeechLines = 'speech_lines',
    /** One speech line said again by a model (Line repair). */
    Line = 'line',
    /** A pressing note read by the turn after the reply that pressed. */
    PressingNote = 'pressing_note',
}

/**
 * One row for each repair the app made or weighed and refused (.scratch/reply-repair/spec.md,
 * "6. Repair counts"): the count the Usage page shows. It is not the cost: a repair that asks a
 * model still records that call as a UsageRecord. It holds no word of any reply. Its Chat is a
 * foreign key that cascades (the migration declares it), so a deleted Chat takes its repair records
 * with it; its Message is set to NULL when the Message goes, so a rewind does not lower the count.
 */
@Entity('repair_record')
export class RepairRecordEntity {
    @PrimaryGeneratedColumn()
    id: number;

    /** The Account whose Chat it was (.scratch/accounts/spec.md: "Ownership"). */
    @Column({ name: 'user_id', type: 'integer' })
    userId: number;

    @Index()
    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;

    @Column({ name: 'chat_id', type: 'integer' })
    chatId: number;

    /** The AI Message the repaired reply became; NULL once that Message is gone. */
    @Column({ name: 'message_id', type: 'integer', nullable: true })
    messageId: number | null;

    @Column({ type: 'text' })
    kind: RepairKind;

    /** False for a repair that was weighed and not made: a guard refused it, or nothing could be placed. */
    @Column({ type: 'boolean' })
    made: boolean;

    /** The play model that wrote the reply. */
    @Column({ type: 'text' })
    model: string;
}

import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import type { Relation } from 'typeorm';

import type { MessageEntity } from './message.entity.js';

/**
 * A Thai reading of one Message (.scratch/write-for-me/spec.md, "Thai reading"), kept under the
 * fingerprint of the stored text it translated. The Message's current reading is the row whose
 * fingerprint matches its text now; the others wait for their Reply version to come back. At
 * most five per Message. Never read by a prompt or the Transcript.
 */
@Entity('thai_reading')
@Unique('UQ_thai_reading_message_fingerprint', ['messageId', 'sourceFingerprint'])
export class ThaiReadingEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'message_id', type: 'integer' })
    messageId: number;

    @ManyToOne('MessageEntity', { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'message_id' })
    message: Relation<MessageEntity>;

    /** SHA-256 hex of the source text (`thaiReadingSource`). */
    @Column({ name: 'source_fingerprint', type: 'text' })
    sourceFingerprint: string;

    @Column({ type: 'text' })
    text: string;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;
}

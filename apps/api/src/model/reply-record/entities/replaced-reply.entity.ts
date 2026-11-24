import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * What is kept of a reply the user replaced with Regenerate (.scratch/reply-repair/spec.md, "5. The
 * play-signals report"): counts, and not one of its words. A replaced reply is the best evidence
 * there is of a bad reply, and the app drops the reply itself when the next Message is sent; this
 * row is what the play-signals report reads of it afterwards. Its Chat and its Message are foreign
 * keys that cascade (the migration declares them): the report reads it beside its Message.
 */
@Entity('replaced_reply')
export class ReplacedReplyEntity {
    @PrimaryGeneratedColumn()
    id: number;

    /** The Account whose Chat it was. */
    @Column({ name: 'user_id', type: 'integer' })
    userId: number;

    @Column({ name: 'chat_id', type: 'integer' })
    chatId: number;

    /** The AI Message whose reply it was. */
    @Column({ name: 'message_id', type: 'integer' })
    messageId: number;

    /** The play model that wrote it. */
    @Column({ type: 'text' })
    model: string;

    /** When its Message was first written: a Regenerate keeps the Message's time. */
    @Column({ name: 'written_at', type: 'timestamptz' })
    writtenAt: Date;

    @CreateDateColumn({ name: 'replaced_at', type: 'timestamptz' })
    replacedAt: Date;

    @Column({ name: 'no_speech_line', type: 'boolean' })
    noSpeechLine: boolean;

    @Column({ name: 'unknown_speaker', type: 'boolean' })
    unknownSpeaker: boolean;

    @Column({ name: 'stage_direction', type: 'boolean' })
    stageDirection: boolean;

    @Column({ name: 'shared_phrase', type: 'boolean' })
    sharedPhrase: boolean;

    @Column({ type: 'integer' })
    words: number;

    @Column({ type: 'integer' })
    overused: number;
}

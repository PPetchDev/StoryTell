import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * One browser install's Web Push subscription, held by the Account that turned reply alerts on
 * there (.scratch/push-alerts/spec.md: "Storage"). The endpoint is unique: a device belongs to one
 * Account at a time, and moves when another Account turns alerts on there.
 */
@Entity('push_subscription')
export class PushSubscriptionEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Index()
    @Column({ name: 'user_id', type: 'integer' })
    userId: number;

    @Column({ type: 'text', unique: true })
    endpoint: string;

    @Column({ type: 'text' })
    p256dh: string;

    @Column({ type: 'text' })
    auth: string;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
    updatedAt: Date;
}

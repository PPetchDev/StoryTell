import { Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import type { Relation } from 'typeorm';

import type { CharacterEntity } from '../../story/entities/character.entity.js';
import type { ChatEntity } from './chat.entity.js';

/**
 * One Character sitting out of one Chat (.scratch/speaker-controls/spec.md, "Sitting out"). Its
 * own table rather than a column, as `memory_known_by` is, so a removed Character or a deleted
 * Chat drops its rows through CASCADE. Chat state outside the ledger: edits, Regenerate and
 * choosing a Reply version never touch it, Reset keeps it, a Branch copies it.
 */
@Entity('chat_sitting_out')
export class ChatSittingOutEntity {
    @PrimaryColumn({ name: 'chat_id', type: 'integer' })
    chatId: number;

    @ManyToOne('ChatEntity', 'sittingOut', { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'chat_id' })
    chat: Relation<ChatEntity>;

    @PrimaryColumn({ name: 'character_id', type: 'integer' })
    characterId: number;

    @ManyToOne('CharacterEntity', { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'character_id' })
    character: Relation<CharacterEntity>;
}

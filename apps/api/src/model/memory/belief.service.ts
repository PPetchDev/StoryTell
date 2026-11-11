import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { BeliefAuthor, BeliefEntity } from './entities/belief.entity.js';

export interface NewBelief {
    chatId: number;
    characterId: number;
    text: string;
    contradictsMemoryId: number | null;
    writtenBy: BeliefAuthor;
    messageId: number | null;
}

/** Repository wrapper for Beliefs (.scratch/memory-by-meaning/spec.md, "Beliefs"). No rules here. */
@Injectable()
export class BeliefModelService {
    constructor(@InjectRepository(BeliefEntity) private readonly beliefs: Repository<BeliefEntity>) {}

    /** Every Belief of the Chat, given-up ones included, oldest first. */
    findByChat(chatId: number): Promise<BeliefEntity[]> {
        return this.beliefs.find({ where: { chatId }, order: { id: 'ASC' } });
    }

    findOne(chatId: number, beliefId: number): Promise<BeliefEntity | null> {
        return this.beliefs.findOne({ where: { id: beliefId, chatId } });
    }

    create(fields: NewBelief): Promise<BeliefEntity> {
        return this.beliefs.save(this.beliefs.create({ ...fields, givenUpMessageId: null }));
    }

    async update(beliefId: number, fields: Partial<Pick<BeliefEntity, 'characterId' | 'text' | 'contradictsMemoryId' | 'writtenBy'>>): Promise<void> {
        await this.beliefs.update({ id: beliefId }, fields);
    }

    async remove(beliefId: number): Promise<void> {
        await this.beliefs.delete({ id: beliefId });
    }
}

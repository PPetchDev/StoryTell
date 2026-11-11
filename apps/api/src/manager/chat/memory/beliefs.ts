import { ChatEntity } from '../../../model/chat/entities/chat.entity.js';
import { BeliefEntity, BeliefResponse } from '../../../model/memory/entities/belief.entity.js';
import { StoryEntity } from '../../../model/story/entities/story.entity.js';
import { latestLine } from '../../excerpt.js';
import { ChoiceBelief } from './memory-choice.js';

/**
 * A Chat's Beliefs as the Chat and the Memory drawer read them (.scratch/memory-by-meaning/spec.md,
 * "In the Memory drawer"): oldest first, each given-up one with the line of the Message that showed
 * the truth ("Gave this up: …").
 */
export function beliefResponses(beliefs: BeliefEntity[], chat: ChatEntity): BeliefResponse[] {
    return beliefs.map((belief) => {
        const message = belief.givenUpMessageId === null ? undefined : chat.messages.find((candidate) => candidate.id === belief.givenUpMessageId);
        return belief.toResponse(message ? latestLine({ text: message.text, parts: message.parts ?? [] }) : '');
    });
}

/** The Chat's active Beliefs as the Memory choice reads them, oldest first: a removed Character's are gone with them. */
export function choiceBeliefs(story: StoryEntity, beliefs: BeliefEntity[]): ChoiceBelief[] {
    return beliefs
        .filter((belief) => belief.active)
        .flatMap((belief) => {
            const character = story.characters.find((candidate) => candidate.id === belief.characterId);
            return character ? [{ id: belief.id, characterName: character.name, text: belief.text }] : [];
        });
}

import { ChatEntity } from '../../../model/chat/entities/chat.entity.js';
import { MemoriesUsed, MessageKind } from '../../../model/chat/entities/message.entity.js';
import { MemoryEntity } from '../../../model/memory/entities/memory.entity.js';
import { StoryEntity } from '../../../model/story/entities/story.entity.js';
import { ChoiceBelief, ChoiceMemory, chooseMemories, ContextQueryVector, MEMORY_BUDGET_TOKENS, MemoryChoice, memoryCost, beliefCost } from './memory-choice.js';
import { presentCharacters } from './present.js';

/**
 * The Memory choice as a Chat reads it (.scratch/memory-by-meaning/spec.md, "Every reader uses
 * it"): its Memories and Beliefs turned into the pure choice's input, with the people present
 * read off the latest exchange. The turn, Suggested replies, Write for me and Snapshots all go
 * through here.
 */

/** Every Memory of the Chat as the choice reads it, archived ones included, in story order; Known by as names in cast order. */
export function choiceMemories(story: StoryEntity, memories: MemoryEntity[]): ChoiceMemory[] {
    const order = story.characters.map((character) => character.id);
    const nameOf = (characterId: number): string[] => {
        const character = story.characters.find((candidate) => candidate.id === characterId);
        return character ? [character.name] : [];
    };
    return [...memories]
        .sort((a, b) => a.id - b.id)
        .map((memory) => ({
            id: memory.id,
            text: memory.text,
            knownBy: memory.knownByIds(order).flatMap(nameOf),
            locked: memory.locked,
            archived: memory.archived,
            embedding: memory.embedding,
            embeddingModel: memory.embeddingModel,
        }));
}

/**
 * The Characters present for the Memory choice, by name: those in the latest exchange before
 * `upTo` (an index into the Chat's Messages), who speak in its AI Message or are named there or
 * in the user's text; when that finds nobody, everyone in play. `userText` is the user's new
 * text on a send; left out, the User Message before that AI Message is read. Never anyone
 * sitting out.
 */
export function presentForMemory(story: StoryEntity, chat: ChatEntity, upTo: number, userText?: string | null): string[] {
    const sittingOut = chat.sittingOutIds();
    const cast = story.characters.filter((character) => !sittingOut.includes(character.id)).map((character) => ({ id: character.id, name: character.name }));
    const before = chat.messages.slice(0, upTo);
    let aiAt = -1;
    for (let at = before.length - 1; at >= 0; at--) {
        if (before[at].kind === MessageKind.Ai) {
            aiAt = at;
            break;
        }
    }
    const ai = aiAt >= 0 ? before[aiAt] : null;
    const userBefore = aiAt > 0 && before[aiAt - 1].kind === MessageKind.User ? (before[aiAt - 1].text ?? '') : '';
    const text = userText ?? userBefore;
    const parts = ai ? [...ai.parts].sort((a, b) => a.position - b.position).map((part) => part.toResponse()) : [];
    return presentCharacters(cast, text, parts).map((character) => character.name);
}

/** The Chat's Memory choice with the given query and people present. */
export function chooseForChat(input: {
    story: StoryEntity;
    memories: MemoryEntity[];
    beliefs: ChoiceBelief[];
    present: string[];
    identityName: string;
    query: ContextQueryVector | null;
}): MemoryChoice {
    return chooseMemories({
        memories: choiceMemories(input.story, input.memories),
        beliefs: input.beliefs,
        cast: input.story.characters.map((character) => character.name),
        present: input.present,
        identityName: input.identityName,
        query: input.query,
    });
}

/**
 * The most the Memory layer's lines may take on the next turn, for the Story so far trigger
 * (spec: "The budget is reserved"): every Memory and Belief that could be chosen, up to the
 * budget, or the locked ones alone when they pass it. A Chat with few Memories reserves less.
 */
export function memoryRoomTokens(memories: ChoiceMemory[], beliefs: ChoiceBelief[], budget = MEMORY_BUDGET_TOKENS): number {
    const all = memories.reduce((sum, memory) => sum + memoryCost(memory), 0) + beliefs.reduce((sum, belief) => sum + beliefCost(belief), 0);
    const locked = memories.filter((memory) => memory.locked && !memory.archived).reduce((sum, memory) => sum + memoryCost(memory), 0);
    return Math.max(locked, Math.min(budget, all));
}

/** Spec: "Used last turn": the newest AI Message's record of what its turn sent; nothing before any turn chose. */
export function memoriesInPlayOf(chat: ChatEntity): MemoriesUsed {
    const newest = [...chat.messages].reverse().find((message) => message.kind === MessageKind.Ai);
    return newest?.memoriesUsed ?? { memoryIds: [], beliefIds: [] };
}

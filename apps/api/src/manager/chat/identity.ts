import { ChatEntity } from '../../model/chat/entities/chat.entity.js';
import { MessageEntity, MessageKind } from '../../model/chat/entities/message.entity.js';
import { StoryEntity } from '../../model/story/entities/story.entity.js';

/**
 * Who the user is playing in a Chat (spec: "worn identity: the Role, or a Persona"). The
 * prompt's identity layer, the stop strings, the guard, the judge's `to: "user"` and the
 * Memory `{user}` rendering all take it from here. Bonds toward the user are keyed to the
 * user whichever identity is worn, so a swap carries them over.
 */
export interface WornIdentity {
    /** The worn Persona; null while the Chat wears its Story's Role. */
    personaId: number | null;
    name: string;
    description: string;
}

/** The Chat needs its `persona` relation loaded (ChatModelService.findWithMessages). */
export function wornIdentity(story: StoryEntity, chat: ChatEntity): WornIdentity {
    if (chat.persona) {
        return { personaId: chat.persona.id, name: chat.persona.name, description: chat.persona.description };
    }
    return { personaId: null, name: story.role.name, description: story.role.description };
}

/**
 * The name the user wore in the exchange that ends at `index`: the stamped name of the User
 * Message right before it, else the identity worn now. The background calls read a reply
 * with this name, since the reply was written to it even if the user swapped since.
 */
export function exchangeIdentityName(story: StoryEntity, chat: ChatEntity, index: number): string {
    const previous: MessageEntity | undefined = chat.messages[index - 1];
    if (previous?.kind === MessageKind.User && previous.identityName) return previous.identityName;
    return wornIdentity(story, chat).name;
}

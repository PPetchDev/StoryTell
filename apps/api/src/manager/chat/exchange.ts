import { MessageEntity, MessageKind } from '../../model/chat/entities/message.entity.js';

/**
 * An exchange is a reply and the User Message right before it, if any. A Continue reply has
 * none (spec: "Continue"): the Message before it is an AI Message, the Opening included.
 */

/**
 * The text of the User Message right before `index`, which opens the exchange the reply at
 * `index` closes; null when there is none, as for a Continue. The turn, the judge and Memory
 * extraction all read the exchange through this.
 */
export function exchangeUserText(messages: MessageEntity[], index: number): string | null {
    const previous: MessageEntity | undefined = messages[index - 1];
    return previous?.kind === MessageKind.User ? (previous.text ?? '') : null;
}

/** The user's side of the exchange as the judge and Memory extraction read it; after a Continue it says the user did nothing new. */
export function exchangeUserLine(identityName: string, userText: string | null): string {
    return userText === null ? `(${identityName} did nothing new; the story went on.)` : `${identityName}: ${userText}`;
}

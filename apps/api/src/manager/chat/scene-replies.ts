import { AUTHOR_MODEL, MessageKind } from '../../model/chat/entities/message.entity.js';

/**
 * Replies in the Scene (.scratch/scene-flow/spec.md, "Replies in the Scene"): how many AI
 * Messages the Chat's current Scene has lasted. Pure logic over the Chat's Messages and its
 * Scene advances, so it follows rollback, Branch and Reset with no storage of its own.
 */

/** From this many replies in the Scene before the reply being written, the Scene is a Lingering Scene. */
export const LINGERING_REPLIES = 8;
/** From this many replies in the Scene, the one being judged included, the Judge may find it passed by. */
export const PASSED_BY_REPLIES = 20;

/** A Message as the count reads it. */
export interface CountedMessage {
    id: number;
    kind: MessageKind | 'user' | 'ai';
    /** The model that wrote it; "author" (or none) for the Opening, which never counts. */
    model: string | null;
}

/** A Scene advance as the count reads it: the Message whose judgement moved the Scene on. */
export interface CountedAdvance {
    messageId: number;
}

/**
 * The AI Messages after the Message of the latest Scene advance among `messages`, or after the
 * Opening when there is none; the Opening never counts. Null in free play, which has no count.
 * The caller chooses `messages`: those before the reply being written for the Narrator, up to and
 * including the reply being judged for the Judge.
 */
export function repliesInScene(input: {
    currentSceneId: number | null;
    messages: readonly CountedMessage[];
    sceneAdvances: readonly CountedAdvance[];
}): number | null {
    if (input.currentSceneId === null) return null;
    const advanced = new Set(input.sceneAdvances.map((advance) => advance.messageId));
    let from = 0;
    for (let i = input.messages.length - 1; i >= 0; i--) {
        if (advanced.has(input.messages[i].id)) {
            from = i + 1;
            break;
        }
    }
    return input.messages.slice(from).filter(isReply).length;
}

function isReply(message: CountedMessage): boolean {
    return message.kind === MessageKind.Ai && message.model !== null && message.model !== AUTHOR_MODEL;
}

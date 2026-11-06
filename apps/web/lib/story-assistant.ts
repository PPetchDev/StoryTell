import { apiSend } from './api';
import { RewriteRequest, Story } from './story';

// Mirrors the API's assistant DTOs (apps/api/src/api/story-assistant/dto/).

export type ChangeTarget = 'story' | 'role' | 'character' | 'scene' | 'startingBond' | 'lore';

/** One change the assistant applied, as the API answered it. */
export type AppliedChange =
    | {
          kind: 'set';
          target: ChangeTarget;
          /** The Character, Scene, starting Bond or Lore entry; absent for `story` and `role`. */
          id?: number;
          field: string;
          /** A list for exampleLines and Lore keywords; true or false for Lore alwaysOn. */
          before: string | string[] | boolean;
          after: string | string[] | boolean;
          label: string;
      }
    | { kind: 'add'; target: 'character' | 'scene' | 'startingBond' | 'lore'; id: number; label: string }
    | { kind: 'remove'; target: 'character' | 'scene' | 'startingBond' | 'lore'; label: string };

export interface PendingChangeSet {
    /** Opaque to the client: sent back as is once the removals are confirmed. */
    changes: unknown[];
    removals: string[];
}

export interface AssistantResponse {
    story: Story;
    reply: string;
    changes: AppliedChange[];
    pending: PendingChangeSet | null;
}

export const assistantApi = {
    /** One stateless call: the current Story plus the instruction (ticket 23). */
    instruct: (storyId: number, instruction: string) =>
        apiSend<AssistantResponse>('POST', `/stories/${storyId}/assistant`, { instruction }),
    /** Applies a change set answered as pending, with the removals confirmed. */
    apply: (storyId: number, changes: unknown[]) =>
        apiSend<AssistantResponse>('POST', `/stories/${storyId}/assistant/apply`, { changes, confirmRemovals: true }),
};

/** The field a set change is for, as the editor's Rewrite buttons name fields, so highlights share their keys. */
export function changedField(change: Extract<AppliedChange, { kind: 'set' }>): RewriteRequest {
    return { target: change.target, id: change.id, field: change.field };
}

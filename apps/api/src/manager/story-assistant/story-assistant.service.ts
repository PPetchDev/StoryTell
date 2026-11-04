import { Injectable, Logger } from '@nestjs/common';

import {
    EmptyInstructionError,
    InvalidChangeSetError,
    RemovalNeedsConfirmationError,
    UnreadableChangeSetError,
} from '../../errors/story-drafting.errors.js';
import { ModelGateway } from '../../service/model-gateway/model-gateway.js';
import { FIELD_LABELS } from '../story-drafting/story-drafting.service.js';
import { StoryDetail, StoryManagerService } from '../story/story.service.js';
import { Change, ChangeSet, CharacterRef, parseChangeSetJson, validateChangeSet } from './change-set-schema.js';
import { ASSISTANT_MAX_TOKENS, assistantMessages } from './prompts.js';

export interface InstructRequest {
    instruction: string;
    /** Without it, a change set that removes a Character or Scene is answered as `pending`. */
    confirmRemovals?: boolean;
}

export interface ApplyChangeSetRequest {
    /** A change set as the API answered it in `pending`, or as the client wrote it. */
    changes: unknown[];
    confirmRemovals?: boolean;
}

/** One change as applied, with what the client needs to highlight the field and offer Undo. */
export type AppliedChange =
    | {
          kind: 'set';
          target: 'story' | 'role' | 'character' | 'scene' | 'startingBond';
          /** The Character, Scene or StartingBond; absent for `story` and `role`. */
          id?: number;
          field: string;
          before: string | string[];
          after: string | string[];
          label: string;
      }
    | { kind: 'add'; target: 'character' | 'scene' | 'startingBond'; id: number; label: string }
    | { kind: 'remove'; target: 'character' | 'scene' | 'startingBond'; label: string };

export interface PendingChangeSet {
    changes: Change[];
    /** What the set would remove, e.g. "Character Mira", for the confirmation. */
    removals: string[];
}

export interface AssistantResult {
    /** The Story after the changes, or as it was when they are pending. */
    story: StoryDetail;
    reply: string;
    changes: AppliedChange[];
    /** Set, with `changes` empty, when the set removes something and removals were not confirmed. */
    pending: PendingChangeSet | null;
}

/** The drafting labels plus the fields only the assistant can set. */
const SET_FIELD_LABELS: Record<string, string> = {
    ...FIELD_LABELS,
    exampleLines: 'Example lines',
    pov: 'POV',
    tense: 'Tense',
    replyLength: 'Reply length',
};

function excerpt(text: string): string {
    const flat = text.replace(/\s+/g, ' ').trim();
    return flat.length > 1500 ? `${flat.slice(0, 1500)}…` : flat || '(nothing)';
}

/**
 * The Story assistant (spec: "Story assistant"): one stateless `story_assistant` call per
 * instruction, answered as a change set that is validated whole and then applied straight to
 * the Story through the authoring rules. Nothing about the conversation is kept; Undo is the
 * client's, from the `before` values answered here.
 */
@Injectable()
export class StoryAssistantManagerService {
    private readonly logger = new Logger(StoryAssistantManagerService.name);

    constructor(
        private readonly storyManager: StoryManagerService,
        private readonly gateway: ModelGateway,
    ) {}

    async instruct(storyId: number, request: InstructRequest): Promise<AssistantResult> {
        if (request.instruction.trim() === '') throw new EmptyInstructionError();
        const story = await this.storyManager.getStory(storyId);

        const result = await this.gateway.completeText({
            kind: 'story_assistant',
            messages: assistantMessages(story, request.instruction),
            json: true,
            maxTokens: ASSISTANT_MAX_TOKENS,
            servedFor: { storyId },
        });
        let changeSet: ChangeSet;
        try {
            changeSet = validateChangeSet(parseChangeSetJson(result.text), story, 'model');
        } catch (error) {
            if (error instanceof InvalidChangeSetError || error instanceof UnreadableChangeSetError) {
                this.logger.warn(`${error.message} The model wrote: ${excerpt(result.text)}`);
            }
            throw error;
        }

        const removals = removalLabels(changeSet.changes, story);
        if (removals.length > 0 && !request.confirmRemovals) {
            return { story, reply: changeSet.reply, changes: [], pending: { changes: changeSet.changes, removals } };
        }
        return this.apply(story, changeSet);
    }

    /** Applies a change set the client holds, usually one answered as `pending` and now confirmed. */
    async applyChangeSet(storyId: number, request: ApplyChangeSetRequest): Promise<AssistantResult> {
        const story = await this.storyManager.getStory(storyId);
        const changeSet = validateChangeSet({ changes: request.changes }, story, 'client');
        const removals = removalLabels(changeSet.changes, story);
        if (removals.length > 0 && !request.confirmRemovals) throw new RemovalNeedsConfirmationError(removals);
        return this.apply(story, changeSet);
    }

    /**
     * Removals first (they may make room in the cast), then field changes, then additions,
     * with StartingBonds last so they can point at Characters added just before.
     */
    private async apply(before: StoryDetail, changeSet: ChangeSet): Promise<AssistantResult> {
        const storyId = before.id;
        const applied: AppliedChange[] = [];
        let story = before;
        const addedIds = new Map<string, number>(); // added Character name (lowercased) -> id

        const order = (change: Change): number => {
            if (change.op === 'remove') return 0;
            if (change.op === 'set') return 1;
            return change.target === 'startingBond' ? 3 : 2;
        };
        const changes = [...changeSet.changes].sort((a, b) => order(a) - order(b));

        for (const change of changes) {
            switch (change.op) {
                case 'remove': {
                    const label = removalLabel(change, before);
                    if (change.target === 'character') story = await this.storyManager.removeCharacter(storyId, change.id);
                    else if (change.target === 'scene') story = await this.storyManager.removeScene(storyId, change.id);
                    else story = await this.storyManager.removeStartingBond(storyId, change.id);
                    applied.push({ kind: 'remove', target: change.target, label });
                    break;
                }
                case 'set': {
                    const { label, current } = setSubject(change, before);
                    switch (change.target) {
                        case 'story':
                            story = await this.storyManager.updateStory(storyId, { [change.field]: change.value });
                            break;
                        case 'role':
                            story = await this.storyManager.updateRole(storyId, { [change.field]: change.value });
                            break;
                        case 'character':
                            story = await this.storyManager.updateCharacter(storyId, change.id, {
                                [change.field]: change.value,
                            });
                            break;
                        case 'scene':
                            story = await this.storyManager.updateScene(storyId, change.id, { [change.field]: change.value });
                            break;
                        case 'startingBond':
                            story = await this.storyManager.updateStartingBond(storyId, change.id, {
                                [change.field]: change.value,
                            });
                            break;
                    }
                    applied.push({
                        kind: 'set',
                        target: change.target,
                        ...(change.target === 'story' || change.target === 'role' ? {} : { id: change.id }),
                        field: change.field,
                        before: current,
                        after: change.value,
                        label,
                    });
                    break;
                }
                case 'add':
                    switch (change.target) {
                        case 'character': {
                            story = await this.storyManager.addCharacter(storyId, change.value);
                            const id = story.characters[story.characters.length - 1].id;
                            addedIds.set(change.value.name.toLowerCase(), id);
                            applied.push({ kind: 'add', target: 'character', id, label: `Character ${change.value.name}` });
                            break;
                        }
                        case 'scene': {
                            story = await this.storyManager.addScene(storyId, change.value);
                            const id = story.scenes[story.scenes.length - 1].id;
                            applied.push({ kind: 'add', target: 'scene', id, label: `Scene ${change.value.name}` });
                            break;
                        }
                        case 'startingBond': {
                            const idOf = (ref: CharacterRef): number =>
                                typeof ref === 'number' ? ref : (addedIds.get(ref.toLowerCase()) ?? -1);
                            const fromCharacterId = idOf(change.value.from);
                            const toCharacterId = change.value.toward === null ? null : idOf(change.value.toward);
                            story = await this.storyManager.addStartingBond(storyId, {
                                fromCharacterId,
                                toCharacterId,
                                label: change.value.label,
                                description: change.value.description,
                            });
                            const bond = story.startingBonds[story.startingBonds.length - 1];
                            const name = (id: number | null) =>
                                id === null ? 'the Role' : story.characters.find((c) => c.id === id)?.name || 'a Character';
                            applied.push({
                                kind: 'add',
                                target: 'startingBond',
                                id: bond.id,
                                label: `${name(fromCharacterId)}'s starting Bond toward ${name(toCharacterId)}`,
                            });
                            break;
                        }
                    }
                    break;
            }
        }

        return { story, reply: changeSet.reply, changes: applied, pending: null };
    }
}

function characterName(story: StoryDetail, id: number): string {
    const character = story.characters.find((other) => other.id === id);
    if (!character) return 'a Character';
    return character.name.trim() === '' ? `Character ${story.characters.indexOf(character) + 1}` : character.name;
}

function sceneName(story: StoryDetail, id: number): string {
    const scene = story.scenes.find((other) => other.id === id);
    if (!scene) return 'a Scene';
    return scene.name.trim() === '' ? `Scene ${story.scenes.indexOf(scene) + 1}` : scene.name;
}

function bondName(story: StoryDetail, id: number): string {
    const bond = story.startingBonds.find((other) => other.id === id);
    if (!bond) return 'a starting Bond';
    const toward = bond.toCharacterId === null ? 'the Role' : characterName(story, bond.toCharacterId);
    return `${characterName(story, bond.fromCharacterId)}'s starting Bond toward ${toward}`;
}

function removalLabel(change: Extract<Change, { op: 'remove' }>, story: StoryDetail): string {
    switch (change.target) {
        case 'character':
            return `Character ${characterName(story, change.id)}`;
        case 'scene':
            return `Scene ${sceneName(story, change.id)}`;
        case 'startingBond':
            return bondName(story, change.id);
    }
}

/** What the set removes that needs confirming: Characters and Scenes, as manual removal asks. */
function removalLabels(changes: Change[], story: StoryDetail): string[] {
    return changes.flatMap((change) =>
        change.op === 'remove' && change.target !== 'startingBond' ? [removalLabel(change, story)] : [],
    );
}

/** The label of a set change for the client's change list, and the value it replaces. */
function setSubject(change: Extract<Change, { op: 'set' }>, story: StoryDetail): { label: string; current: string | string[] } {
    const fieldLabel = SET_FIELD_LABELS[change.field] ?? change.field;
    switch (change.target) {
        case 'story': {
            const style = story.style as Record<string, string>;
            const current = change.field in style ? style[change.field] : (story as unknown as Record<string, string>)[change.field];
            return { label: fieldLabel, current };
        }
        case 'role':
            return { label: `Role: ${fieldLabel}`, current: story.role[change.field] };
        case 'character': {
            const character = story.characters.find((other) => other.id === change.id)!;
            return {
                label: `${characterName(story, change.id)}: ${fieldLabel}`,
                current: change.field === 'exampleLines' ? [...character.exampleLines] : character[change.field],
            };
        }
        case 'scene': {
            const scene = story.scenes.find((other) => other.id === change.id)!;
            return { label: `${sceneName(story, change.id)}: ${fieldLabel}`, current: scene[change.field] };
        }
        case 'startingBond': {
            const bond = story.startingBonds.find((other) => other.id === change.id)!;
            return { label: `${bondName(story, change.id)}: ${fieldLabel}`, current: bond[change.field] };
        }
    }
}

import { apiSend } from './api';

// Mirrors the API's Story response DTOs (apps/api/src/api/story/dto/story.response.dto.ts).

export type Pov = 'first' | 'second' | 'third';
export type Tense = 'past' | 'present';
export type ReplyLength = 'short' | 'medium' | 'long';

/** A Story as Home's cards read it (mirrors StorySummaryDTO). */
export interface StorySummary {
    id: number;
    title: string;
    playable: boolean;
    missing: MissingField[];
    createdAt: string;
    updatedAt: string;
    /** When its most recently played Chat was last played; null when it has no Chats. */
    lastPlayedAt: string | null;
    /** That Chat, with the Scene it is on (null for free play); null when it has no Chats. */
    latestChat: { id: number; sceneName: string | null } | null;
    /** The newest Snapshot's image, relative to the image folder; null when it has none. */
    coverImagePath: string | null;
    /** The Setting's first sentence, cut to about 120 characters. */
    hook: string;
}

export interface Style {
    pov: Pov;
    tense: Tense;
    replyLength: ReplyLength;
    imageStyle: string;
}

export interface Role {
    id: number;
    name: string;
    description: string;
}

export interface Character {
    id: number;
    name: string;
    appearance: string;
    personality: string;
    voice: string;
    exampleLines: string[];
    background: string;
    secrets: string;
    arcDirections: string;
    /** Relative path of the Reference image (ticket 30); null while there is none. Never shown in play. */
    referenceImagePath: string | null;
}

export interface StartingBond {
    id: number;
    fromCharacterId: number;
    /** null means toward the Role. */
    toCharacterId: number | null;
    label: string;
    description: string;
}

export interface Scene {
    id: number;
    name: string;
    situation: string;
    moveOnCondition: string;
}

export interface MissingField {
    field: string;
    label: string;
}

export interface Story {
    id: number;
    title: string;
    setting: string;
    opening: string;
    style: Style;
    role: Role;
    characters: Character[];
    startingBonds: StartingBond[];
    scenes: Scene[];
    playable: boolean;
    missing: MissingField[];
    createdAt: string;
    updatedAt: string;
}

export type StoryFields = Partial<Pick<Story, 'title' | 'setting' | 'opening'> & Style>;
export type CharacterFields = Partial<Omit<Character, 'id' | 'referenceImagePath'>>;
export type SceneFields = Partial<Omit<Scene, 'id'>>;
export type StartingBondFields = Partial<Pick<StartingBond, 'label' | 'description'>>;

export const POV_LABELS: Record<Pov, string> = {
    first: '1st person',
    second: '2nd person',
    third: '3rd person',
};
export const TENSE_LABELS: Record<Tense, string> = { past: 'Past', present: 'Present' };
export const REPLY_LENGTH_LABELS: Record<ReplyLength, string> = {
    short: 'Short',
    medium: 'Medium',
    long: 'Long',
};

export const MAX_CHARACTERS = 6;

/** Which part of the Story a rewrite is for (mirrors the API's REWRITE_TARGETS). */
export type RewriteTarget = 'story' | 'role' | 'character' | 'startingBond' | 'scene';

export interface RewriteRequest {
    target: RewriteTarget;
    /** The Character, starting Bond or Scene; not used for `story` and `role`. */
    id?: number;
    field: string;
}

export interface ReferenceCandidate {
    id: string;
}

/** One round of Reference image candidates (mirrors GenerateReferenceCandidatesResponseBodyDTO). */
export interface ReferenceCandidateRound {
    candidates: ReferenceCandidate[];
    /** Calls of the round that failed while at least one succeeded. */
    failed: number;
    failureMessage: string | null;
}

/** Where the API serves a stored image, by its path relative to the image folder. */
export function referenceImageUrl(relativePath: string): string {
    return `/api/images/${relativePath}`;
}

/** Where the API serves a candidate of the latest round, until it is picked or replaced. */
export function candidateImageUrl(storyId: number, characterId: number, candidateId: string): string {
    return `/api/stories/${storyId}/characters/${characterId}/reference-image/candidates/${candidateId}`;
}

export function storyTitle(story: { title: string }): string {
    return story.title.trim() === '' ? 'Untitled Story' : story.title;
}

/** Spec story 32: what removing a Character deletes in the Story's Chats, said before it happens. */
export function characterRemovalWarning(name: string): string {
    return (
        `In every Chat of this Story, ${name}'s Bonds (both ways, with their history), Arc steps and Arc directions ` +
        `are deleted, ${name} is dropped from every Memory's Known by, and the Reference image is deleted. ` +
        `Past lines and Snapshots keep the name ${name}. This can't be undone.`
    );
}

/** Spec story 34: where a Chat on a removed Scene goes. */
export const SCENE_REMOVAL_WARNING = 'A Chat on this Scene moves to the next Scene, or to free play if this is the last.';

/** Every write answers with the whole Story, playable status included. */
export const storyApi = {
    create: (fields: StoryFields = {}) => apiSend<Story>('POST', '/stories', fields),
    /** One play-model call turns the idea into a whole, saved Story (ticket 22). */
    draft: (idea: string) => apiSend<Story>('POST', '/stories/draft', { idea }),
    /** One call regenerates a single text field; the answer differs only in that field. */
    rewrite: (storyId: number, request: RewriteRequest) =>
        apiSend<Story>('POST', `/stories/${storyId}/rewrite`, request),
    update: (storyId: number, fields: StoryFields) =>
        apiSend<Story>('PATCH', `/stories/${storyId}`, fields),
    remove: (storyId: number) => apiSend<void>('DELETE', `/stories/${storyId}`),

    updateRole: (storyId: number, fields: Partial<Omit<Role, 'id'>>) =>
        apiSend<Story>('PATCH', `/stories/${storyId}/role`, fields),

    addCharacter: (storyId: number, fields: CharacterFields = {}) =>
        apiSend<Story>('POST', `/stories/${storyId}/characters`, fields),
    updateCharacter: (storyId: number, characterId: number, fields: CharacterFields) =>
        apiSend<Story>('PATCH', `/stories/${storyId}/characters/${characterId}`, fields),
    removeCharacter: (storyId: number, characterId: number) =>
        apiSend<Story>('DELETE', `/stories/${storyId}/characters/${characterId}`),
    reorderCharacters: (storyId: number, characterIds: number[]) =>
        apiSend<Story>('PUT', `/stories/${storyId}/characters/order`, { characterIds }),

    addStartingBond: (
        storyId: number,
        bond: { fromCharacterId: number; toCharacterId: number | null } & StartingBondFields,
    ) => apiSend<Story>('POST', `/stories/${storyId}/starting-bonds`, bond),
    updateStartingBond: (storyId: number, bondId: number, fields: StartingBondFields) =>
        apiSend<Story>('PATCH', `/stories/${storyId}/starting-bonds/${bondId}`, fields),
    removeStartingBond: (storyId: number, bondId: number) =>
        apiSend<Story>('DELETE', `/stories/${storyId}/starting-bonds/${bondId}`),

    addScene: (storyId: number, fields: SceneFields = {}) =>
        apiSend<Story>('POST', `/stories/${storyId}/scenes`, fields),
    updateScene: (storyId: number, sceneId: number, fields: SceneFields) =>
        apiSend<Story>('PATCH', `/stories/${storyId}/scenes/${sceneId}`, fields),
    removeScene: (storyId: number, sceneId: number) =>
        apiSend<Story>('DELETE', `/stories/${storyId}/scenes/${sceneId}`),
    reorderScenes: (storyId: number, sceneIds: number[]) =>
        apiSend<Story>('PUT', `/stories/${storyId}/scenes/order`, { sceneIds }),

    /** Makes a round of 4 Reference image candidates; a new round discards the Character's old one (ticket 30). */
    generateReferenceCandidates: (storyId: number, characterId: number) =>
        apiSend<ReferenceCandidateRound>('POST', `/stories/${storyId}/characters/${characterId}/reference-image/candidates`),
    /** Stores the picked candidate as the Character's one Reference image, replacing the old one. */
    pickReferenceImage: (storyId: number, characterId: number, candidateId: string) =>
        apiSend<Story>('PUT', `/stories/${storyId}/characters/${characterId}/reference-image`, { candidateId }),
    removeReferenceImage: (storyId: number, characterId: number) =>
        apiSend<Story>('DELETE', `/stories/${storyId}/characters/${characterId}/reference-image`),
};

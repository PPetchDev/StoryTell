import { apiFetch, apiSend } from './api';
import type { MessagePart } from './chat';
import type { SavedReply } from './saved-replies';
import type { ReplaceRule } from './replace-rules';

// Mirrors the API's Story response DTOs (apps/api/src/api/story/dto/story.response.dto.ts).

export type Pov = 'first' | 'second' | 'third';
export type Tense = 'past' | 'present';
export type ReplyLength = 'short' | 'medium' | 'long';

/** A Story's most recently played Chat (mirrors LatestChatDTO). */
export interface LatestChat {
    id: number;
    /** The Scene the Chat is on; null means free play. */
    sceneName: string | null;
}

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
    /** That Chat; null when it has no Chats. */
    latestChat: LatestChat | null;
    /** The card's picture, relative to the image folder: the Cover if one is chosen, else the newest Snapshot; null when neither. */
    coverImagePath: string | null;
    /** The Cover's focus point; null for the newest Snapshot or a Cover with none chosen. */
    coverFocus: CoverFocus | null;
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

/** A square of the Reference image, in fractions of the image's width: left edge, top edge, side. */
export interface PortraitCrop {
    x: number;
    y: number;
    size: number;
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
    /** Relative path of the Reference image (ticket 30); null while there is none. In play its Portrait shows, and the whole image only in the Character profile. */
    referenceImagePath: string | null;
    /** The square of the Reference image shown beside their lines in a Chat; null while none is chosen. */
    portraitCrop: PortraitCrop | null;
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

/** A note about the Story's world, sent when its name or a keyword comes up (mirrors LoreEntryDTO). */
export interface LoreEntry {
    id: number;
    /** What it is about; it also counts as a keyword. */
    name: string;
    keywords: string[];
    text: string;
    /** Sent on every turn, whether or not it comes up. */
    alwaysOn: boolean;
    /** Second keywords: they filter an entry that came up, by `secondaryMode` (.scratch/lore-triggers/spec.md). */
    secondaryKeywords: string[];
    secondaryMode: LoreSecondaryMode;
    /** Patterns: regular expressions, matched ignoring case, that bring the entry up like keywords. */
    patterns: string[];
    /** "Brought in by other entries": named in the text of a chosen entry, it comes along. */
    recursable: boolean;
    /** "Stays for", "Rests for", "Waits until the Chat has": in Messages, 0 = off. */
    sticky: number;
    cooldown: number;
    delay: number;
    /** "Chance": the percentage of the times it would come in that it does; 100 = no roll. */
    chance: number;
    /** "Group": at most one entry of a group goes in per turn; blank = none. */
    group: string;
}

/** Where a Document's text came from. */
export type DocumentSource = 'pasted' | 'file' | 'web';

/** A longer text the Narrator looks things up in by meaning (mirrors DocumentSummaryDTO): no text, no vectors. */
export interface DocumentSummary {
    id: number;
    title: string;
    source: DocumentSource;
    /** The file name or the page URL; null for pasted text. */
    sourceName: string | null;
    characters: number;
    passages: number;
    createdAt: string;
}

/** A Document with its text, for reading. */
export interface DocumentText {
    id: number;
    title: string;
    source: DocumentSource;
    sourceName: string | null;
    text: string;
}

export interface NewDocument {
    title: string;
    text: string;
    source: DocumentSource;
    sourceName?: string | null;
}

/** "alsoNeeds": one of the second keywords must be there too; "unless": none of them may be. */
export type LoreSecondaryMode = 'alsoNeeds' | 'unless';

export interface MissingField {
    field: string;
    label: string;
}

/** The point of a Cover kept in view when it is cropped, in fractions of its width and height (mirrors CoverFocusDTO). */
export interface CoverFocus {
    x: number;
    y: number;
}

/** Only an upload's file belongs to the Cover; the others point at a Snapshot or a Reference image. */
export type CoverSource = 'snapshot' | 'reference_image' | 'upload';

/** The picture the author chose for the Story (mirrors StoryCoverDTO). */
export interface StoryCover {
    source: CoverSource;
    /** Relative to the image folder. */
    imagePath: string;
    /** Null while none is chosen: the picture is centred. */
    focus: CoverFocus | null;
    snapshotId: number | null;
    characterId: number | null;
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
    /** In add order. */
    lore: LoreEntry[];
    /** In add order. */
    documents: DocumentSummary[];
    /** The Story's own Saved replies, in add order (.scratch/saved-replies-and-replace-rules/spec.md). */
    savedReplies: SavedReply[];
    /** The Story's own Replace rules, in order; they run after the app-wide ones. */
    replaceRules: ReplaceRule[];
    /** Null while the author has chosen none. */
    cover: StoryCover | null;
    playable: boolean;
    missing: MissingField[];
    createdAt: string;
    updatedAt: string;
}

export type StoryFields = Partial<Pick<Story, 'title' | 'setting' | 'opening'> & Style>;
export type CharacterFields = Partial<Omit<Character, 'id' | 'referenceImagePath' | 'portraitCrop'>>;
export type SceneFields = Partial<Omit<Scene, 'id'>>;
export type StartingBondFields = Partial<Pick<StartingBond, 'label' | 'description'>>;
export type LoreEntryFields = Partial<Omit<LoreEntry, 'id'>>;

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

/**
 * Which part of the Story a rewrite is for (mirrors the API's REWRITE_TARGETS). `lore` only
 * names Lore fields for the assistant's highlights and links: Lore has no ✨ Rewrite.
 */
export type RewriteTarget = 'story' | 'role' | 'character' | 'startingBond' | 'scene' | 'lore';

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
    /** A new Story, "<title> (copy)", with everything the author wrote; no Chats or Snapshots. */
    duplicate: (storyId: number) => apiSend<Story>('POST', `/stories/${storyId}/duplicate`),
    /** The stored Opening split by the Chat's own parser, for the editor's preview (Friendly UI ticket 09). */
    opening: (storyId: number) => apiFetch<{ parts: MessagePart[] }>(`/stories/${storyId}/opening`),

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

    addLoreEntry: (storyId: number, fields: LoreEntryFields = {}) =>
        apiSend<Story>('POST', `/stories/${storyId}/lore`, fields),
    updateLoreEntry: (storyId: number, loreId: number, fields: LoreEntryFields) =>
        apiSend<Story>('PATCH', `/stories/${storyId}/lore/${loreId}`, fields),
    removeLoreEntry: (storyId: number, loreId: number) => apiSend<Story>('DELETE', `/stories/${storyId}/lore/${loreId}`),

    /** Splits and embeds the text (a fraction of a cent), then stores it; the only Document write that spends. */
    addDocument: (storyId: number, document: NewDocument) => apiSend<Story>('POST', `/stories/${storyId}/documents`, document),
    /** A web page's title and plain text for the Add sheet; the API stores nothing and spends nothing. */
    fetchPage: (storyId: number, url: string) =>
        apiSend<{ title: string; text: string; url: string }>('POST', `/stories/${storyId}/documents/fetch-page`, { url }),
    /** Only the title changes: the text stays as added. */
    renameDocument: (storyId: number, documentId: number, title: string) =>
        apiSend<Story>('PATCH', `/stories/${storyId}/documents/${documentId}`, { title }),
    readDocument: (storyId: number, documentId: number) => apiFetch<DocumentText>(`/stories/${storyId}/documents/${documentId}`),
    removeDocument: (storyId: number, documentId: number) => apiSend<Story>('DELETE', `/stories/${storyId}/documents/${documentId}`),

    /** Makes a round of 4 Reference image candidates; a new round discards the Character's old one (ticket 30). */
    generateReferenceCandidates: (storyId: number, characterId: number) =>
        apiSend<ReferenceCandidateRound>('POST', `/stories/${storyId}/characters/${characterId}/reference-image/candidates`),
    /** Stores the picked candidate as the Character's one Reference image, replacing the old one. */
    pickReferenceImage: (storyId: number, characterId: number, candidateId: string) =>
        apiSend<Story>('PUT', `/stories/${storyId}/characters/${characterId}/reference-image`, { candidateId }),
    removeReferenceImage: (storyId: number, characterId: number) =>
        apiSend<Story>('DELETE', `/stories/${storyId}/characters/${characterId}/reference-image`),
    setPortraitCrop: (storyId: number, characterId: number, crop: PortraitCrop) =>
        apiSend<Story>('PUT', `/stories/${storyId}/characters/${characterId}/reference-image/portrait`, crop),
    clearPortraitCrop: (storyId: number, characterId: number) =>
        apiSend<Story>('DELETE', `/stories/${storyId}/characters/${characterId}/reference-image/portrait`),

    /** Makes a Snapshot of the Gallery, or a Character's Reference image, the Cover; the Cover only points at it. */
    chooseCover: (storyId: number, choice: { snapshotId: number } | { characterId: number }) =>
        apiSend<Story>('PUT', `/stories/${storyId}/cover`, choice),
    /** Stores a picture from the phone as the Cover, which owns its file. */
    uploadCover: (storyId: number, picture: Blob, filename: string) => {
        const form = new FormData();
        form.append('image', picture, filename);
        return apiFetch<Story>(`/stories/${storyId}/cover/upload`, { method: 'PUT', body: form });
    },
    clearCover: (storyId: number) => apiSend<Story>('DELETE', `/stories/${storyId}/cover`),
    setCoverFocus: (storyId: number, focus: CoverFocus) =>
        apiSend<Story>('PUT', `/stories/${storyId}/cover/focus`, focus),
    clearCoverFocus: (storyId: number) => apiSend<Story>('DELETE', `/stories/${storyId}/cover/focus`),
};

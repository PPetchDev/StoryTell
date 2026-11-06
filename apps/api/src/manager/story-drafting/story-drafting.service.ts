import { Injectable, Logger } from '@nestjs/common';

import {
    EmptyIdeaError,
    InvalidDraftError,
    NotRewritableError,
    UnreadableDraftError,
} from '../../errors/story-drafting.errors.js';
import {
    CharacterNotFoundError,
    SceneNotFoundError,
    StartingBondNotFoundError,
} from '../../errors/story.errors.js';
import { ModelGateway } from '../../service/model-gateway/model-gateway.js';
import { StoryDetail, StoryManagerService } from '../story/story.service.js';
import { DraftStory, parseDraftJson, validateDraft } from './draft-schema.js';
import {
    cleanRewrite,
    DRAFT_MAX_TOKENS,
    draftMessages,
    REWRITE_MAX_TOKENS,
    rewriteMessages,
    RewriteSubject,
} from './prompts.js';

export const REWRITE_TARGETS = ['story', 'role', 'character', 'startingBond', 'scene'] as const;
export type RewriteTarget = (typeof REWRITE_TARGETS)[number];

/** The text fields a rewrite may address, per part of the Story. Style choices are not text. */
export const REWRITABLE_FIELDS: Record<RewriteTarget, readonly string[]> = {
    story: ['title', 'setting', 'opening', 'imageStyle'],
    role: ['name', 'description'],
    character: ['name', 'appearance', 'personality', 'voice', 'background', 'secrets', 'arcDirections'],
    startingBond: ['label', 'description'],
    scene: ['name', 'situation', 'moveOnCondition'],
};

export interface RewriteRequest {
    target: RewriteTarget;
    /** The Character, StartingBond or Scene; not used for `story` and `role`. */
    id?: number;
    field: string;
}

export const FIELD_LABELS: Record<string, string> = {
    title: 'Title',
    setting: 'Setting',
    opening: 'Opening',
    imageStyle: 'Image style',
    name: 'Name',
    description: 'Description',
    appearance: 'Appearance',
    personality: 'Personality',
    voice: 'Voice',
    background: 'Background',
    secrets: 'Secrets',
    arcDirections: 'Arc directions',
    label: 'Label',
    situation: 'Situation',
    moveOnCondition: 'Move-on condition',
    keywords: 'Keywords',
    text: 'Text',
    alwaysOn: 'Always include',
};

/**
 * Story drafting (spec: "Story drafting and assistant"): one play-model call turns an idea
 * into a whole Story, and one call rewrites a single field with the whole Story as context.
 * The gateway writes the UsageRecord of each call against the Story it served.
 */
function excerpt(text: string): string {
    const flat = text.replace(/\s+/g, ' ').trim();
    return flat.length > 1500 ? `${flat.slice(0, 1500)}…` : flat || '(nothing)';
}

@Injectable()
export class StoryDraftingManagerService {
    private readonly logger = new Logger(StoryDraftingManagerService.name);

    constructor(
        private readonly storyManager: StoryManagerService,
        private readonly gateway: ModelGateway,
    ) {}

    /**
     * The Story is born before the call so the call's UsageRecord can point at it, and is
     * removed again when the draft can't be used, so an unusable draft leaves nothing behind.
     */
    async draftStory(idea: string): Promise<StoryDetail> {
        if (idea.trim() === '') throw new EmptyIdeaError();
        const born = await this.storyManager.createStory({});
        let draft: DraftStory;
        let text = '';
        try {
            const result = await this.gateway.completeText({
                kind: 'story_draft',
                messages: draftMessages(idea),
                json: true,
                maxTokens: DRAFT_MAX_TOKENS,
                servedFor: { storyId: born.id },
            });
            text = result.text;
            draft = validateDraft(parseDraftJson(text));
        } catch (error) {
            await this.storyManager.deleteStory(born.id);
            if (error instanceof InvalidDraftError || error instanceof UnreadableDraftError) {
                // The text is gone with the error otherwise, and the fix is usually in the prompt.
                this.logger.warn(`${error.message} The model wrote: ${excerpt(text)}`);
            }
            throw error;
        }
        return this.fill(born.id, draft);
    }

    /** Regenerates one text field and changes nothing else. */
    async rewriteField(storyId: number, request: RewriteRequest): Promise<StoryDetail> {
        const story = await this.storyManager.getStory(storyId);
        if (!REWRITABLE_FIELDS[request.target].includes(request.field)) {
            throw new NotRewritableError(request.target, request.field);
        }
        const subject = this.subjectOf(story, request);

        const result = await this.gateway.completeText({
            kind: 'field_rewrite',
            messages: rewriteMessages(story, subject),
            maxTokens: REWRITE_MAX_TOKENS,
            servedFor: { storyId },
        });
        const text = cleanRewrite(result.text);
        if (text === '') throw new UnreadableDraftError(`The model wrote nothing for ${subject.label}.`);

        const change = { [request.field]: text };
        switch (request.target) {
            case 'story':
                return this.storyManager.updateStory(storyId, change);
            case 'role':
                return this.storyManager.updateRole(storyId, change);
            case 'character':
                return this.storyManager.updateCharacter(storyId, request.id!, change);
            case 'startingBond':
                return this.storyManager.updateStartingBond(storyId, request.id!, change);
            case 'scene':
                return this.storyManager.updateScene(storyId, request.id!, change);
        }
    }

    private subjectOf(story: StoryDetail, request: RewriteRequest): RewriteSubject {
        const fieldLabel = FIELD_LABELS[request.field] ?? request.field;
        const text = (holder: object) => String((holder as Record<string, unknown>)[request.field] ?? '');
        switch (request.target) {
            case 'story':
                return {
                    label: `the Story's ${fieldLabel}`,
                    current: request.field === 'imageStyle' ? story.style.imageStyle : text(story),
                };
            case 'role':
                return { label: `the Role's ${fieldLabel}`, current: text(story.role) };
            case 'character': {
                const character = story.characters.find((other) => other.id === request.id);
                if (!character) throw new CharacterNotFoundError();
                const who = character.name.trim() === '' ? 'the unnamed Character' : `Character ${character.name}`;
                return { label: `${who}'s ${fieldLabel}`, current: text(character) };
            }
            case 'startingBond': {
                const bond = story.startingBonds.find((other) => other.id === request.id);
                if (!bond) throw new StartingBondNotFoundError();
                const from = story.characters.find((other) => other.id === bond.fromCharacterId)?.name || 'a Character';
                const toward =
                    bond.toCharacterId === null
                        ? 'the Role'
                        : story.characters.find((other) => other.id === bond.toCharacterId)?.name || 'another Character';
                return { label: `the ${fieldLabel} of ${from}'s starting Bond toward ${toward}`, current: text(bond) };
            }
            case 'scene': {
                const scene = story.scenes.find((other) => other.id === request.id);
                if (!scene) throw new SceneNotFoundError();
                const which = scene.name.trim() === '' ? 'the unnamed Scene' : `Scene ${scene.name}`;
                return { label: `${which}'s ${fieldLabel}`, current: text(scene) };
            }
        }
    }

    /** Writes a validated draft onto a born Story through the authoring rules. */
    private async fill(storyId: number, draft: DraftStory): Promise<StoryDetail> {
        await this.storyManager.updateStory(storyId, {
            title: draft.title,
            setting: draft.setting,
            opening: draft.opening,
            ...draft.style,
        });
        await this.storyManager.updateRole(storyId, draft.role);

        const characterIds: number[] = [];
        for (const character of draft.characters) {
            const story = await this.storyManager.addCharacter(storyId, character);
            characterIds.push(story.characters[story.characters.length - 1].id);
        }
        for (const bond of draft.startingBonds) {
            await this.storyManager.addStartingBond(storyId, {
                fromCharacterId: characterIds[bond.from],
                toCharacterId: bond.toward === null ? null : characterIds[bond.toward],
                label: bond.label,
                description: bond.description,
            });
        }
        for (const scene of draft.scenes) {
            await this.storyManager.addScene(storyId, scene);
        }
        for (const entry of draft.lore) {
            await this.storyManager.addLoreEntry(storyId, entry);
        }
        return this.storyManager.getStory(storyId);
    }
}

import { Injectable, Logger } from '@nestjs/common';

import { NotAPngError } from '../../errors/character-card.errors.js';
import { CharacterNotFoundError } from '../../errors/story.errors.js';
import { StoryDetail, StoryManagerService } from '../story/story.service.js';
import { characterNameOf, greetingsOf, mapCard, storytellBlock, titleOf } from './card-mapping.js';
import { isPng, PngFormatError, replaceText } from './card-png.js';
import { CardFormat, readCard, ReadCard } from './card-reader.js';
import { writeCard } from './card-writer.js';

/** What the user sees before anything is made (spec: "API"). */
export interface CardPreview {
    format: CardFormat;
    title: string;
    characterName: string;
    creator: string;
    /** Cut to 2,000 characters. */
    creatorNotes: string;
    /** `first_mes`, then the alternate greetings, each cut to 300 characters, macros as written. */
    greetings: string[];
    /** How many Lore entries will come along. */
    loreEntries: number;
    hasPicture: boolean;
    /** The Role's name from a Storytell card's own block; null for any other card. */
    roleName: string | null;
    /** Plain lines for the "Won't come along" list. */
    leftOut: string[];
}

export const CREATOR_NOTES_MAX = 2_000;
export const GREETING_PREVIEW_MAX = 300;

/** Cut to `max` characters, the last one an ellipsis when anything was cut. */
function shortened(text: string, max: number): string {
    const trimmed = text.trim();
    return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1)}…`;
}

export interface ExportedCard {
    png: Buffer;
    /** Named after the Character. */
    fileName: string;
    /** The same, ASCII only, for a client that can't read the UTF-8 name. */
    asciiFileName: string;
}

/** The card chunks an export replaces: never two definitions in one file. */
const CARD_KEYWORDS = (keyword: string) => keyword === 'chara' || keyword === 'ccv3' || keyword.startsWith('chara-ext-asset_');

const base64Json = (value: unknown) => Buffer.from(JSON.stringify(value), 'utf8').toString('base64');

/** The Character's name as a file name, and an ASCII fallback. */
export function cardFileNames(characterName: string, characterId: number): { fileName: string; asciiFileName: string } {
    const name = characterName.trim();
    const safe = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').trim();
    const slug = name
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80)
        .replace(/-+$/, '');
    return {
        fileName: `${safe === '' ? `character-${characterId}` : safe}.png`,
        asciiFileName: `${/[a-z0-9]/.test(slug) ? slug : `character-${characterId}`}.png`,
    };
}

export interface CardImportRequest {
    roleName: string;
    /** 0 is the first message; 1..n the alternate greetings. */
    greeting: number;
}

/**
 * Character cards (spec: "Character cards"): a card file becomes a new Story by a fixed
 * mapping, with no model call. The Story is made through the Story authoring module, and
 * everything from its creation on runs inside the import's own cleanup, so a failure at any
 * step leaves no Story behind.
 */
@Injectable()
export class CharacterCardManagerService {
    private readonly logger = new Logger(CharacterCardManagerService.name);

    constructor(private readonly storyManager: StoryManagerService) {}

    /** Reads the card; refuses a file that isn't one before anything is made. */
    read(bytes: Buffer): ReadCard {
        return readCard(bytes);
    }

    /** Reads the card and says what an import would make. Writes nothing and makes no call. */
    preview(bytes: Buffer): CardPreview {
        const { format, card, picture } = this.read(bytes);
        const roleName = storytellBlock(card)?.role.name.trim() || null;
        // The name only changes what `{{user}}` reads as, not what comes along.
        const plan = mapCard(card, { roleName: roleName ?? 'You', greeting: 0 });
        return {
            format,
            title: titleOf(card),
            characterName: characterNameOf(card),
            creator: card.creator.trim(),
            creatorNotes: shortened(card.creator_notes, CREATOR_NOTES_MAX),
            greetings: greetingsOf(card).map((greeting) => shortened(greeting, GREETING_PREVIEW_MAX)),
            loreEntries: plan.lore.length,
            hasPicture: picture !== null,
            roleName,
            leftOut: plan.leftOut,
        };
    }

    async importCard(bytes: Buffer, request: CardImportRequest): Promise<StoryDetail> {
        const { card, picture } = this.read(bytes);
        const plan = mapCard(card, request);

        let storyId: number | null = null;
        try {
            storyId = (await this.storyManager.createStory({})).id;
            await this.storyManager.updateStory(storyId, plan.story);
            await this.storyManager.updateRole(storyId, plan.role);
            const withCharacter = await this.storyManager.addCharacter(storyId, plan.character);
            const characterId = withCharacter.characters[withCharacter.characters.length - 1].id;
            for (const entry of plan.lore) await this.storyManager.addLoreEntry(storyId, entry);
            if (picture) {
                // The Reference image write deletes its own file if the Character can't record it; once
                // recorded, deleting the Story deletes it.
                await this.storyManager.replaceReferenceImage(storyId, characterId, picture);
                await this.storyManager.chooseCover(storyId, { characterId });
            }
            return await this.storyManager.getStory(storyId);
        } catch (error) {
            if (storyId !== null) await this.discard(storyId);
            throw error;
        }
    }

    /**
     * The picture the web drew, with the Character's V2 (`chara`) and V3 (`ccv3`) definitions
     * written into it (spec: "Exporting a card"). No model call, nothing stored.
     */
    async exportCard(storyId: number, characterId: number, picture: Buffer): Promise<ExportedCard> {
        const story = await this.storyManager.getStory(storyId);
        const character = story.characters.find((other) => other.id === characterId);
        if (!character) throw new CharacterNotFoundError();
        if (!isPng(picture)) throw new NotAPngError();
        const { v2, v3 } = writeCard(story, character);
        let png: Buffer;
        try {
            png = replaceText(picture, CARD_KEYWORDS, [
                { keyword: 'chara', text: base64Json(v2) },
                { keyword: 'ccv3', text: base64Json(v3) },
            ]);
        } catch (error) {
            if (error instanceof PngFormatError) throw new NotAPngError();
            throw error;
        }
        return { png, ...cardFileNames(character.name, character.id) };
    }

    /** Deletes a half-made Story, with any files it records; a failure here is logged, the import's own error is what answers. */
    private async discard(storyId: number): Promise<void> {
        try {
            await this.storyManager.deleteStory(storyId);
        } catch (error) {
            this.logger.error(`Could not delete the half-made Story ${storyId}: ${error instanceof Error ? error.message : error}`);
        }
    }
}

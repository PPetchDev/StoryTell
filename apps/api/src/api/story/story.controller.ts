import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    Param,
    ParseArrayPipe,
    ParseIntPipe,
    Patch,
    Post,
    Put,
} from '@nestjs/common';
import { ApiBody, ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { StoryManagerService } from '../../manager/story/story.service.js';
import { untaggedPartResponse } from '../../model/chat/entities/message-part.entity.js';
import {
    CharacterOrderRequestBodyDTO,
    CharacterRequestBodyDTO,
    LoreEntryRequestBodyDTO,
    NewStartingBondRequestBodyDTO,
    RoleRequestBodyDTO,
    SceneBondGateRequestDTO,
    SceneOrderRequestBodyDTO,
    SceneRequestBodyDTO,
    StartingBeliefsRequestBodyDTO,
    StartingBondRequestBodyDTO,
    StoryRequestBodyDTO,
    SuddenEventRequestBodyDTO,
    EndingRequestBodyDTO,
    CreateLoreSetRequestBodyDTO,
    LinkLoreSetsRequestBodyDTO,
    RenameLoreSetRequestBodyDTO,
} from './dto/story.request.dto.js';
import { OpeningPreviewResponseBodyDTO } from './dto/opening.response.dto.js';
import { ListStoriesResponseBodyDTO, StoryResponseBodyDTO } from './dto/story.response.dto.js';

const Id = (name: string) => Param(name, ParseIntPipe);

/**
 * Stories with their nested Role, Characters, StartingBonds, Scenes and Lore (spec: "API surface").
 * Every write answers with the whole Story and its playable status.
 */
@ApiTags('Stories')
@Controller('stories')
export class StoryApiController {
    constructor(private readonly storyManager: StoryManagerService) {}

    @Get()
    @ApiOkResponse({ type: ListStoriesResponseBodyDTO })
    async list(): Promise<ListStoriesResponseBodyDTO> {
        return { stories: await this.storyManager.listStories() };
    }

    @Post()
    @ApiCreatedResponse({ type: StoryResponseBodyDTO })
    create(@Body() body: StoryRequestBodyDTO): Promise<StoryResponseBodyDTO> {
        return this.storyManager.createStory(body);
    }

    @Get(':storyId')
    @ApiOkResponse({ type: StoryResponseBodyDTO })
    get(@Id('storyId') storyId: number): Promise<StoryResponseBodyDTO> {
        return this.storyManager.getStory(storyId);
    }

    @Get(':storyId/opening')
    @ApiOkResponse({ type: OpeningPreviewResponseBodyDTO })
    async openingPreview(@Id('storyId') storyId: number): Promise<OpeningPreviewResponseBodyDTO> {
        return { parts: (await this.storyManager.openingParts(storyId)).map(untaggedPartResponse) };
    }

    @Patch(':storyId')
    @ApiOkResponse({ type: StoryResponseBodyDTO })
    update(
        @Id('storyId') storyId: number,
        @Body() body: StoryRequestBodyDTO,
    ): Promise<StoryResponseBodyDTO> {
        return this.storyManager.updateStory(storyId, body);
    }

    @Post(':storyId/duplicate')
    @ApiCreatedResponse({
        type: StoryResponseBodyDTO,
        description:
            'The new Story, "<title> (copy)", with everything the author wrote and its own copies of the image files. ' +
            'Chats and Snapshots are not copied, so a Cover that is a Snapshot is dropped.',
    })
    duplicate(@Id('storyId') storyId: number): Promise<StoryResponseBodyDTO> {
        return this.storyManager.duplicateStory(storyId);
    }

    @Delete(':storyId')
    @HttpCode(204)
    @ApiNoContentResponse({ description: 'The Story and everything under it are gone.' })
    remove(@Id('storyId') storyId: number): Promise<void> {
        return this.storyManager.deleteStory(storyId);
    }

    @Patch(':storyId/role')
    @ApiOkResponse({ type: StoryResponseBodyDTO })
    updateRole(
        @Id('storyId') storyId: number,
        @Body() body: RoleRequestBodyDTO,
    ): Promise<StoryResponseBodyDTO> {
        return this.storyManager.updateRole(storyId, body);
    }

    @Post(':storyId/characters')
    @ApiCreatedResponse({ type: StoryResponseBodyDTO })
    addCharacter(
        @Id('storyId') storyId: number,
        @Body() body: CharacterRequestBodyDTO,
    ): Promise<StoryResponseBodyDTO> {
        return this.storyManager.addCharacter(storyId, body);
    }

    @Put(':storyId/characters/order')
    @ApiOkResponse({ type: StoryResponseBodyDTO })
    reorderCharacters(
        @Id('storyId') storyId: number,
        @Body() body: CharacterOrderRequestBodyDTO,
    ): Promise<StoryResponseBodyDTO> {
        return this.storyManager.reorderCharacters(storyId, body.characterIds);
    }

    @Patch(':storyId/characters/:characterId')
    @ApiOkResponse({ type: StoryResponseBodyDTO })
    updateCharacter(
        @Id('storyId') storyId: number,
        @Id('characterId') characterId: number,
        @Body() body: CharacterRequestBodyDTO,
    ): Promise<StoryResponseBodyDTO> {
        return this.storyManager.updateCharacter(storyId, characterId, body);
    }

    @Delete(':storyId/characters/:characterId')
    @ApiOkResponse({ type: StoryResponseBodyDTO })
    removeCharacter(
        @Id('storyId') storyId: number,
        @Id('characterId') characterId: number,
    ): Promise<StoryResponseBodyDTO> {
        return this.storyManager.removeCharacter(storyId, characterId);
    }

    @Post(':storyId/starting-bonds')
    @ApiCreatedResponse({ type: StoryResponseBodyDTO })
    addStartingBond(
        @Id('storyId') storyId: number,
        @Body() body: NewStartingBondRequestBodyDTO,
    ): Promise<StoryResponseBodyDTO> {
        return this.storyManager.addStartingBond(storyId, body);
    }

    @Patch(':storyId/starting-bonds/:bondId')
    @ApiOkResponse({ type: StoryResponseBodyDTO })
    updateStartingBond(
        @Id('storyId') storyId: number,
        @Id('bondId') bondId: number,
        @Body() body: StartingBondRequestBodyDTO,
    ): Promise<StoryResponseBodyDTO> {
        return this.storyManager.updateStartingBond(storyId, bondId, body);
    }

    @Delete(':storyId/starting-bonds/:bondId')
    @ApiOkResponse({ type: StoryResponseBodyDTO })
    removeStartingBond(
        @Id('storyId') storyId: number,
        @Id('bondId') bondId: number,
    ): Promise<StoryResponseBodyDTO> {
        return this.storyManager.removeStartingBond(storyId, bondId);
    }

    /** The whole list of Starting Beliefs (.scratch/memory-by-meaning/spec.md): it replaces the Story's, and answers the Story. */
    @Put(':storyId/starting-beliefs')
    @ApiOkResponse({ type: StoryResponseBodyDTO })
    setStartingBeliefs(@Id('storyId') storyId: number, @Body() body: StartingBeliefsRequestBodyDTO): Promise<StoryResponseBodyDTO> {
        return this.storyManager.setStartingBeliefs(storyId, body.startingBeliefs);
    }

    @Post(':storyId/scenes')
    @ApiCreatedResponse({ type: StoryResponseBodyDTO })
    addScene(
        @Id('storyId') storyId: number,
        @Body() body: SceneRequestBodyDTO,
    ): Promise<StoryResponseBodyDTO> {
        return this.storyManager.addScene(storyId, body);
    }

    @Put(':storyId/scenes/order')
    @ApiOkResponse({ type: StoryResponseBodyDTO })
    reorderScenes(
        @Id('storyId') storyId: number,
        @Body() body: SceneOrderRequestBodyDTO,
    ): Promise<StoryResponseBodyDTO> {
        return this.storyManager.reorderScenes(storyId, body.sceneIds);
    }

    @Patch(':storyId/scenes/:sceneId')
    @ApiOkResponse({ type: StoryResponseBodyDTO })
    updateScene(
        @Id('storyId') storyId: number,
        @Id('sceneId') sceneId: number,
        @Body() body: SceneRequestBodyDTO,
    ): Promise<StoryResponseBodyDTO> {
        return this.storyManager.updateScene(storyId, sceneId, body);
    }

    /** A Scene's Bond gates, replaced by the whole list sent (.scratch/bond-axes/spec.md, "API"). */
    @Put(':storyId/scenes/:sceneId/gates')
    @ApiBody({ type: [SceneBondGateRequestDTO] })
    @ApiOkResponse({ type: StoryResponseBodyDTO })
    setSceneGates(
        @Id('storyId') storyId: number,
        @Id('sceneId') sceneId: number,
        @Body(new ParseArrayPipe({ items: SceneBondGateRequestDTO, whitelist: true })) body: SceneBondGateRequestDTO[],
    ): Promise<StoryResponseBodyDTO> {
        return this.storyManager.setSceneGates(storyId, sceneId, body);
    }

    @Delete(':storyId/scenes/:sceneId')
    @ApiOkResponse({ type: StoryResponseBodyDTO })
    removeScene(
        @Id('storyId') storyId: number,
        @Id('sceneId') sceneId: number,
    ): Promise<StoryResponseBodyDTO> {
        return this.storyManager.removeScene(storyId, sceneId);
    }

    /** .scratch/sudden-events/spec.md: a Story's Sudden events. */
    @Post(':storyId/sudden-events')
    @ApiCreatedResponse({ type: StoryResponseBodyDTO })
    addSuddenEvent(@Id('storyId') storyId: number, @Body() body: SuddenEventRequestBodyDTO): Promise<StoryResponseBodyDTO> {
        return this.storyManager.addSuddenEvent(storyId, body);
    }

    @Patch(':storyId/sudden-events/:eventId')
    @ApiOkResponse({ type: StoryResponseBodyDTO })
    updateSuddenEvent(
        @Id('storyId') storyId: number,
        @Id('eventId') eventId: number,
        @Body() body: SuddenEventRequestBodyDTO,
    ): Promise<StoryResponseBodyDTO> {
        return this.storyManager.updateSuddenEvent(storyId, eventId, body);
    }

    @Delete(':storyId/sudden-events/:eventId')
    @ApiOkResponse({ type: StoryResponseBodyDTO })
    removeSuddenEvent(@Id('storyId') storyId: number, @Id('eventId') eventId: number): Promise<StoryResponseBodyDTO> {
        return this.storyManager.removeSuddenEvent(storyId, eventId);
    }

    /**
     * .scratch/shared-lore/spec.md: the Lore sets a Story links. A set is the Account's, shared by
     * every Story that links it, and is changed only through one of those Stories; each write
     * answers with this whole Story.
     */
    @Post(':storyId/lore-sets')
    @ApiCreatedResponse({ type: StoryResponseBodyDTO, description: 'A new Lore set, linked to this Story last.' })
    createLoreSet(@Id('storyId') storyId: number, @Body() body: CreateLoreSetRequestBodyDTO): Promise<StoryResponseBodyDTO> {
        return this.storyManager.createLoreSet(storyId, body);
    }

    @Put(':storyId/lore-sets')
    @ApiOkResponse({ type: StoryResponseBodyDTO, description: 'The Story links exactly these sets, in this order. A set left out is unlinked, not deleted.' })
    linkLoreSets(@Id('storyId') storyId: number, @Body() body: LinkLoreSetsRequestBodyDTO): Promise<StoryResponseBodyDTO> {
        return this.storyManager.linkLoreSets(storyId, body.loreSetIds);
    }

    @Patch(':storyId/lore-sets/:setId')
    @ApiOkResponse({ type: StoryResponseBodyDTO })
    renameLoreSet(@Id('storyId') storyId: number, @Id('setId') setId: number, @Body() body: RenameLoreSetRequestBodyDTO): Promise<StoryResponseBodyDTO> {
        return this.storyManager.renameLoreSet(storyId, setId, body.name);
    }

    @Delete(':storyId/lore-sets/:setId')
    @ApiOkResponse({ type: StoryResponseBodyDTO, description: 'The set is deleted for good, with its entries, from every Story that linked it.' })
    deleteLoreSet(@Id('storyId') storyId: number, @Id('setId') setId: number): Promise<StoryResponseBodyDTO> {
        return this.storyManager.deleteLoreSet(storyId, setId);
    }

    @Post(':storyId/lore-sets/:setId/entries')
    @ApiCreatedResponse({ type: StoryResponseBodyDTO })
    addLoreSetEntry(@Id('storyId') storyId: number, @Id('setId') setId: number, @Body() body: LoreEntryRequestBodyDTO): Promise<StoryResponseBodyDTO> {
        return this.storyManager.addLoreSetEntry(storyId, setId, body);
    }

    @Patch(':storyId/lore-sets/:setId/entries/:entryId')
    @ApiOkResponse({ type: StoryResponseBodyDTO })
    updateLoreSetEntry(
        @Id('storyId') storyId: number,
        @Id('setId') setId: number,
        @Id('entryId') entryId: number,
        @Body() body: LoreEntryRequestBodyDTO,
    ): Promise<StoryResponseBodyDTO> {
        return this.storyManager.updateLoreSetEntry(storyId, setId, entryId, body);
    }

    @Delete(':storyId/lore-sets/:setId/entries/:entryId')
    @ApiOkResponse({ type: StoryResponseBodyDTO })
    removeLoreSetEntry(@Id('storyId') storyId: number, @Id('setId') setId: number, @Id('entryId') entryId: number): Promise<StoryResponseBodyDTO> {
        return this.storyManager.removeLoreSetEntry(storyId, setId, entryId);
    }

    /** .scratch/endings/spec.md: a Story's Endings. */
    @Post(':storyId/endings')
    @ApiCreatedResponse({ type: StoryResponseBodyDTO })
    addEnding(@Id('storyId') storyId: number, @Body() body: EndingRequestBodyDTO): Promise<StoryResponseBodyDTO> {
        return this.storyManager.addEnding(storyId, body);
    }

    @Patch(':storyId/endings/:endingId')
    @ApiOkResponse({ type: StoryResponseBodyDTO })
    updateEnding(@Id('storyId') storyId: number, @Id('endingId') endingId: number, @Body() body: EndingRequestBodyDTO): Promise<StoryResponseBodyDTO> {
        return this.storyManager.updateEnding(storyId, endingId, body);
    }

    @Delete(':storyId/endings/:endingId')
    @ApiOkResponse({ type: StoryResponseBodyDTO })
    removeEnding(@Id('storyId') storyId: number, @Id('endingId') endingId: number): Promise<StoryResponseBodyDTO> {
        return this.storyManager.removeEnding(storyId, endingId);
    }

    @Post(':storyId/lore')
    @ApiCreatedResponse({ type: StoryResponseBodyDTO })
    addLoreEntry(@Id('storyId') storyId: number, @Body() body: LoreEntryRequestBodyDTO): Promise<StoryResponseBodyDTO> {
        return this.storyManager.addLoreEntry(storyId, body);
    }

    @Patch(':storyId/lore/:loreId')
    @ApiOkResponse({ type: StoryResponseBodyDTO })
    updateLoreEntry(
        @Id('storyId') storyId: number,
        @Id('loreId') loreId: number,
        @Body() body: LoreEntryRequestBodyDTO,
    ): Promise<StoryResponseBodyDTO> {
        return this.storyManager.updateLoreEntry(storyId, loreId, body);
    }

    @Delete(':storyId/lore/:loreId')
    @ApiOkResponse({ type: StoryResponseBodyDTO })
    removeLoreEntry(@Id('storyId') storyId: number, @Id('loreId') loreId: number): Promise<StoryResponseBodyDTO> {
        return this.storyManager.removeLoreEntry(storyId, loreId);
    }
}

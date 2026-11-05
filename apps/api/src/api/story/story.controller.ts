import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    Param,
    ParseIntPipe,
    Patch,
    Post,
    Put,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { StoryManagerService } from '../../manager/story/story.service.js';
import {
    CharacterOrderRequestBodyDTO,
    CharacterRequestBodyDTO,
    NewStartingBondRequestBodyDTO,
    RoleRequestBodyDTO,
    SceneOrderRequestBodyDTO,
    SceneRequestBodyDTO,
    StartingBondRequestBodyDTO,
    StoryRequestBodyDTO,
} from './dto/story.request.dto.js';
import { OpeningPreviewResponseBodyDTO } from './dto/opening.response.dto.js';
import { ListStoriesResponseBodyDTO, StoryResponseBodyDTO } from './dto/story.response.dto.js';

const Id = (name: string) => Param(name, ParseIntPipe);

/**
 * Stories with their nested Role, Characters, StartingBonds and Scenes (spec: "API surface").
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
        return { parts: await this.storyManager.openingParts(storyId) };
    }

    @Patch(':storyId')
    @ApiOkResponse({ type: StoryResponseBodyDTO })
    update(
        @Id('storyId') storyId: number,
        @Body() body: StoryRequestBodyDTO,
    ): Promise<StoryResponseBodyDTO> {
        return this.storyManager.updateStory(storyId, body);
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

    @Delete(':storyId/scenes/:sceneId')
    @ApiOkResponse({ type: StoryResponseBodyDTO })
    removeScene(
        @Id('storyId') storyId: number,
        @Id('sceneId') sceneId: number,
    ): Promise<StoryResponseBodyDTO> {
        return this.storyManager.removeScene(storyId, sceneId);
    }
}

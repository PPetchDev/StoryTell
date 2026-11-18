import { Body, Controller, Delete, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { CharacterSecretsManagerService } from '../../manager/story/character-secrets.service.js';
import { CharacterSecretRequestBodyDTO } from './dto/character-secret.dto.js';
import { StoryResponseBodyDTO } from './dto/story.response.dto.js';

const Id = (name: string) => Param(name, ParseIntPipe);

/** A Character's Secrets one by one (.scratch/secret-reveals/spec.md, "API"). Each answers the Story. */
@ApiTags('Stories')
@Controller('stories/:storyId/characters/:characterId/secrets')
export class CharacterSecretsApiController {
    constructor(private readonly secrets: CharacterSecretsManagerService) {}

    @Post()
    @ApiCreatedResponse({ type: StoryResponseBodyDTO })
    add(@Id('storyId') storyId: number, @Id('characterId') characterId: number): Promise<StoryResponseBodyDTO> {
        return this.secrets.add(storyId, characterId);
    }

    @Patch(':secretId')
    @ApiOkResponse({ type: StoryResponseBodyDTO })
    update(
        @Id('storyId') storyId: number,
        @Id('characterId') characterId: number,
        @Id('secretId') secretId: number,
        @Body() body: CharacterSecretRequestBodyDTO,
    ): Promise<StoryResponseBodyDTO> {
        return this.secrets.update(storyId, characterId, secretId, body);
    }

    @Delete(':secretId')
    @ApiOkResponse({ type: StoryResponseBodyDTO })
    remove(@Id('storyId') storyId: number, @Id('characterId') characterId: number, @Id('secretId') secretId: number): Promise<StoryResponseBodyDTO> {
        return this.secrets.remove(storyId, characterId, secretId);
    }
}

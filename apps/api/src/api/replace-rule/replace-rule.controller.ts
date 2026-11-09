import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Put } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { ReplaceRuleManagerService } from '../../manager/replace-rule/replace-rule.service.js';
import { StoryResponseBodyDTO } from '../story/dto/story.response.dto.js';
import {
    CreateReplaceRuleRequestBodyDTO,
    ReplaceRuleOrderRequestBodyDTO,
    UpdateReplaceRuleRequestBodyDTO,
} from './dto/replace-rule.request.dto.js';
import { ListReplaceRulesResponseBodyDTO } from './dto/replace-rule.response.dto.js';

const Id = (name: string) => Param(name, ParseIntPipe);

/** App-wide Replace rules (.scratch/saved-replies-and-replace-rules/spec.md). Each answers the app-wide list. */
@ApiTags('Replace rules')
@Controller('replace-rules')
export class ReplaceRuleApiController {
    constructor(private readonly rules: ReplaceRuleManagerService) {}

    @Get()
    @ApiOkResponse({ type: ListReplaceRulesResponseBodyDTO })
    async list(): Promise<ListReplaceRulesResponseBodyDTO> {
        return { replaceRules: await this.rules.listAppWide() };
    }

    @Post()
    @ApiCreatedResponse({ type: ListReplaceRulesResponseBodyDTO })
    async add(@Body() body: CreateReplaceRuleRequestBodyDTO): Promise<ListReplaceRulesResponseBodyDTO> {
        return { replaceRules: await this.rules.addAppWide(body) };
    }

    // Before `:ruleId`, so "order" is never read as an id.
    @Put('order')
    @ApiOkResponse({ type: ListReplaceRulesResponseBodyDTO })
    async reorder(@Body() body: ReplaceRuleOrderRequestBodyDTO): Promise<ListReplaceRulesResponseBodyDTO> {
        return { replaceRules: await this.rules.reorderAppWide(body.ids) };
    }

    @Patch(':ruleId')
    @ApiOkResponse({ type: ListReplaceRulesResponseBodyDTO })
    async update(@Id('ruleId') id: number, @Body() body: UpdateReplaceRuleRequestBodyDTO): Promise<ListReplaceRulesResponseBodyDTO> {
        return { replaceRules: await this.rules.updateAppWide(id, body) };
    }

    @Delete(':ruleId')
    @ApiOkResponse({ type: ListReplaceRulesResponseBodyDTO })
    async remove(@Id('ruleId') id: number): Promise<ListReplaceRulesResponseBodyDTO> {
        return { replaceRules: await this.rules.removeAppWide(id) };
    }
}

/** A Story's own Replace rules, like Lore: each answers the whole Story. */
@ApiTags('Replace rules')
@Controller('stories/:storyId/replace-rules')
export class StoryReplaceRuleApiController {
    constructor(private readonly rules: ReplaceRuleManagerService) {}

    @Post()
    @ApiCreatedResponse({ type: StoryResponseBodyDTO })
    add(@Id('storyId') storyId: number, @Body() body: CreateReplaceRuleRequestBodyDTO): Promise<StoryResponseBodyDTO> {
        return this.rules.addToStory(storyId, body);
    }

    @Put('order')
    @ApiOkResponse({ type: StoryResponseBodyDTO })
    reorder(@Id('storyId') storyId: number, @Body() body: ReplaceRuleOrderRequestBodyDTO): Promise<StoryResponseBodyDTO> {
        return this.rules.reorderInStory(storyId, body.ids);
    }

    @Patch(':ruleId')
    @ApiOkResponse({ type: StoryResponseBodyDTO })
    update(
        @Id('storyId') storyId: number,
        @Id('ruleId') id: number,
        @Body() body: UpdateReplaceRuleRequestBodyDTO,
    ): Promise<StoryResponseBodyDTO> {
        return this.rules.updateInStory(storyId, id, body);
    }

    @Delete(':ruleId')
    @ApiOkResponse({ type: StoryResponseBodyDTO })
    remove(@Id('storyId') storyId: number, @Id('ruleId') id: number): Promise<StoryResponseBodyDTO> {
        return this.rules.removeFromStory(storyId, id);
    }
}

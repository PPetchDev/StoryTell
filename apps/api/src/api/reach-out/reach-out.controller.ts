import { Body, Controller, Get, Param, ParseIntPipe, Put } from '@nestjs/common';
import { ApiOkResponse, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

import { REACH_OUT_HOURS, ReachOutHours } from '../../model/chat/entities/chat-reach-out.entity.js';
import { ReachOutSettingsManagerService } from '../../manager/reach-out/reach-out-settings.service.js';

const Id = (name: string) => Param(name, ParseIntPipe);

export class ReachOutSettingDTO {
    @ApiProperty({
        type: Number,
        enum: [...REACH_OUT_HOURS],
        nullable: true,
        description: 'Hours away before a Character messages the user first; null while off (the default).',
    })
    @IsIn([...REACH_OUT_HOURS, null])
    afterHours: ReachOutHours | null;
}

/** A Chat's "Characters message first" (.scratch/reach-outs/spec.md, "The setting"). */
@ApiTags('Chats')
@Controller('stories/:storyId/chats/:chatId/reach-out')
export class ReachOutApiController {
    constructor(private readonly settings: ReachOutSettingsManagerService) {}

    @Get()
    @ApiOkResponse({ type: ReachOutSettingDTO })
    get(@Id('storyId') storyId: number, @Id('chatId') chatId: number): Promise<ReachOutSettingDTO> {
        return this.settings.get(storyId, chatId);
    }

    @Put()
    @ApiOkResponse({ type: ReachOutSettingDTO })
    set(@Id('storyId') storyId: number, @Id('chatId') chatId: number, @Body() body: ReachOutSettingDTO): Promise<ReachOutSettingDTO> {
        return this.settings.set(storyId, chatId, body.afterHours);
    }
}

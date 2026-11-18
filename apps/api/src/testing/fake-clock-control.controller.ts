import { Body, Controller, HttpCode, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { DataSource } from 'typeorm';

import { Public } from '../api/auth/public.decorator.js';

/**
 * Test-only (fake gateway): moves a Chat's Messages into the past, so e2e can come back to a Chat
 * "after a while away" ("Previously on…", .scratch/previously-on/spec.md) without waiting.
 */
@ApiExcludeController()
@Public()
@Controller('testing/chats')
export class FakeClockControlController {
    constructor(private readonly dataSource: DataSource) {}

    @Post(':chatId/age')
    @HttpCode(204)
    async age(@Param('chatId', ParseIntPipe) chatId: number, @Body() body: { hours?: number }): Promise<void> {
        const hours = Number(body.hours ?? 0);
        await this.dataSource.query(`UPDATE "message" SET "created_at" = "created_at" - make_interval(secs => $2) WHERE "chat_id" = $1`, [chatId, hours * 3600]);
    }
}

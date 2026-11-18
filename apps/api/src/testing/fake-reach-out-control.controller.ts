import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

import { Public } from '../api/auth/public.decorator.js';
import { ReachOutSchedulerService, SentReachOut } from '../manager/reach-out/reach-out-scheduler.service.js';

/**
 * E2E's handle on the Reach-out scheduler (.scratch/reach-outs/spec.md): one tick as if it were
 * `now`. Mounted only with the fake model gateway.
 */
@ApiExcludeController()
@Public()
@Controller('testing/reach-outs')
export class FakeReachOutControlController {
    constructor(private readonly scheduler: ReachOutSchedulerService) {}

    @Post('tick')
    @HttpCode(200)
    async tick(@Body() body: { now?: string } | undefined): Promise<{ sent: SentReachOut[] }> {
        const now = body?.now ? new Date(body.now) : new Date();
        if (Number.isNaN(now.getTime())) return { sent: [] };
        return { sent: await this.scheduler.tick(now) };
    }
}

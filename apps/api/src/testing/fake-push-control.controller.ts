import { Controller, Delete, Get, HttpCode } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

import { Public } from '../api/auth/public.decorator.js';
import { FakePushSend, FakePushSender } from '../service/push/fake-push-sender.js';

/** E2E's view of the alerts the fake push sender recorded. Mounted only with the fake model gateway. */
@ApiExcludeController()
@Public()
@Controller('testing/push')
export class FakePushControlController {
    constructor(private readonly sender: FakePushSender) {}

    @Get()
    sends(): { sends: FakePushSend[] } {
        return { sends: this.sender.sends };
    }

    @Delete()
    @HttpCode(204)
    reset(): void {
        this.sender.reset();
    }
}

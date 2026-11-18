import { Body, Controller, Delete, Get, HttpCode, Put } from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { PushAlertsManagerService } from '../../manager/push/push-alerts.service.js';
import { PushConfigResponseBodyDTO, PushSubscriptionRequestBodyDTO, PushUnsubscribeRequestBodyDTO } from './dto/push.dto.js';

/** Reply alerts (.scratch/push-alerts/spec.md: "API"). */
@ApiTags('Alerts')
@Controller('push')
export class PushApiController {
    constructor(private readonly alerts: PushAlertsManagerService) {}

    @Get()
    @ApiOkResponse({ type: PushConfigResponseBodyDTO })
    config(): PushConfigResponseBodyDTO {
        return { publicKey: this.alerts.publicKey() };
    }

    /** This device's subscription, for the signed-in Account. */
    @Put('subscription')
    @HttpCode(204)
    @ApiNoContentResponse()
    async subscribe(@Body() body: PushSubscriptionRequestBodyDTO): Promise<void> {
        await this.alerts.subscribe({ endpoint: body.endpoint, p256dh: body.keys.p256dh, auth: body.keys.auth });
    }

    @Delete('subscription')
    @HttpCode(204)
    @ApiNoContentResponse()
    async unsubscribe(@Body() body: PushUnsubscribeRequestBodyDTO): Promise<void> {
        await this.alerts.unsubscribe(body.endpoint);
    }
}

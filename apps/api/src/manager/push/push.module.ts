import { Global, Module } from '@nestjs/common';

import { PushSubscriptionModelModule } from '../../model/push/push.module.js';
import { PushAlertsManagerService } from './push-alerts.service.js';

/** Global, so the turn and the Snapshot can send an alert without their modules importing this one. */
@Global()
@Module({
    imports: [PushSubscriptionModelModule],
    providers: [PushAlertsManagerService],
    exports: [PushAlertsManagerService],
})
export class PushAlertsManagerModule {}

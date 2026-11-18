import { Global, Module } from '@nestjs/common';

import { AppConfig } from '../../config/app-config.js';
import { FakePushSender } from './fake-push-sender.js';
import { PushSender } from './push-sender.js';
import { WebPushSender } from './web-push-sender.js';

/**
 * The push sender (.scratch/push-alerts/spec.md: "Sending"): Web Push for real, the recorder with
 * the fake model gateway, so tests and e2e never reach a push service. With no VAPID keys alerts are
 * off, and the recorder stands in so nothing is sent.
 */
@Global()
@Module({
    providers: [
        { provide: FakePushSender, useValue: new FakePushSender() },
        {
            provide: PushSender,
            inject: [AppConfig, FakePushSender],
            useFactory: (config: AppConfig, fake: FakePushSender): PushSender =>
                config.modelGateway === 'fake' || !config.vapid ? fake : new WebPushSender(config.vapid),
        },
    ],
    exports: [PushSender, FakePushSender],
})
export class PushSenderModule {}

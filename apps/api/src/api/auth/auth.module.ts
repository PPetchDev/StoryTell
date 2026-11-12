import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { AuthApiController } from './auth.controller.js';
import { SignInGuard } from './sign-in.guard.js';
import { SignInService } from './sign-in.service.js';

/** .scratch/sign-in/spec.md. The guard covers every route of the app. */
@Module({
    controllers: [AuthApiController],
    providers: [SignInService, { provide: APP_GUARD, useClass: SignInGuard }],
})
export class AuthApiModule {}

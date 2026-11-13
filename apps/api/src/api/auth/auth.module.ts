import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';

import { AuthApiController } from './auth.controller.js';
import { AccountScopeInterceptor, SignInGuard } from './sign-in.guard.js';
import { SignInService } from './sign-in.service.js';
import { AUTH_FETCH, SupabaseTokenVerifier } from './supabase-token.js';

/** .scratch/sign-in/spec.md, .scratch/accounts/spec.md. The guard covers every route of the app; the interceptor runs each as its Account. */
@Module({
    controllers: [AuthApiController],
    providers: [
        SignInService,
        SupabaseTokenVerifier,
        { provide: AUTH_FETCH, useValue: (url: string, init: RequestInit) => fetch(url, init) },
        { provide: APP_GUARD, useClass: SignInGuard },
        { provide: APP_INTERCEPTOR, useClass: AccountScopeInterceptor },
    ],
    exports: [SignInService],
})
export class AuthApiModule {}

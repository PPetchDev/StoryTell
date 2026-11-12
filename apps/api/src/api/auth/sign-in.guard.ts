import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';

import { SignInRequiredError } from '../../errors/auth.errors.js';
import { PUBLIC_ROUTE } from './public.decorator.js';
import { readCookies, SESSION_COOKIE, sessionSetCookie } from './session.js';
import { SignInService } from './sign-in.service.js';

/** Whether the request reached us over HTTPS, directly or as the proxy in front says. */
export function overHttps(request: Request): boolean {
    const forwarded = request.headers['x-forwarded-proto'];
    const proto = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim();
    return request.secure || proto === 'https';
}

/** Spec: "Guard". Every route needs a valid session while sign-in is on, but the public ones. */
@Injectable()
export class SignInGuard implements CanActivate {
    constructor(
        private readonly signIn: SignInService,
        private readonly reflector: Reflector,
    ) {}

    canActivate(context: ExecutionContext): boolean {
        if (!this.signIn.required || context.getType() !== 'http') return true;
        if (this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [context.getHandler(), context.getClass()])) return true;
        const request = context.switchToHttp().getRequest<Request>();
        const session = this.signIn.check(readCookies(request.headers.cookie, SESSION_COOKIE));
        if (!session.valid) throw new SignInRequiredError();
        if (session.renewed) {
            context.switchToHttp().getResponse<Response>().append('Set-Cookie', sessionSetCookie(session.renewed, overHttps(request)));
        }
        return true;
    }
}

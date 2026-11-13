import { CallHandler, CanActivate, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';

import { OwnerOnlyError, SignInRequiredError } from '../../errors/auth.errors.js';
import { AccountEntity, AccountRole } from '../../model/account/entities/account.entity.js';
import { requestScope } from '../../model/account/request-scope.js';
import { OWNER_ONLY_ROUTE, PUBLIC_ROUTE } from './public.decorator.js';
import { readCookies, SESSION_COOKIE, sessionSetCookie } from './session.js';
import { SignInService } from './sign-in.service.js';

/** A request with the Account the sign-in guard found for it. */
export type AccountRequest = Request & { account?: AccountEntity };

/** Whether the request reached us over HTTPS, directly or as the proxy in front says. */
export function overHttps(request: Request): boolean {
    const forwarded = request.headers['x-forwarded-proto'];
    const proto = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim();
    return request.secure || proto === 'https';
}

/**
 * Spec: "Guard" and "Current Account". Every route needs a session naming an active Account while
 * sign-in is on, but the public ones; with sign-in off every request is the Owner. The Account
 * goes on the request for the scope interceptor.
 */
@Injectable()
export class SignInGuard implements CanActivate {
    constructor(
        private readonly signIn: SignInService,
        private readonly reflector: Reflector,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        if (context.getType() !== 'http') return true;
        const request = context.switchToHttp().getRequest<AccountRequest>();
        const session = await this.signIn.check(readCookies(request.headers.cookie, SESSION_COOKIE));
        if (session.account) request.account = session.account;
        if (this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [context.getHandler(), context.getClass()])) return true;
        if (!session.account) throw new SignInRequiredError();
        const ownerOnly = this.reflector.getAllAndOverride<boolean>(OWNER_ONLY_ROUTE, [context.getHandler(), context.getClass()]);
        if (ownerOnly && session.account.role !== AccountRole.Owner) throw new OwnerOnlyError();
        if (session.renewed) {
            context.switchToHttp().getResponse<Response>().append('Set-Cookie', sessionSetCookie(session.renewed, overHttps(request)));
        }
        return true;
    }
}

/**
 * Runs the handler, and everything it starts, inside a scope holding the request's Account
 * (.scratch/accounts/spec.md: "Current Account"). A request with none (a public route without a
 * session) runs outside any scope.
 */
@Injectable()
export class AccountScopeInterceptor implements NestInterceptor {
    intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
        const account = context.getType() === 'http' ? context.switchToHttp().getRequest<AccountRequest>().account : undefined;
        if (!account) return next.handle();
        return new Observable((subscriber) => requestScope.run({ account }, () => next.handle().subscribe(subscriber)));
    }
}

import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';

import { AppConfig } from '../../config/app-config.js';
import { GetSignInStatusResponseBodyDTO, SignInRequestBodyDTO, SupabaseSignInRequestBodyDTO } from './dto/sign-in.dto.js';
import { Public } from './public.decorator.js';
import { sessionSetCookie } from './session.js';
import type { AccountRequest } from './sign-in.guard.js';
import { overHttps } from './sign-in.guard.js';
import { SignInService } from './sign-in.service.js';
import { SupabaseTokenVerifier } from './supabase-token.js';

/** .scratch/sign-in/spec.md: "API"; .scratch/accounts/spec.md: "Supabase sign-in". */
@ApiTags('Sign-in')
@Public()
@Controller('auth')
export class AuthApiController {
    constructor(
        private readonly signIn: SignInService,
        private readonly supabase: SupabaseTokenVerifier,
        private readonly config: AppConfig,
    ) {}

    @Get('status')
    @ApiOkResponse({ type: GetSignInStatusResponseBodyDTO })
    status(@Req() request: AccountRequest): GetSignInStatusResponseBodyDTO {
        // The guard read the session already, public route or not.
        const account = request.account;
        return {
            required: this.signIn.required,
            signedIn: account !== undefined,
            account: account ? { id: account.id, email: account.email, role: account.role } : null,
            methods: {
                password: this.config.loginPassword !== undefined,
                // Public by design: the web app signs in with them (docs/adr/0005).
                supabase:
                    this.config.supabaseUrl !== undefined && this.config.supabaseAnonKey !== undefined
                        ? { url: this.config.supabaseUrl, anonKey: this.config.supabaseAnonKey }
                        : null,
            },
        };
    }

    @Post('login')
    @HttpCode(204)
    @ApiNoContentResponse({ description: 'Signed in: the session cookie is set.' })
    login(@Body() body: SignInRequestBodyDTO, @Req() request: Request, @Res({ passthrough: true }) response: Response): void {
        const session = this.signIn.signInOwner(body.password);
        if (session !== null) response.append('Set-Cookie', sessionSetCookie(session, overHttps(request)));
    }

    @Post('supabase')
    @HttpCode(204)
    @ApiNoContentResponse({ description: 'Signed in with a Supabase access token: the session cookie is set. The API keeps no Supabase session.' })
    async supabaseSignIn(
        @Body() body: SupabaseSignInRequestBodyDTO,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response,
    ): Promise<void> {
        const identity = await this.supabase.verify(body.accessToken);
        const session = await this.signIn.signInWithSupabase(identity);
        response.append('Set-Cookie', sessionSetCookie(session, overHttps(request)));
    }

    @Post('logout')
    @HttpCode(204)
    @ApiNoContentResponse({ description: 'Signed out: the session cookie is cleared.' })
    logout(@Req() request: Request, @Res({ passthrough: true }) response: Response): void {
        response.append('Set-Cookie', sessionSetCookie(null, overHttps(request)));
    }
}

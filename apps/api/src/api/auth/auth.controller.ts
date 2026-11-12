import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';

import { GetSignInStatusResponseBodyDTO, SignInRequestBodyDTO } from './dto/sign-in.dto.js';
import { Public } from './public.decorator.js';
import { readCookies, SESSION_COOKIE, sessionSetCookie } from './session.js';
import { overHttps } from './sign-in.guard.js';
import { SignInService } from './sign-in.service.js';

/** .scratch/sign-in/spec.md: "API". */
@ApiTags('Sign-in')
@Public()
@Controller('auth')
export class AuthApiController {
    constructor(private readonly signIn: SignInService) {}

    @Get('status')
    @ApiOkResponse({ type: GetSignInStatusResponseBodyDTO })
    status(@Req() request: Request): GetSignInStatusResponseBodyDTO {
        return { required: this.signIn.required, signedIn: this.signIn.check(readCookies(request.headers.cookie, SESSION_COOKIE)).valid };
    }

    @Post('login')
    @HttpCode(204)
    @ApiNoContentResponse({ description: 'Signed in: the session cookie is set.' })
    login(@Body() body: SignInRequestBodyDTO, @Req() request: Request, @Res({ passthrough: true }) response: Response): void {
        const session = this.signIn.signIn(body.password);
        if (session !== null) response.append('Set-Cookie', sessionSetCookie(session, overHttps(request)));
    }

    @Post('logout')
    @HttpCode(204)
    @ApiNoContentResponse({ description: 'Signed out: the session cookie is cleared.' })
    logout(@Req() request: Request, @Res({ passthrough: true }) response: Response): void {
        response.append('Set-Cookie', sessionSetCookie(null, overHttps(request)));
    }
}

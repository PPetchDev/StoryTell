import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Response } from 'express';

import { AppError } from '../errors/app-error.js';

export interface ErrorResponseBody {
    error: { code: string; message: string };
}

/**
 * Every error leaves the API as `{ error: { code, message } }`. The frontend relies on that
 * shape to tell an API error apart from the API being unreachable (see apps/web/lib/api.ts).
 */
@Catch()
export class AppErrorFilter implements ExceptionFilter {
    private readonly logger = new Logger(AppErrorFilter.name);

    catch(exception: unknown, host: ArgumentsHost): void {
        const response = host.switchToHttp().getResponse<Response>();
        const { status, body } = this.toResponse(exception);
        response.status(status).json(body);
    }

    private toResponse(exception: unknown): { status: number; body: ErrorResponseBody } {
        if (exception instanceof AppError) {
            return {
                status: exception.status,
                body: { error: { code: exception.code, message: exception.message } },
            };
        }
        if (exception instanceof HttpException) {
            const status = exception.getStatus();
            return {
                status,
                body: { error: { code: `${status}.000.000`, message: exception.message } },
            };
        }
        this.logger.error(exception);
        return {
            status: 500,
            body: { error: { code: '500.000.000', message: 'Internal server error.' } },
        };
    }
}

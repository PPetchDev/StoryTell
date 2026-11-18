import { CallHandler, ExecutionContext, Injectable, NestInterceptor, UseInterceptors } from '@nestjs/common';
import type { Request } from 'express';
import { Observable } from 'rxjs';

import { WatchRuns } from './watch-runs.js';

/**
 * .scratch/watch-mode/spec.md, "Anything else that writes a turn stops Watch first": the Chat's
 * Watch is stopped, its step unwound, before the handler runs. So a message sent while Watch writes
 * stops it and is then sent as usual, from any client.
 */
@Injectable()
export class StopWatchInterceptor implements NestInterceptor {
    constructor(private readonly watches: WatchRuns) {}

    async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
        const { storyId, chatId } = context.switchToHttp().getRequest<Request>().params;
        const story = Number(storyId);
        const chat = Number(chatId);
        if (Number.isInteger(story) && Number.isInteger(chat)) await this.watches.stop(story, chat);
        return next.handle();
    }
}

/** On a Chat endpoint that writes a turn or rewinds the Chat: stops the Chat's Watch first. */
export const StopsWatch = () => UseInterceptors(StopWatchInterceptor);

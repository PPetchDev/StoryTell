import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';

import { AppConfig } from '../../config/app-config.js';
import { AccountModelService } from '../../model/account/account.service.js';
import { requestScope } from '../../model/account/request-scope.js';
import { ReachOutModelService } from '../../model/chat/reach-out.service.js';
import { ChatManagerService } from '../chat/chat.service.js';
import { inQuietHours } from '../chat/reach-out/reach-out.js';

/** The most Chats one tick tries. */
export const REACH_OUTS_PER_TICK = 20;

/** A Reach-out a tick stored. */
export interface SentReachOut {
    chatId: number;
    messageId: number;
}

/**
 * The scheduler for Reach-outs (.scratch/reach-outs/spec.md, "The scheduler"), inside the one API
 * process: every `reachOutTickMs` it finds the Chats whose time away is up and asks the Chat manager
 * for each, as the Story's Account. Nothing lives in memory between ticks (the setting, the claim
 * and the stored Reach-out are all in the database), so a restart only delays the next one.
 */
@Injectable()
export class ReachOutSchedulerService implements OnApplicationBootstrap, OnModuleDestroy {
    private readonly logger = new Logger(ReachOutSchedulerService.name);
    private timer: ReturnType<typeof setInterval> | undefined;
    /** The tick running now: the next waits for it, so two never overlap. */
    private running: Promise<unknown> = Promise.resolve();

    constructor(
        private readonly config: AppConfig,
        private readonly reachOuts: ReachOutModelService,
        private readonly accounts: AccountModelService,
        private readonly chats: ChatManagerService,
    ) {}

    onApplicationBootstrap(): void {
        const every = this.config.reachOutTickMs ?? 0;
        if (every <= 0) return;
        this.timer = setInterval(() => {
            this.tick().catch((error: unknown) => this.logger.warn(`Reach-out tick failed: ${error instanceof Error ? error.message : error}`));
        }, every);
        // Never what keeps the process alive.
        this.timer.unref();
    }

    onModuleDestroy(): void {
        if (this.timer) clearInterval(this.timer);
        this.timer = undefined;
    }

    /** One tick as if it were `now`, after any tick still running. Answers the Reach-outs it stored. */
    tick(now: Date = new Date()): Promise<SentReachOut[]> {
        const next = this.running.catch(() => undefined).then(() => this.run(now));
        this.running = next;
        return next;
    }

    private async run(now: Date): Promise<SentReachOut[]> {
        // One time zone for everyone, so a night tick has nothing to look at.
        if (inQuietHours(now)) return [];
        const sent: SentReachOut[] = [];
        for (const due of await this.reachOuts.due(now, REACH_OUTS_PER_TICK)) {
            const account = await this.accounts.findById(due.userId);
            if (!account?.active) continue;
            try {
                const messageId = await requestScope.run({ account }, () => this.chats.reachOut(due.storyId, due.chatId, now));
                if (messageId !== null) sent.push({ chatId: due.chatId, messageId });
            } catch (error) {
                this.logger.warn(`Chat ${due.chatId}: Reach-out failed: ${error instanceof Error ? error.message : error}`);
            }
        }
        return sent;
    }
}

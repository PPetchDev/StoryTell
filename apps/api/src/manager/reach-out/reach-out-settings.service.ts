import { Injectable } from '@nestjs/common';

import { ChatNotFoundError } from '../../errors/chat.errors.js';
import { StoryNotFoundError } from '../../errors/story.errors.js';
import { ReachOutHours } from '../../model/chat/entities/chat-reach-out.entity.js';
import { ReachOutModelService } from '../../model/chat/reach-out.service.js';
import { StoryModelService } from '../../model/story/story.service.js';

/** A Chat's "Characters message first" as the API answers it: the hours away, or null while off. */
export interface ReachOutSetting {
    afterHours: ReachOutHours | null;
}

/** Reads and sets a Chat's "Characters message first" (.scratch/reach-outs/spec.md, "The setting"). */
@Injectable()
export class ReachOutSettingsManagerService {
    constructor(
        private readonly stories: StoryModelService,
        private readonly reachOuts: ReachOutModelService,
    ) {}

    async get(storyId: number, chatId: number): Promise<ReachOutSetting> {
        await this.requireChat(storyId, chatId);
        return { afterHours: (await this.reachOuts.find(chatId))?.afterHours ?? null };
    }

    /** Null turns it off. Any change counts the time away from now. */
    async set(storyId: number, chatId: number, afterHours: ReachOutHours | null): Promise<ReachOutSetting> {
        await this.requireChat(storyId, chatId);
        await this.reachOuts.set(chatId, afterHours);
        return { afterHours };
    }

    /** The Story must be the current Account's and the Chat one of its own. */
    private async requireChat(storyId: number, chatId: number): Promise<void> {
        if (!(await this.stories.exists(storyId))) throw new StoryNotFoundError();
        if (!(await this.reachOuts.chatInStory(chatId, storyId))) throw new ChatNotFoundError();
    }
}

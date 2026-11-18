import { Injectable } from '@nestjs/common';

import { ChatNotFoundError } from '../../errors/chat.errors.js';
import { StoryNotFoundError } from '../../errors/story.errors.js';
import { ChatModelService } from '../../model/chat/chat.service.js';
import { StoryModelService } from '../../model/story/story.service.js';
import { ReplyCost, UsageRecordModelService } from '../../model/usage-record/usage-record.service.js';

/** What each reply of a Chat cost (.scratch/cost-view/spec.md: "Cost of a reply, in the Chat"). */
export interface ChatCosts {
    chatId: number;
    /** One per AI Message with any recorded calls, oldest first. */
    messages: ReplyCost[];
}

@Injectable()
export class ReplyCostManagerService {
    constructor(
        private readonly storyModel: StoryModelService,
        private readonly chatModel: ChatModelService,
        private readonly usageModel: UsageRecordModelService,
    ) {}

    /** Another Account's Story or Chat answers as a missing one. */
    async ofChat(storyId: number, chatId: number): Promise<ChatCosts> {
        if (!(await this.storyModel.exists(storyId))) throw new StoryNotFoundError();
        const chat = await this.chatModel.findOne(chatId);
        if (!chat || chat.storyId !== storyId) throw new ChatNotFoundError();
        const messages = await this.usageModel.costsOfChat(chat.id);
        return {
            chatId: chat.id,
            messages: messages.map((cost) => ({
                ...cost,
                costUsd: round(cost.costUsd),
                byKind: cost.byKind.map((kind) => ({ ...kind, costUsd: round(kind.costUsd) })),
            })),
        };
    }
}

function round(usd: number): number {
    return Math.round(usd * 1_000_000) / 1_000_000;
}

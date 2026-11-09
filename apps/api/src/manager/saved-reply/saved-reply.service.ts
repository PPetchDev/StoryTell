import { Injectable } from '@nestjs/common';

import { EmptySavedReplyError, SavedReplyNotFoundError, TooManySavedRepliesError } from '../../errors/saved-reply.errors.js';
import { StoryNotFoundError } from '../../errors/story.errors.js';
import { SAVED_REPLIES_MAX, SavedReplyEntity, SavedReplyResponse } from '../../model/saved-reply/entities/saved-reply.entity.js';
import { SavedReplyModelService } from '../../model/saved-reply/saved-reply.service.js';
import { StoryModelService } from '../../model/story/story.service.js';
import { StoryDetail, StoryManagerService } from '../story/story.service.js';

function cleanText(text: string): string {
    const trimmed = text.trim();
    if (trimmed === '') throw new EmptySavedReplyError();
    return trimmed;
}

/**
 * Saved replies (.scratch/saved-replies-and-replace-rules/spec.md: "Saved replies: storage and
 * API"), app-wide or per Story. App-wide writes answer the app-wide list; a Story's answer the
 * whole Story, like Lore, and count as saving it.
 */
@Injectable()
export class SavedReplyManagerService {
    constructor(
        private readonly savedReplyModel: SavedReplyModelService,
        private readonly storyModel: StoryModelService,
        private readonly storyManager: StoryManagerService,
    ) {}

    async listAppWide(): Promise<SavedReplyResponse[]> {
        return (await this.savedReplyModel.findByScope(null)).map((line) => line.toResponse());
    }

    async addAppWide(text: string): Promise<SavedReplyResponse[]> {
        await this.add(null, text);
        return this.listAppWide();
    }

    async updateAppWide(id: number, text: string): Promise<SavedReplyResponse[]> {
        await this.update(null, id, text);
        return this.listAppWide();
    }

    async removeAppWide(id: number): Promise<SavedReplyResponse[]> {
        await this.remove(null, id);
        return this.listAppWide();
    }

    async addToStory(storyId: number, text: string): Promise<StoryDetail> {
        await this.requireStory(storyId);
        await this.add(storyId, text);
        return this.storySaved(storyId);
    }

    async updateInStory(storyId: number, id: number, text: string): Promise<StoryDetail> {
        await this.requireStory(storyId);
        await this.update(storyId, id, text);
        return this.storySaved(storyId);
    }

    async removeFromStory(storyId: number, id: number): Promise<StoryDetail> {
        await this.requireStory(storyId);
        await this.remove(storyId, id);
        return this.storySaved(storyId);
    }

    private async add(storyId: number | null, text: string): Promise<void> {
        const cleaned = cleanText(text);
        const lines = await this.savedReplyModel.findByScope(storyId);
        if (lines.length >= SAVED_REPLIES_MAX) throw new TooManySavedRepliesError();
        const position = Math.max(-1, ...lines.map((line) => line.position)) + 1;
        await this.savedReplyModel.save({ storyId, text: cleaned, position });
    }

    private async update(storyId: number | null, id: number, text: string): Promise<void> {
        const line = await this.find(storyId, id);
        line.text = cleanText(text);
        await this.savedReplyModel.save(line);
    }

    private async remove(storyId: number | null, id: number): Promise<void> {
        await this.savedReplyModel.remove((await this.find(storyId, id)).id);
    }

    private async find(storyId: number | null, id: number): Promise<SavedReplyEntity> {
        const line = (await this.savedReplyModel.findByScope(storyId)).find((candidate) => candidate.id === id);
        if (!line) throw new SavedReplyNotFoundError();
        return line;
    }

    private async requireStory(storyId: number): Promise<void> {
        if (!(await this.storyModel.exists(storyId))) throw new StoryNotFoundError();
    }

    private async storySaved(storyId: number): Promise<StoryDetail> {
        await this.storyModel.touch(storyId);
        return this.storyManager.getStory(storyId);
    }
}

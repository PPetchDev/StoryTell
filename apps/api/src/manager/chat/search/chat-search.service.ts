import { Injectable } from '@nestjs/common';

import { ChatNotFoundError, MessageNotFoundError } from '../../../errors/chat.errors.js';
import { StoryNotFoundError } from '../../../errors/story.errors.js';
import { MessageBookmarkModelService } from '../../../model/chat/bookmark.service.js';
import { ChatModelService } from '../../../model/chat/chat.service.js';
import { ChatEntity } from '../../../model/chat/entities/chat.entity.js';
import { MessageEntity, MessageKind } from '../../../model/chat/entities/message.entity.js';
import { ReplaceRuleModelService } from '../../../model/replace-rule/replace-rule.service.js';
import { StoryModelService } from '../../../model/story/story.service.js';
import { applyReplaceRules } from '../../replace-rule/apply-replace-rules.js';
import { wornIdentity } from '../identity.js';
import { joinNames, leadOf, SearchablePart, searchParts, SearchResult } from './chat-search.js';

/** Who narration is said by, in a result. */
export const NARRATOR = 'Narrator';

export interface Bookmark {
    messageId: number;
    kind: 'user' | 'ai';
    speaker: string;
    snippet: string;
    createdAt: string;
}

/** A Chat's Messages as the screen shows them: AI parts with the On AI Replace rules applied, and who said each. */
interface ShownChat {
    chat: ChatEntity;
    /** The name the user's lines go under when a Message has none stamped. */
    worn: string;
    shown(text: string): string;
}

/**
 * Search within a Chat and its Bookmarks (.scratch/chat-search/spec.md). Read-only apart from the
 * Bookmarks themselves; it calls no model. Text reads as the Transcript reads it: AI parts with
 * the Chat's On AI Messages Replace rules applied, app-wide then the Story's.
 */
@Injectable()
export class ChatSearchManagerService {
    constructor(
        private readonly storyModel: StoryModelService,
        private readonly chatModel: ChatModelService,
        private readonly bookmarkModel: MessageBookmarkModelService,
        private readonly replaceRuleModel: ReplaceRuleModelService,
    ) {}

    async search(storyId: number, chatId: number, query: string): Promise<SearchResult> {
        const { chat, worn, shown } = await this.load(storyId, chatId);
        const parts: SearchablePart[] = chat.messages.flatMap((message): SearchablePart[] =>
            message.kind === MessageKind.User
                ? [{ messageId: message.id, kind: 'user', speaker: message.identityName ?? worn, text: message.text ?? '' }]
                : (message.parts ?? []).map((part) => {
                      const response = part.toResponse();
                      return {
                          messageId: message.id,
                          kind: 'ai',
                          speaker: response.kind === 'speech' ? response.speakerName : NARRATOR,
                          text: shown(response.text),
                      };
                  }),
        );
        return searchParts(parts, query);
    }

    async bookmarks(storyId: number, chatId: number): Promise<Bookmark[]> {
        return this.list(await this.load(storyId, chatId));
    }

    /** Marks or unmarks one of the Chat's Messages, and answers the Chat's Bookmarks after. */
    async setBookmark(storyId: number, chatId: number, messageId: number, on: boolean): Promise<Bookmark[]> {
        const loaded = await this.load(storyId, chatId);
        if (!loaded.chat.messages.some((message) => message.id === messageId)) throw new MessageNotFoundError();
        if (on) await this.bookmarkModel.add(messageId);
        else await this.bookmarkModel.remove(messageId);
        return this.list(loaded);
    }

    private async list({ chat, worn, shown }: ShownChat): Promise<Bookmark[]> {
        const byId = new Map(chat.messages.map((message) => [message.id, message]));
        const rows = await this.bookmarkModel.findByChat(chat.id);
        return rows.flatMap((row) => {
            const message = byId.get(row.messageId);
            return message ? [{ ...describe(message, worn, shown), messageId: message.id, createdAt: row.createdAt.toISOString() }] : [];
        });
    }

    private async load(storyId: number, chatId: number): Promise<ShownChat> {
        const story = await this.storyModel.findFull(storyId);
        if (!story) throw new StoryNotFoundError();
        const chat = await this.chatModel.findWithMessages(chatId);
        if (!chat || chat.storyId !== storyId) throw new ChatNotFoundError();
        const rules = [...(await this.replaceRuleModel.findByScope(null)), ...story.replaceRules].filter((rule) => rule.onAi);
        return { chat, worn: wornIdentity(story, chat).name, shown: (text) => applyReplaceRules(text, rules) };
    }
}

/** A Bookmark's who and start: the user's name, or a reply's speakers in order ("Narrator" when no one speaks). */
function describe(message: MessageEntity, worn: string, shown: (text: string) => string): Pick<Bookmark, 'kind' | 'speaker' | 'snippet'> {
    if (message.kind === MessageKind.User) {
        return { kind: 'user', speaker: message.identityName ?? worn, snippet: leadOf(message.text ?? '') };
    }
    const parts = (message.parts ?? []).map((part) => part.toResponse());
    const speakers = [...new Set(parts.flatMap((part) => (part.kind === 'speech' ? [part.speakerName] : [])))];
    return {
        kind: 'ai',
        speaker: speakers.length === 0 ? NARRATOR : joinNames(speakers),
        snippet: leadOf(parts.map((part) => shown(part.text)).join(' ')),
    };
}

import { Injectable } from '@nestjs/common';

import { ChatNotFoundError } from '../../errors/chat.errors.js';
import { StoryNotFoundError } from '../../errors/story.errors.js';
import { ChatModelService } from '../../model/chat/chat.service.js';
import { MessageKind } from '../../model/chat/entities/message.entity.js';
import { ReplaceRuleModelService } from '../../model/replace-rule/replace-rule.service.js';
import { StoryModelService } from '../../model/story/story.service.js';
import { applyReplaceRules } from '../replace-rule/apply-replace-rules.js';
import { wornIdentity } from './identity.js';
import { chatTranscript, transcriptFileNames } from './transcript.js';

/** A Chat's transcript, with the names a download saves it as. */
export interface ChatTranscript {
    text: string;
    /** The titles as they are, for `filename*`. */
    fileName: string;
    /** An ASCII name for clients that read only `filename`. */
    asciiFileName: string;
}

/**
 * Spec: "Download a Chat as text". Read-only: it changes nothing and calls no model. AI parts
 * read as the screen shows them: the Chat's On AI Messages Replace rules applied, app-wide then
 * the Story's (.scratch/saved-replies-and-replace-rules/spec.md); names and User Messages as stored.
 */
@Injectable()
export class ChatTranscriptManagerService {
    constructor(
        private readonly storyModel: StoryModelService,
        private readonly chatModel: ChatModelService,
        private readonly replaceRuleModel: ReplaceRuleModelService,
    ) {}

    async transcript(storyId: number, chatId: number): Promise<ChatTranscript> {
        const story = await this.storyModel.findFull(storyId);
        if (!story) throw new StoryNotFoundError();
        const chat = await this.chatModel.findWithMessages(chatId);
        if (!chat || chat.storyId !== storyId) throw new ChatNotFoundError();

        // A User Message carries the name worn when it was sent; one from before stamping wears today's.
        const worn = wornIdentity(story, chat).name;
        const rules = [...(await this.replaceRuleModel.findByScope(null)), ...story.replaceRules].filter((rule) => rule.onAi);
        const text = chatTranscript({
            storyTitle: story.title,
            chatTitle: chat.title,
            messages: chat.messages.map((message) =>
                message.kind === MessageKind.User
                    ? { kind: 'user', name: message.identityName ?? worn, text: message.text ?? '' }
                    : {
                          kind: 'ai',
                          parts: (message.parts ?? []).map((part) => {
                              const shown = part.toResponse();
                              return { ...shown, text: applyReplaceRules(shown.text, rules) };
                          }),
                      },
            ),
        });
        return { text, ...transcriptFileNames(story.title, chat.title, chat.id) };
    }
}

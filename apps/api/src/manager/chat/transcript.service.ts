import { Injectable } from '@nestjs/common';

import { ChatNotFoundError } from '../../errors/chat.errors.js';
import { StoryNotFoundError } from '../../errors/story.errors.js';
import { ChatModelService } from '../../model/chat/chat.service.js';
import { MessageKind } from '../../model/chat/entities/message.entity.js';
import { StoryModelService } from '../../model/story/story.service.js';
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

/** Spec: "Download a Chat as text". Read-only: it changes nothing and calls no model. */
@Injectable()
export class ChatTranscriptManagerService {
    constructor(
        private readonly storyModel: StoryModelService,
        private readonly chatModel: ChatModelService,
    ) {}

    async transcript(storyId: number, chatId: number): Promise<ChatTranscript> {
        const story = await this.storyModel.findFull(storyId);
        if (!story) throw new StoryNotFoundError();
        const chat = await this.chatModel.findWithMessages(chatId);
        if (!chat || chat.storyId !== storyId) throw new ChatNotFoundError();

        // A User Message carries the name worn when it was sent; one from before stamping wears today's.
        const worn = wornIdentity(story, chat).name;
        const text = chatTranscript({
            storyTitle: story.title,
            chatTitle: chat.title,
            messages: chat.messages.map((message) =>
                message.kind === MessageKind.User
                    ? { kind: 'user', name: message.identityName ?? worn, text: message.text ?? '' }
                    : { kind: 'ai', parts: (message.parts ?? []).map((part) => part.toResponse()) },
            ),
        });
        return { text, ...transcriptFileNames(story.title, chat.title, chat.id) };
    }
}

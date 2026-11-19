import { Injectable, Logger } from '@nestjs/common';

import { ChatNotFoundError } from '../../errors/chat.errors.js';
import { UnparseableOutputError } from '../../errors/model-gateway.errors.js';
import { NothingToSuggestLoreFromError } from '../../errors/recap.errors.js';
import { StoryNotFoundError } from '../../errors/story.errors.js';
import { ChatModelService } from '../../model/chat/chat.service.js';
import { MessageKind } from '../../model/chat/entities/message.entity.js';
import { DetailKind } from '../../model/ledger/entities/detail-change.entity.js';
import { LedgerModelService } from '../../model/ledger/ledger.service.js';
import { StoryModelService } from '../../model/story/story.service.js';
import { ModelGateway } from '../../service/model-gateway/model-gateway.js';
import { factsState } from '../chat/details/facts.js';
import { wornIdentity } from '../chat/identity.js';
import { messageText } from '../chat/story-so-far/story-so-far.service.js';
import { readJsonObject } from '../story-drafting/draft-schema.js';
import { LORE_SUGGESTIONS_MAX_TOKENS, LoreSuggestion, loreSuggestionsMessages, readLoreSuggestions } from './lore-suggestions.js';

/**
 * Lore from a Chat (.scratch/lore-from-chat/spec.md): one background call reads what a Chat has
 * established about the world and suggests new Lore entries. Nothing is stored; the user adds the
 * ones they want through the Story's own "add Lore" endpoint.
 */
@Injectable()
export class LoreSuggestionsManagerService {
    private readonly logger = new Logger(LoreSuggestionsManagerService.name);

    constructor(
        private readonly storyModel: StoryModelService,
        private readonly chatModel: ChatModelService,
        private readonly ledger: LedgerModelService,
        private readonly gateway: ModelGateway,
    ) {}

    async suggest(storyId: number, chatId: number): Promise<LoreSuggestion[]> {
        const story = await this.storyModel.findFull(storyId);
        if (!story) throw new StoryNotFoundError();
        const chat = await this.chatModel.findWithMessages(chatId);
        if (!chat || chat.storyId !== storyId) throw new ChatNotFoundError();
        // Spec: a Chat with nothing after its Opening has made up nothing yet.
        if (chat.messages.length < 2) throw new NothingToSuggestLoreFromError();

        const state = await this.ledger.state(chat.id);
        const identity = wornIdentity(story, chat);
        const lore = story.allLore().filter((entry) => entry.name.trim() !== '' || entry.text.trim() !== '');
        const castNames = story.characters.map((character) => character.name);
        const places: string[] = [];
        for (const change of state.detailChanges) {
            if (change.kind !== DetailKind.Place) continue;
            const place = change.value.trim();
            if (place !== '' && !places.some((known) => known.toLowerCase() === place.toLowerCase())) places.push(place);
        }

        const result = await this.gateway.completeText({
            kind: 'lore_suggestions',
            messages: loreSuggestionsMessages({
                setting: story.setting,
                lore: lore.map((entry) => ({ name: entry.name, text: entry.text })),
                castNames,
                identityName: identity.name,
                storySoFar: chat.storySoFar,
                chapters: state.sceneAdvances
                    .filter((advance) => advance.chapterSummary !== null && advance.chapterSummary.trim() !== '')
                    .map((advance) => ({ sceneName: advance.fromSceneName, summary: advance.chapterSummary! })),
                facts: factsState(state.detailChanges).facts,
                places,
                messages: chat.messages.map((message) => ({
                    speaker: message.kind === MessageKind.User ? (message.identityName ?? identity.name) : 'Story',
                    text: messageText(message),
                })),
            }),
            json: true,
            maxTokens: LORE_SUGGESTIONS_MAX_TOKENS,
            servedFor: { storyId: story.id, chatId: chat.id },
        });
        const unreadable = () => new UnparseableOutputError('The Lore suggestions were not readable JSON.');
        const suggestions = readLoreSuggestions(readJsonObject(result.text, unreadable), {
            lore: lore.map((entry) => entry.name),
            castNames,
            identityName: identity.name,
        });
        if (suggestions === null) throw unreadable();
        this.logger.log(`Story ${story.id}, Chat ${chat.id}: ${suggestions.length} Lore suggestions`);
        return suggestions;
    }
}

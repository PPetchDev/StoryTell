import { Injectable, Logger } from '@nestjs/common';

import { ModelGatewayError, OutOfCreditError } from '../../errors/model-gateway.errors.js';
import { DocumentPassagesUsed } from '../../model/chat/entities/message.entity.js';
import { DocumentModelService } from '../../model/document/document.service.js';
import { StoryEntity } from '../../model/story/entities/story.entity.js';
import { EmbeddingResult, ModelGateway } from '../../service/model-gateway/model-gateway.js';
import { PromptPassage, searchLogLine, selectPassages, unitLength } from '../document/document-search.js';
import { passageExcerpt } from '../excerpt.js';

/** What a turn takes from the Story's Documents: the block's passages, and the record its AI Message keeps. */
export interface TurnDocuments {
    /** Null for a Story with no passages: no call was made. */
    record: DocumentPassagesUsed | null;
    passages: PromptPassage[];
    /** Whether the Story has any passage, for the Story so far reserve. */
    hasDocuments: boolean;
}

/** A passage the last turn sent, as the Memory drawer lists it. */
export interface DocumentPassageInPlay {
    documentId: number;
    documentTitle: string;
    position: number;
    /** Its first ~160 characters. */
    excerpt: string;
}

/** Spec: "Documents in play": what the newest AI Message's search used. */
export interface DocumentsInPlay {
    hasDocuments: boolean;
    /** `none` until a turn has searched. */
    status: 'none' | 'found' | 'failed';
    /** Still-existing passages, in the order sent. */
    passages: DocumentPassageInPlay[];
}

/**
 * The turn's one search (.scratch/memory-by-meaning/spec.md, "The query"): `none` when no call
 * was made (nothing to search, or a blank query), `failed` when the embedding host failed, or the
 * query's vector at unit length with the model that made it, for both Documents and Memory.
 */
export type TurnContextQuery = { status: 'none' } | { status: 'failed' } | { status: 'found'; vector: number[]; model: string };

/** Whether the Story (loaded with its Documents) has any passage to search. */
export function hasDocumentPassages(story: StoryEntity): boolean {
    return (story.documents ?? []).some((document) => Number(document.passageCount ?? 0) > 0);
}

/**
 * Each turn's search (.scratch/documents/spec.md: "Each turn: the search", and
 * .scratch/memory-by-meaning/spec.md: "The query"): one `context_search` call for the latest
 * exchange, whose vector is compared with every passage of the Story and every Memory of the
 * Chat. Made only when the Story has a passage or the Chat a Memory with a vector, and only as
 * part of a turn.
 */
@Injectable()
export class DocumentSearchManagerService {
    private readonly logger = new Logger(DocumentSearchManagerService.name);

    constructor(
        private readonly documentModel: DocumentModelService,
        private readonly gateway: ModelGateway,
    ) {}

    /**
     * The turn's one search call, when there is anything to search. A failure at the embedding
     * host lets the turn go on, without Documents and with the newest Memories, recorded as
     * `failed`; out of text credit fails the turn, as the turn's own call would, since both draw on
     * the same balance.
     */
    async embedQuery(story: StoryEntity, chatId: number, query: string, hasMemoryVectors: boolean): Promise<TurnContextQuery> {
        const hasDocuments = hasDocumentPassages(story);
        if ((!hasDocuments && !hasMemoryVectors) || query.trim() === '') return { status: 'none' };

        let result: EmbeddingResult;
        try {
            result = await this.gateway.embedTexts({ kind: 'context_search', inputs: [query], servedFor: { storyId: story.id, chatId } });
        } catch (error) {
            if (error instanceof OutOfCreditError || !(error instanceof ModelGatewayError)) throw error;
            if (hasDocuments) {
                this.logger.warn(`Story ${story.id}, Chat ${chatId}: the Document search failed, so this turn uses no Documents: ${error.message}`);
            }
            if (hasMemoryVectors) {
                this.logger.warn(`Story ${story.id}, Chat ${chatId}: the Memory search failed, so this turn uses the newest Memories: ${error.message}`);
            }
            return { status: 'failed' };
        }
        return { status: 'found', vector: unitLength(result.vectors[0]), model: result.model };
    }

    /**
     * The passages for a turn, from its search: none for a Story with no passages, `failed` when
     * the search failed, and none found for a blank query, which makes no call.
     */
    async forTurn(story: StoryEntity, chatId: number, query: TurnContextQuery): Promise<TurnDocuments> {
        if (!hasDocumentPassages(story)) return { record: null, passages: [], hasDocuments: false };
        if (query.status === 'none') return { record: { status: 'found', passageIds: [] }, passages: [], hasDocuments: true };
        if (query.status === 'failed') return { record: { status: 'failed', passageIds: [] }, passages: [], hasDocuments: true };

        const selection = selectPassages(await this.documentModel.passagesOf(story.id), query.vector, query.model);
        const titleOf = (documentId: number) => story.documents.find((document) => document.id === documentId)?.title ?? '';
        if (selection.otherModel.length > 0) {
            const documents = new Set(selection.otherModel.map((passage) => titleOf(passage.documentId)));
            this.logger.warn(
                `Story ${story.id}: skipped ${selection.otherModel.length} passages of ${[...documents].map((title) => `"${title}"`).join(', ')}, embedded by another model than ${query.model}; add them again to use them`,
            );
        }
        this.logger.debug(searchLogLine(story.id, chatId, selection, titleOf));
        return {
            record: { status: 'found', passageIds: selection.selected.map((passage) => passage.id) },
            passages: selection.selected.map((passage) => ({ documentTitle: titleOf(passage.documentId), text: passage.text })),
            hasDocuments: true,
        };
    }

    /**
     * The passages a record names that still exist, with their titles, in the order sent. No
     * model call: what the last turn used, never a fresh search.
     */
    async recorded(storyId: number, record: DocumentPassagesUsed | null): Promise<PromptPassage[]> {
        if (record?.status !== 'found') return [];
        const passages = await this.documentModel.passagesByIds(storyId, record.passageIds);
        return passages.map((passage) => ({ documentTitle: passage.documentTitle, text: passage.text }));
    }

    /** Spec: "Documents in play": from the newest AI Message's record, with no model call. */
    async inPlay(story: StoryEntity, record: DocumentPassagesUsed | null): Promise<DocumentsInPlay> {
        const hasDocuments = (story.documents ?? []).length > 0;
        if (!record) return { hasDocuments, status: 'none', passages: [] };
        const passages = record.status === 'found' ? await this.documentModel.passagesByIds(story.id, record.passageIds) : [];
        return {
            hasDocuments,
            status: record.status,
            passages: passages.map((passage) => ({
                documentId: passage.documentId,
                documentTitle: passage.documentTitle,
                position: passage.position,
                excerpt: passageExcerpt(passage.text),
            })),
        };
    }
}

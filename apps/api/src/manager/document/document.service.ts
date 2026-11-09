import { Inject, Injectable } from '@nestjs/common';

import { OutOfCreditError, UnparseableOutputError } from '../../errors/model-gateway.errors.js';
import {
    DocumentLimitError,
    DocumentNotFoundError,
    DocumentTooLargeError,
    EmptyDocumentError,
} from '../../errors/story.errors.js';
import { DocumentModelService, NewPassage } from '../../model/document/document.service.js';
import { DocumentSource, DocumentSummary, DocumentText } from '../../model/document/entities/document.entity.js';
import { StoryModelService } from '../../model/story/story.service.js';
import { ModelGateway } from '../../service/model-gateway/model-gateway.js';
import type { FetchLike } from '../../service/model-gateway/real/http.js';
import { PAGE_FETCH } from '../../service/page-fetch/page-fetch.module.js';
import { StoryDetail, StoryManagerService } from '../story/story.service.js';
import { unitLength } from './document-search.js';
import { FetchedPage, fetchPage } from './page-fetch.js';
import { splitPassages } from './split-passages.js';

/** Spec: "Limits". Checked before any call. */
export const MAX_DOCUMENT_CHARACTERS = 200_000;
export const MAX_DOCUMENTS = 20;
export const MAX_STORY_PASSAGES = 1_000;
/** Passages embedded per `document_embedding` call. */
export const EMBEDDING_BATCH = 32;
/** A blank title is filled from the text's first line, cut to this. */
const TITLE_FROM_TEXT_MAX = 80;

export interface NewDocumentFields {
    title: string;
    text: string;
    source: DocumentSource;
    /** The file name or page URL; ignored for pasted text. */
    sourceName?: string | null;
}

/**
 * Documents (.scratch/documents/spec.md): longer texts a Story's Chats look things up in by
 * meaning. Adding one is the only thing that spends on it: its passages are embedded, and only
 * once every batch has answered is anything stored. Every write answers the whole Story.
 */
@Injectable()
export class DocumentManagerService {
    constructor(
        private readonly documentModel: DocumentModelService,
        private readonly storyModel: StoryModelService,
        private readonly storyManager: StoryManagerService,
        private readonly gateway: ModelGateway,
        @Inject(PAGE_FETCH) private readonly pageFetch: FetchLike,
    ) {}

    /**
     * A web page's title and plain text, for the Add sheet to fill in (spec: "Files and web
     * pages"). Nothing is stored and nothing is spent: the author reads, trims and taps Add.
     */
    async fetchPage(storyId: number, url: string): Promise<FetchedPage> {
        await this.storyManager.getStory(storyId);
        return fetchPage(url, this.pageFetch);
    }

    /**
     * Splits the text, embeds its passages in batches of 32 (each a `document_embedding` call
     * for the Story), then stores the Document and its passages in one transaction with the
     * model the gateway named. A failure stores nothing; the gateway's typed error goes out
     * as it is. Every limit is checked before any call.
     */
    async addDocument(storyId: number, fields: NewDocumentFields): Promise<StoryDetail> {
        const story = await this.storyManager.getStory(storyId);
        const text = fields.text.trim();
        if (text === '') throw new EmptyDocumentError();
        if (text.length > MAX_DOCUMENT_CHARACTERS) throw new DocumentTooLargeError(text.length, MAX_DOCUMENT_CHARACTERS);
        if (story.documents.length >= MAX_DOCUMENTS) {
            throw new DocumentLimitError(`A Story holds at most ${MAX_DOCUMENTS} Documents. Remove one first.`);
        }
        const passages = splitPassages(text);
        const held = story.documents.reduce((sum, document) => sum + document.passages, 0);
        if (held + passages.length > MAX_STORY_PASSAGES) {
            throw new DocumentLimitError(
                `This Document makes ${passages.length} passages, and the Story already has ${held} of at most ${MAX_STORY_PASSAGES}. Trim it, or remove another Document first.`,
            );
        }
        const credit = await this.gateway.remainingCredit();
        if (credit.text.remainingUsd !== null && credit.text.remainingUsd <= 0) throw new OutOfCreditError('text');

        const embedded: NewPassage[] = [];
        let model: string | undefined;
        for (let at = 0; at < passages.length; at += EMBEDDING_BATCH) {
            const batch = passages.slice(at, at + EMBEDDING_BATCH);
            const result = await this.gateway.embedTexts({ kind: 'document_embedding', inputs: batch, servedFor: { storyId } });
            if (model !== undefined && result.model !== model) {
                throw new UnparseableOutputError(`The passages came back from two models (${model}, ${result.model}). Add the Document again.`);
            }
            model = result.model;
            batch.forEach((passage, index) => embedded.push({ text: passage, embedding: unitLength(result.vectors[index]) }));
        }

        const sourceName = fields.source === 'pasted' ? null : fields.sourceName?.trim() || null;
        await this.documentModel.insert(
            {
                storyId,
                title: fields.title.trim() || titleFromText(text),
                source: fields.source,
                sourceName,
                text,
                characters: text.length,
                embeddingModel: model!,
            },
            embedded,
        );
        await this.storyModel.touch(storyId);
        return this.storyManager.getStory(storyId);
    }

    /** A Document's text as added, for reading. */
    async readDocument(storyId: number, documentId: number): Promise<DocumentText> {
        await this.storyManager.getStory(storyId);
        const document = await this.documentModel.findWithText(storyId, documentId);
        if (!document) throw new DocumentNotFoundError();
        const { id, title, source, sourceName, text } = document;
        return { id, title, source, sourceName, text };
    }

    /** Only the title can change: the text stays as added, so its passages always match it. */
    async renameDocument(storyId: number, documentId: number, title: string): Promise<StoryDetail> {
        const document = this.findDocument(await this.storyManager.getStory(storyId), documentId);
        await this.documentModel.rename(document.id, title.trim());
        await this.storyModel.touch(storyId);
        return this.storyManager.getStory(storyId);
    }

    /** The Narrator stops using it from the next turn. Adding it again costs a call. */
    async removeDocument(storyId: number, documentId: number): Promise<StoryDetail> {
        const document = this.findDocument(await this.storyManager.getStory(storyId), documentId);
        await this.documentModel.remove(storyId, document.id);
        await this.storyModel.touch(storyId);
        return this.storyManager.getStory(storyId);
    }

    private findDocument(story: StoryDetail, documentId: number): DocumentSummary {
        const document = story.documents.find((candidate) => candidate.id === documentId);
        if (!document) throw new DocumentNotFoundError();
        return document;
    }
}

/** The text's first line, Markdown heading marks dropped, cut to a short title. */
function titleFromText(text: string): string {
    const firstLine = text.split('\n', 1)[0].replace(/^#+\s*/, '').trim();
    return [...firstLine].length > TITLE_FROM_TEXT_MAX ? `${[...firstLine].slice(0, TITLE_FROM_TEXT_MAX - 1).join('')}…` : firstLine;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

import type { BookChapterState, BookChapterView, BookView } from '../../../manager/chat/book/book.service.js';
import type { BookChapterAuthor } from '../../../model/book/entities/book-chapter.entity.js';

// About 2,000 words are asked for; these refuse a runaway client, not a long chapter.
const TITLE_MAX = 200;
const TEXT_MAX = 100_000;

/** Turn a Chat into a novel (.scratch/chat-novel/spec.md). */
export class WriteBookRequestBodyDTO {
    @ApiPropertyOptional({ type: [Number], description: 'The chapters to write or rewrite; none for Write all.' })
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(500)
    @IsInt({ each: true })
    @Min(1, { each: true })
    numbers?: number[];
}

export class SaveBookChapterRequestBodyDTO {
    @ApiProperty({ description: 'The chapter title, as the user wrote it.' })
    @IsString()
    @MaxLength(TITLE_MAX)
    title: string;

    @ApiProperty({ description: 'The chapter prose, as the user wrote it. A write finishing after it never replaces it.' })
    @IsString()
    @MaxLength(TEXT_MAX)
    text: string;
}

export class BookChapterDTO implements BookChapterView {
    @ApiProperty({ description: 'Its Chapter number.' })
    number: number;

    @ApiProperty({ description: 'The Scene of its Chapter, or the one stamped when it was written if its Chapter is gone.' })
    sceneName: string;

    @ApiProperty({ type: String, nullable: true })
    title: string | null;

    @ApiProperty({ type: String, nullable: true })
    text: string | null;

    @ApiProperty({ enum: ['ai', 'user'], nullable: true })
    writtenBy: BookChapterAuthor | null;

    @ApiProperty({
        enum: ['unwritten', 'queued', 'writing', 'written', 'failed', 'empty'],
        description: 'Not written; waiting its turn; being written now; written; the last write failed (old text stays); or nothing to write.',
    })
    state: BookChapterState;

    @ApiProperty({ description: 'The Messages of its Chapter changed since it was written, or its Chapter is gone.' })
    outOfDate: boolean;

    @ApiProperty({ description: 'Its Chapter was taken back: it can be removed, not written.' })
    chapterGone: boolean;

    @ApiProperty({ type: String, nullable: true, description: 'The text so far, while it is being written.' })
    draft: string | null;

    @ApiProperty({ type: String, nullable: true })
    failedReason: string | null;

    @ApiProperty({ type: Number, nullable: true, description: 'About what writing it costs at the play model list price; null when it cannot be written.' })
    priceUsd: number | null;

    @ApiProperty({ type: String, nullable: true })
    updatedAt: string | null;
}

export class BookResponseBodyDTO implements BookView {
    @ApiProperty({ description: 'The Story title.' })
    title: string;

    @ApiProperty()
    chatTitle: string;

    @ApiProperty({ description: 'The Role or Persona the Chat wears now.' })
    identityName: string;

    @ApiProperty({ description: 'A write is waiting or running for this Chat.' })
    writing: boolean;

    @ApiProperty({ description: 'How many chapters Write all would write.' })
    writeAllCount: number;

    @ApiProperty({ description: 'About what Write all would cost.' })
    writeAllPriceUsd: number;

    @ApiProperty({ type: [BookChapterDTO], description: 'Oldest first: every ended Chapter, and any Book chapter whose Chapter is gone.' })
    chapters: BookChapterDTO[];
}

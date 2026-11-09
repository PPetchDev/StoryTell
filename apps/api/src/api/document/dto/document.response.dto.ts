import { ApiProperty } from '@nestjs/swagger';

import { DOCUMENT_SOURCES, DocumentText } from '../../../model/document/entities/document.entity.js';
import type { DocumentSource } from '../../../model/document/entities/document.entity.js';
import type { FetchedPage } from '../../../manager/document/page-fetch.js';

/** A Document with its text as added, for reading. */
export class DocumentTextResponseBodyDTO implements DocumentText {
    @ApiProperty()
    id: number;

    @ApiProperty()
    title: string;

    @ApiProperty({ enum: DOCUMENT_SOURCES })
    source: DocumentSource;

    @ApiProperty({ type: String, nullable: true, description: 'The file name or the page URL; null for pasted text.' })
    sourceName: string | null;

    @ApiProperty({ description: 'The plain text as added.' })
    text: string;
}

/** A fetched page, for the Add sheet to fill in. Nothing is stored. */
export class FetchedPageResponseBodyDTO implements FetchedPage {
    @ApiProperty({ description: "The page's <title>, trimmed of a trailing \" - Site name\"." })
    title: string;

    @ApiProperty({ description: "The page's plain text: its article, main or body, without menus and page furniture." })
    text: string;

    @ApiProperty({ description: 'The address the text came from, after any redirects.' })
    url: string;
}

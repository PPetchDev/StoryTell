import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

import { NewDocumentFields } from '../../../manager/document/document.service.js';
import { DOCUMENT_SOURCES } from '../../../model/document/entities/document.entity.js';
import type { DocumentSource } from '../../../model/document/entities/document.entity.js';

const TITLE_MAX = 200;

/** Spec: "Adding". The text is checked by the manager, so an oversize one gets its own plain error. */
export class NewDocumentRequestBodyDTO implements NewDocumentFields {
    @ApiProperty({ description: 'Blank takes the first line of the text.' })
    @IsString()
    @MaxLength(TITLE_MAX)
    title: string;

    @ApiProperty({ description: 'The plain text, 1 to 200,000 characters after trimming. It never changes once added.' })
    @IsString()
    text: string;

    @ApiProperty({ enum: DOCUMENT_SOURCES })
    @IsIn(DOCUMENT_SOURCES)
    source: DocumentSource;

    @ApiPropertyOptional({ type: String, nullable: true, description: 'The file name or the page URL; ignored for pasted text.' })
    @IsOptional()
    @IsString()
    @MaxLength(2000)
    sourceName?: string | null;
}

/** Spec: "Other routes". Only the title can change. */
export class RenameDocumentRequestBodyDTO {
    @ApiProperty()
    @IsString()
    @MaxLength(TITLE_MAX)
    title: string;
}

/** Spec: "Files and web pages". */
export class FetchPageRequestBodyDTO {
    @ApiProperty({ description: 'An http or https address, not this PC itself.' })
    @IsString()
    @MaxLength(2000)
    url: string;
}

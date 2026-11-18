import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

import { SEARCH_HITS_MAX, SEARCH_QUERY_MAX } from '../../../manager/chat/search/chat-search.js';

export class SearchChatQueryDTO {
    @ApiProperty({ description: 'What to find: a plain substring, any case, whitespace runs as one space.', maxLength: SEARCH_QUERY_MAX })
    @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
    @IsString()
    @IsNotEmpty()
    @MaxLength(SEARCH_QUERY_MAX)
    q: string;
}

class SearchMatchDTO {
    @ApiProperty({ description: 'Where the match starts in the snippet, in UTF-16 units.' })
    start: number;

    @ApiProperty()
    length: number;
}

export class SearchHitDTO {
    @ApiProperty()
    messageId: number;

    @ApiProperty({ enum: ['user', 'ai'] })
    kind: 'user' | 'ai';

    @ApiProperty({ description: "Who said it: the user's identity name, a Character's name, or \"Narrator\"." })
    speaker: string;

    @ApiProperty({ description: 'About 120 characters around the match, "…" where cut.' })
    snippet: string;

    @ApiProperty({ type: SearchMatchDTO })
    match: SearchMatchDTO;
}

export class SearchChatResponseBodyDTO {
    @ApiProperty({ description: 'How many parts matched in all.' })
    total: number;

    @ApiProperty({ type: [SearchHitDTO], description: `The newest ${SEARCH_HITS_MAX} matching parts, newest first.` })
    hits: SearchHitDTO[];
}

export class BookmarkDTO {
    @ApiProperty()
    messageId: number;

    @ApiProperty({ enum: ['user', 'ai'] })
    kind: 'user' | 'ai';

    @ApiProperty({ description: "The user's identity name, or a reply's speakers in order (\"Narrator\" when no one speaks)." })
    speaker: string;

    @ApiProperty({ description: "The start of the Message's text." })
    snippet: string;

    @ApiProperty()
    createdAt: string;
}

export class BookmarksResponseBodyDTO {
    @ApiProperty({ type: [BookmarkDTO], description: 'In thread order.' })
    bookmarks: BookmarkDTO[];
}

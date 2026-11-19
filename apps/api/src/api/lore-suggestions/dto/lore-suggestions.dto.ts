import { ApiProperty } from '@nestjs/swagger';

import type { LoreSuggestion } from '../../../manager/lore-suggestions/lore-suggestions.js';

export class LoreSuggestionDTO implements LoreSuggestion {
    @ApiProperty({ description: 'What the entry is about, as the story says it; it also counts as a keyword.' })
    name: string;

    @ApiProperty({ type: [String], description: 'Other ways the story may mention it.' })
    keywords: string[];

    @ApiProperty({ description: 'One to three plain sentences.' })
    text: string;
}

/** Lore from a Chat (.scratch/lore-from-chat/spec.md): suggestions only, nothing is added. */
export class LoreSuggestionsResponseBodyDTO {
    @ApiProperty({ type: [LoreSuggestionDTO], description: 'At most six, none already in the Lore; empty when the Chat has established nothing new.' })
    suggestions: LoreSuggestionDTO[];
}

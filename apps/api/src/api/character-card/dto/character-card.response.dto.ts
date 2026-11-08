import { ApiProperty } from '@nestjs/swagger';

import { CardPreview } from '../../../manager/character-card/character-card.service.js';

/** What an import of the card would make (spec: "API"). */
export class CardPreviewResponseBodyDTO implements CardPreview {
    @ApiProperty({ enum: ['v1', 'v2', 'v3'] })
    format: 'v1' | 'v2' | 'v3';

    @ApiProperty({ description: "The new Story's title: the card's name, or \"Imported card\"." })
    title: string;

    @ApiProperty({ description: "The Character's name: the V3 nickname first, else the card's name." })
    characterName: string;

    @ApiProperty()
    creator: string;

    @ApiProperty({ description: "The creator's notes, cut to 2,000 characters. Shown, never kept." })
    creatorNotes: string;

    @ApiProperty({ type: [String], description: 'The first message, then the alternate greetings, each cut to 300 characters, macros as written.' })
    greetings: string[];

    @ApiProperty({ description: 'How many Lore entries will come along.' })
    loreEntries: number;

    @ApiProperty()
    hasPicture: boolean;

    @ApiProperty({ type: String, nullable: true, description: "The Role's name from a Storytell card's own block." })
    roleName: string | null;

    @ApiProperty({ type: [String], description: 'Plain lines for the "Won\'t come along" list.' })
    leftOut: string[];
}

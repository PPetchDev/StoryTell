import { ApiProperty } from '@nestjs/swagger';

import { SUGGESTION_KINDS } from '../../../manager/chat/suggestions/suggestions-prompt.js';

import type { SuggestedReply, SuggestionKind } from '../../../manager/chat/suggestions/suggestions-prompt.js';

export class SuggestedReplyDTO implements SuggestedReply {
    @ApiProperty({
        enum: SUGGESTION_KINDS,
        description: 'action: something the worn identity does; speech: a line it says; move: a bold move that pushes the story on.',
    })
    kind: SuggestionKind;

    @ApiProperty({ description: 'What the user might write, as the worn identity, in the Story\'s point of view and tense.' })
    text: string;
}

export class SuggestionsResponseBodyDTO {
    @ApiProperty({ type: [SuggestedReplyDTO], description: 'Exactly three, in the order action, speech, move.' })
    suggestions: SuggestedReplyDTO[];
}

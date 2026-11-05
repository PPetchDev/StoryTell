import { ApiProperty } from '@nestjs/swagger';

import { MessagePartDTO } from '../../chat/dto/chat.response.dto.js';

/** The Opening preview (Friendly UI ticket 09). In its own file: the chat DTOs import the story DTOs. */
export class OpeningPreviewResponseBodyDTO {
    @ApiProperty({
        type: [MessagePartDTO],
        description: "The stored Opening as a new Chat's first Message holds it, in order.",
    })
    parts: MessagePartDTO[];
}

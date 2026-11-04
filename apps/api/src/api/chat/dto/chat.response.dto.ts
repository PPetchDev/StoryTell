import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { ChatDetail } from '../../../manager/chat/chat.service.js';
import { ChatSummary } from '../../../model/chat/entities/chat.entity.js';
import { MissingFieldDTO } from '../../story/dto/story.response.dto.js';

export class ChatSummaryDTO implements ChatSummary {
    @ApiProperty()
    id: number;

    @ApiProperty()
    storyId: number;

    @ApiProperty({ description: 'Defaults to "Chat N"; renameable.' })
    title: string;

    @ApiProperty({ description: 'When the Chat was started (ISO 8601).' })
    createdAt: string;

    @ApiProperty({ description: 'When a turn last completed in it (ISO 8601).' })
    lastPlayedAt: string;
}

export class ListChatsResponseBodyDTO {
    @ApiProperty({ type: [ChatSummaryDTO], description: 'Most recently played first.' })
    chats: ChatSummaryDTO[];
}

export class MessagePartDTO {
    @ApiProperty({ enum: ['narration', 'speech'] })
    kind: 'narration' | 'speech';

    @ApiPropertyOptional({
        type: Number,
        nullable: true,
        description: 'Speech only: the speaking Character, or null for an unknown or removed one.',
    })
    characterId?: number | null;

    @ApiPropertyOptional({ description: 'Speech only: the stamped speaker name.' })
    speakerName?: string;

    @ApiProperty()
    text: string;
}

export class MessageDTO {
    @ApiProperty()
    id: number;

    @ApiProperty({ enum: ['user', 'ai'] })
    kind: 'user' | 'ai';

    @ApiPropertyOptional({ description: 'User Message only.' })
    text?: string;

    @ApiPropertyOptional({ description: 'User Message only: the identity worn, stamped.' })
    identityName?: string;

    @ApiPropertyOptional({ description: 'AI Message only: the model that wrote it, or "author" for the Opening.' })
    model?: string;

    @ApiPropertyOptional({ type: [MessagePartDTO], description: 'AI Message only, in order.' })
    parts?: MessagePartDTO[];

    @ApiProperty()
    createdAt: string;
}

export class CurrentSceneDTO {
    @ApiProperty()
    id: number;

    @ApiProperty()
    name: string;
}

export class DriftDTO {
    @ApiProperty({ description: 'The model that wrote the last AI Message.' })
    lastModel: string;

    @ApiProperty({ description: 'The play model in Settings now.' })
    playModel: string;
}

/** The whole Chat as the Chat screen reads it. Every write answers with this. */
export class ChatResponseBodyDTO extends ChatSummaryDTO implements Omit<ChatDetail, 'messages'> {
    @ApiProperty({ type: CurrentSceneDTO, nullable: true, description: 'null means free play.' })
    currentScene: CurrentSceneDTO | null;

    @ApiProperty({ description: 'The worn identity, under which User Messages show.' })
    identityName: string;

    @ApiProperty({ type: [MessageDTO], description: 'In order; the Opening is first.' })
    messages: MessageDTO[];

    @ApiProperty({ description: 'True when the last Message is a User Message whose turn failed: Retry applies.' })
    awaitingReply: boolean;

    @ApiProperty({ description: 'False blocks sending.' })
    playable: boolean;

    @ApiProperty({ type: [MissingFieldDTO], description: 'The Story fields still to fill in.' })
    missing: MissingFieldDTO[];

    @ApiProperty({ description: 'True blocks sending.' })
    textCreditOut: boolean;

    @ApiProperty()
    playModel: string;

    @ApiProperty({ type: DriftDTO, nullable: true, description: 'Set when the Drift notice shows.' })
    drift: DriftDTO | null;
}

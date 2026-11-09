import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, Min } from 'class-validator';

import type { DictationLanguage } from '../../../service/model-gateway/model-gateway.js';

/** The multipart fields beside the `audio` file. Multipart sends text, so the duration is converted. */
export class DictationRequestBodyDTO {
    @ApiProperty({ type: 'string', format: 'binary', description: 'The recording: WebM, MP4/M4A, Ogg or WAV, at most 10 MB.' })
    audio: unknown;

    @ApiProperty({ enum: ['th', 'en'], description: 'The language spoken.' })
    @IsIn(['th', 'en'])
    language: DictationLanguage;

    @ApiProperty({ description: 'How long the recording is, as the browser measured it, in milliseconds.', minimum: 0 })
    // An empty field stays missing rather than reading as 0.
    @Transform(({ value }) => (value === '' || value === undefined || value === null ? undefined : Number(value)))
    @IsInt()
    @Min(0)
    durationMs: number;
}

export class DictationResponseBodyDTO {
    @ApiProperty({ description: 'What was heard, trimmed; empty when nothing was.' })
    text: string;
}

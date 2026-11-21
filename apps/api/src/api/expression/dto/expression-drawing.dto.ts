import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

import { ExpressionDrawing } from '../../../manager/expression/expression-drawing.service.js';
import { FACE_EMOTIONS } from '../../../model/story/emotion.js';
import type { FaceEmotion } from '../../../model/story/emotion.js';

export class StartExpressionDrawingRequestBodyDTO {
    @ApiPropertyOptional({ description: 'Draw all thirteen. Without it, only the emotions with no Expression or an outdated drawn one.' })
    @IsOptional()
    @IsBoolean()
    redraw?: boolean;
}

export class ExpressionDrawingFailureDTO {
    @ApiProperty({ description: 'The error code of the drawing it stopped at (docs/error-codes.md).' })
    code: string;

    @ApiProperty()
    message: string;
}

export class ExpressionDrawingResponseBodyDTO implements ExpressionDrawing {
    @ApiProperty({ description: 'A run is drawing now.' })
    running: boolean;

    @ApiProperty({ enum: FACE_EMOTIONS, isArray: true, description: 'What the run draws, in the fixed order of the emotions; empty when idle.' })
    emotions: FaceEmotion[];

    @ApiProperty({ enum: FACE_EMOTIONS, isArray: true, description: 'Drawn so far, each already saved with its cut-out.' })
    drawn: FaceEmotion[];

    @ApiProperty({ enum: FACE_EMOTIONS, nullable: true, type: String, description: 'Being drawn now.' })
    current: FaceEmotion | null;

    @ApiProperty({ type: ExpressionDrawingFailureDTO, nullable: true, description: 'Why the run stopped early; the rest were not drawn.' })
    failed: ExpressionDrawingFailureDTO | null;

    @ApiProperty({ description: 'Stop was asked: the run ends after the drawing under way and draws none of the rest.' })
    stopped: boolean;
}

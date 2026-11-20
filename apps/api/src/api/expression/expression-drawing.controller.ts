import { Body, Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { ExpressionDrawingService } from '../../manager/expression/expression-drawing.service.js';
import { ExpressionDrawingResponseBodyDTO, StartExpressionDrawingRequestBodyDTO } from './dto/expression-drawing.dto.js';

const Id = (name: string) => Param(name, ParseIntPipe);

/**
 * Draw all on the server (.scratch/expression-drawing/spec.md): a run draws a Character's
 * Expressions one after another by itself, and the page asks how it is going.
 */
@ApiTags('Expressions')
@Controller('stories/:storyId/characters/:characterId/expression-drawing')
export class ExpressionDrawingApiController {
    constructor(private readonly drawing: ExpressionDrawingService) {}

    @Post()
    @ApiCreatedResponse({
        type: ExpressionDrawingResponseBodyDTO,
        description:
            'Starts a run and answers at once, or answers the run already going. Idle, with no emotions, when there is nothing to draw. ' +
            'Refused before it starts without a Reference image (409.003.023) or with the Venice pool used up (402.001.004).',
    })
    start(
        @Id('storyId') storyId: number,
        @Id('characterId') characterId: number,
        @Body() body: StartExpressionDrawingRequestBodyDTO,
    ): Promise<ExpressionDrawingResponseBodyDTO> {
        return this.drawing.start(storyId, characterId, body.redraw ?? false);
    }

    @Get()
    @ApiOkResponse({ type: ExpressionDrawingResponseBodyDTO, description: 'The running or last run since the API started, or an idle one.' })
    status(@Id('storyId') storyId: number, @Id('characterId') characterId: number): Promise<ExpressionDrawingResponseBodyDTO> {
        return this.drawing.status(storyId, characterId);
    }
}

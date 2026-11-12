import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiProperty, ApiTags } from '@nestjs/swagger';

import { Public } from '../auth/public.decorator.js';

export class GetHealthResponseBodyDTO {
    @ApiProperty({ description: 'Always `ok` when the API is up.', example: 'ok' })
    status: 'ok';
}

// Used by the dev script and the E2E harness to wait for the API to come up.
@ApiTags('Health')
@Public()
@Controller('health')
export class HealthApiController {
    @Get()
    @ApiOkResponse({ type: GetHealthResponseBodyDTO })
    get(): GetHealthResponseBodyDTO {
        return { status: 'ok' };
    }
}

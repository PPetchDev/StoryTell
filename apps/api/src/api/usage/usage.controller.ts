import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { UsageManagerService } from '../../manager/usage/usage.service.js';
import { UsageResponseBodyDTO } from './dto/usage.response.dto.js';

@ApiTags('Usage')
@Controller('usage')
export class UsageApiController {
    constructor(private readonly usageManager: UsageManagerService) {}

    @Get()
    @ApiOkResponse({ type: UsageResponseBodyDTO })
    current(): Promise<UsageResponseBodyDTO> {
        return this.usageManager.currentUsage();
    }
}

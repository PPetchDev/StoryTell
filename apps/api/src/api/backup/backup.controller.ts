import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { BackupManagerService } from '../../manager/backup/backup.service.js';
import { BackupStatusResponseBodyDTO } from './dto/backup.response.dto.js';
import { OwnerOnly } from '../auth/public.decorator.js';

@ApiTags('Backup')
@OwnerOnly()
@Controller('backup')
export class BackupApiController {
    constructor(private readonly backupManager: BackupManagerService) {}

    @Get()
    @ApiOkResponse({ type: BackupStatusResponseBodyDTO })
    status(): Promise<BackupStatusResponseBodyDTO> {
        return this.backupManager.status();
    }
}

import { ApiProperty } from '@nestjs/swagger';

import type { BackupTarget } from '../../../manager/backup/backup.service.js';
import { BackupStatus, BackupTargetStatus } from '../../../manager/backup/backup.service.js';

export class BackupTargetStatusDTO implements BackupTargetStatus {
    @ApiProperty({ description: 'disk: the folder on the second disk. drive: the encrypted Google Drive remote.', enum: ['disk', 'drive'] })
    target: BackupTarget;

    @ApiProperty({ description: 'Whether this target got the backup.' })
    ok: boolean;

    @ApiProperty({ description: 'When this target finished or failed, ISO 8601.' })
    at: string;

    @ApiProperty({ description: 'What went wrong, when it failed.', nullable: true, type: String })
    error: string | null;
}

export class BackupStatusResponseBodyDTO implements BackupStatus {
    @ApiProperty({ description: 'False when this instance runs no backup job (dev, tests).' })
    configured: boolean;

    @ApiProperty({ description: 'When the last run started, ISO 8601.', nullable: true, type: String })
    attemptedAt: string | null;

    @ApiProperty({ description: "The last run's backup name.", nullable: true, type: String, example: 'storytell-20261104-071500' })
    backup: string | null;

    @ApiProperty({ type: [BackupTargetStatusDTO] })
    targets: BackupTargetStatusDTO[];

    @ApiProperty({ description: 'Why the status could not be read, when it could not.', nullable: true, type: String })
    error: string | null;

    @ApiProperty({ description: 'True when the last run failed a target or its status is unreadable. Play is never blocked.' })
    failed: boolean;
}

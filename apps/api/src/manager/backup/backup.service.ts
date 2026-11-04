import { Injectable } from '@nestjs/common';
import { readFile } from 'node:fs/promises';

import { AppConfig } from '../../config/app-config.js';

export type BackupTarget = 'disk' | 'drive';

/** How old the last run may be before the banner says backups have stopped. */
export const STALE_AFTER_MS = 3 * 24 * 3600_000;

export interface BackupTargetStatus {
    target: BackupTarget;
    ok: boolean;
    /** When this target finished or failed, ISO 8601. */
    at: string;
    error: string | null;
}

export interface BackupStatus {
    /** False in dev and tests, where no backup job runs. */
    configured: boolean;
    /** When the last run started, ISO 8601, or null before the first one. */
    attemptedAt: string | null;
    /** The last run's backup name, e.g. storytell-20261104-071500. */
    backup: string | null;
    targets: BackupTargetStatus[];
    /** Why the status itself could not be read, when it couldn't. */
    error: string | null;
    /** True when the last run failed a target, or its status can't be read. Play is never blocked. */
    failed: boolean;
}

/**
 * Reads what the daily backup job (scripts/backup.mjs) wrote about its last run (spec: "Backup
 * ... Failures are logged and shown as a banner"). The job writes the file; the app only reads it.
 */
@Injectable()
export class BackupManagerService {
    constructor(private readonly config: AppConfig) {}

    async status(): Promise<BackupStatus> {
        const none = { attemptedAt: null, backup: null, targets: [], error: null };
        if (!this.config.backupStatusFile) return { configured: false, ...none, failed: false };

        let raw: string;
        try {
            raw = await readFile(this.config.backupStatusFile, 'utf8');
        } catch (error) {
            // No file yet: the job hasn't run since live was set up. Nothing to warn about.
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { configured: true, ...none, failed: false };
            return { configured: true, ...none, error: `Can't read the backup status: ${(error as Error).message}`, failed: true };
        }

        try {
            const parsed = JSON.parse(raw) as { attemptedAt?: string; backup?: string; targets?: Record<string, unknown> };
            const targets: BackupTargetStatus[] = Object.entries(parsed.targets ?? {}).map(([target, value]) => {
                const entry = value as { ok?: unknown; at?: unknown; error?: unknown };
                return {
                    target: target as BackupTarget,
                    ok: entry.ok === true,
                    at: typeof entry.at === 'string' ? entry.at : '',
                    error: typeof entry.error === 'string' ? entry.error : null,
                };
            });
            // The job tries every hour, so a last run days ago means it has stopped running.
            const attemptedAt = parsed.attemptedAt ?? null;
            const stale = attemptedAt !== null && Date.now() - Date.parse(attemptedAt) > STALE_AFTER_MS;
            return {
                configured: true,
                attemptedAt,
                backup: parsed.backup ?? null,
                targets,
                error: stale ? `No backup has run since ${attemptedAt}.` : null,
                failed: stale || targets.some((target) => !target.ok),
            };
        } catch {
            return { configured: true, ...none, error: 'The backup status file is not valid JSON.', failed: true };
        }
    }
}

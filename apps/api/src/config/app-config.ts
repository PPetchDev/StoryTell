import path from 'node:path';

export type ModelGatewayMode = 'real' | 'fake';

/**
 * Everything the API reads from its environment. Dev and live run as two instances with
 * different values here (port, database, image folder), never with code switches.
 */
export abstract class AppConfig {
    abstract readonly port: number;
    abstract readonly databaseUrl: string;
    /** Absolute path. The database stores image paths relative to this folder. */
    abstract readonly imageDir: string;
    /** `fake` is for tests and E2E runs only; it also mounts the fake's control routes. */
    abstract readonly modelGateway: ModelGatewayMode;
    abstract readonly providerKeys: ProviderKeys;
    /**
     * How long a send waits for the previous turn's background calls before telling the user
     * they are still saving (spec: "Send flow", step 2). Tests shorten it.
     */
    abstract readonly backgroundWaitMs: number;
    /**
     * How long a failed judge, Memory extraction or Snapshot waits before its one automatic
     * retry (.scratch/background-retry/spec.md). Tests and e2e set it to about 0.
     */
    abstract readonly backgroundRetryMs: number;
    /**
     * Where the daily backup job (scripts/backup.mjs) writes how its last run went, so the app
     * can show a failure. Live sets it; dev and tests leave it unset, and then nothing is shown.
     */
    abstract readonly backupStatusFile: string | undefined;
}

export const DEFAULT_BACKGROUND_WAIT_MS = 8_000;
export const DEFAULT_BACKGROUND_RETRY_MS = 20_000;

export interface ProviderKeys {
    /** OpenRouter API key: text calls and the text credit balance. */
    readonly openRouter: string | undefined;
    /** Venice inference key: image calls. */
    readonly venice: string | undefined;
    /** Venice Admin key, optional: reading the image credit balance needs one. */
    readonly veniceAdmin: string | undefined;
}

export class ConfigError extends Error {}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
    const missing = ['PORT', 'DATABASE_URL', 'IMAGE_DIR'].filter((name) => !env[name]);
    if (missing.length > 0) {
        throw new ConfigError(`Missing required environment variables: ${missing.join(', ')}`);
    }

    const port = Number(env.PORT);
    if (!Number.isInteger(port) || port <= 0) {
        throw new ConfigError(`PORT must be a positive integer, got "${env.PORT}"`);
    }

    const modelGateway = env.MODEL_GATEWAY ?? 'real';
    if (modelGateway !== 'real' && modelGateway !== 'fake') {
        throw new ConfigError(`MODEL_GATEWAY must be "real" or "fake", got "${modelGateway}"`);
    }

    const backgroundWaitMs = env.BACKGROUND_WAIT_MS ? Number(env.BACKGROUND_WAIT_MS) : DEFAULT_BACKGROUND_WAIT_MS;
    if (!Number.isInteger(backgroundWaitMs) || backgroundWaitMs < 0) {
        throw new ConfigError(`BACKGROUND_WAIT_MS must be a non-negative integer, got "${env.BACKGROUND_WAIT_MS}"`);
    }

    const backgroundRetryMs = env.BACKGROUND_RETRY_MS ? Number(env.BACKGROUND_RETRY_MS) : DEFAULT_BACKGROUND_RETRY_MS;
    if (!Number.isInteger(backgroundRetryMs) || backgroundRetryMs < 0) {
        throw new ConfigError(`BACKGROUND_RETRY_MS must be a non-negative integer, got "${env.BACKGROUND_RETRY_MS}"`);
    }

    return {
        port,
        databaseUrl: env.DATABASE_URL!,
        imageDir: path.resolve(env.IMAGE_DIR!),
        modelGateway,
        backgroundWaitMs,
        backgroundRetryMs,
        backupStatusFile: env.BACKUP_STATUS_FILE ? path.resolve(env.BACKUP_STATUS_FILE) : undefined,
        providerKeys: {
            openRouter: env.OPENROUTER_API_KEY || undefined,
            // The Venice dashboard calls it an inference key; either name works.
            venice: env.VENICE_API_KEY || env.VENICE_INFERENCE_KEY || undefined,
            veniceAdmin: env.VENICE_ADMIN_KEY || undefined,
        },
    };
}

/** Lets a deployed instance keep its settings in a file: `ENV_FILE=.env.live node dist/main.js`. */
export function loadEnvFile(env: NodeJS.ProcessEnv = process.env): void {
    if (env.ENV_FILE) {
        process.loadEnvFile(env.ENV_FILE);
    }
}

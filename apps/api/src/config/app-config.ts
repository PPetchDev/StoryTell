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
}

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

    return {
        port,
        databaseUrl: env.DATABASE_URL!,
        imageDir: path.resolve(env.IMAGE_DIR!),
        modelGateway,
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

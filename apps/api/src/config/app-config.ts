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
    /**
     * Absolute path of the model file of the app's own background remover (.scratch/own-cutout/spec.md).
     * Where the file is missing, cut-outs are made by Venice as before.
     */
    abstract readonly cutoutModelPath: string;
    /**
     * Absolute path of the speech folder (Read aloud's audio and voice samples). Never inside the
     * image folder: the backup job copies that folder, and audio is not backed up.
     */
    abstract readonly speechDir: string;
    /** `fake` is for tests and E2E runs only; it also mounts the fake's control routes. */
    abstract readonly modelGateway: ModelGatewayMode;
    abstract readonly providerKeys: ProviderKeys;
    /**
     * Where text and embedding calls go, in the order they are tried (.scratch/text-fallback/spec.md):
     * a call a host refuses for credit goes on to the next. One host, OpenRouter, by default.
     */
    abstract readonly textHosts: readonly TextHost[];
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
    /** The address the API listens on. Anything but loopback needs `loginPassword` (.scratch/sign-in/spec.md). */
    abstract readonly host: string;
    /** The owner's sign-in password. Unset: sign-in is off, as in dev and tests. */
    abstract readonly loginPassword: string | undefined;
    /** Keys the session cookie (.scratch/accounts/spec.md: "Session cookie v2"). Unset: derived from `loginPassword`. */
    abstract readonly sessionSecret: string | undefined;
    /** The Supabase project, e.g. https://abcd.supabase.co. Set: Members sign in through it. */
    abstract readonly supabaseUrl: string | undefined;
    /** The Owner Account's email; renames the placeholder the migration made. */
    abstract readonly ownerEmail: string | undefined;
    /** The Supabase project's anon (publishable) key, public by design: the web app signs in with it. */
    abstract readonly supabaseAnonKey: string | undefined;
    /**
     * The Owner checked that Supabase gives an email + password user a session only once their email
     * is confirmed ("Confirm email" on, Supabase's default, or sign-ups off), so such a sign-in may
     * claim a listed email. Otherwise only a Google identity, whose email Google checked, may
     * (.scratch/accounts/spec.md: "Supabase sign-in").
     */
    abstract readonly supabaseEmailsConfirmed: boolean;
    /** Reply alerts' Web Push keys (.scratch/push-alerts/spec.md). Unset: alerts are off and hidden. */
    abstract readonly vapid: VapidConfig | undefined;
    /**
     * How often the Reach-out scheduler ticks (.scratch/reach-outs/spec.md); 0 or unset turns it off,
     * as in tests, which tick it themselves. `REACH_OUT_TICK_MS`, five minutes by default.
     */
    readonly reachOutTickMs?: number;
}

/** The VAPID pair as `web-push generate-vapid-keys` prints it (base64url), and the contact the push service sees. */
export interface VapidConfig {
    readonly publicKey: string;
    readonly privateKey: string;
    readonly subject: string;
}

/** .scratch/push-alerts/spec.md: "Keys and config". */
export const DEFAULT_VAPID_SUBJECT = 'https://storytell.invalid';

/** Spec: "Sign-in". A shorter password is refused at start-up. */
export const LOGIN_PASSWORD_MIN = 12;
/** Spec: "Session cookie v2". */
export const SESSION_SECRET_MIN = 32;
const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

export const DEFAULT_BACKGROUND_WAIT_MS = 8_000;
export const DEFAULT_BACKGROUND_RETRY_MS = 20_000;
/** The Reach-out scheduler's tick (.scratch/reach-outs/spec.md): five minutes. */
export const DEFAULT_REACH_OUT_TICK_MS = 300_000;

export interface ProviderKeys {
    /** OpenRouter API key: text calls and the text credit balance. */
    readonly openRouter: string | undefined;
    /** Venice inference key: image calls. */
    readonly venice: string | undefined;
    /** Venice Admin key, optional: the balance is read with it when set, else with the inference key. */
    readonly veniceAdmin: string | undefined;
}

/** A host text can go to: OpenRouter, Venice, or a free model on OpenRouter (text only, no embeddings). */
export const TEXT_HOSTS = ['openrouter', 'venice', 'free'] as const;
export type TextHost = (typeof TEXT_HOSTS)[number];

/**
 * `TEXT_HOSTS`, a comma-separated chain such as `openrouter,venice,free`. Unset, the one host
 * `TEXT_HOST` names (`openrouter`, the default, or `venice`, as before the chain), so an
 * environment from before keeps working.
 */
function readTextHosts(env: NodeJS.ProcessEnv): TextHost[] {
    if (env.TEXT_HOSTS) {
        const hosts = env.TEXT_HOSTS.split(',').map((host) => host.trim()).filter((host) => host !== '');
        const unknown = hosts.filter((host) => !(TEXT_HOSTS as readonly string[]).includes(host));
        if (hosts.length === 0 || unknown.length > 0) {
            throw new ConfigError(`TEXT_HOSTS must list hosts from ${TEXT_HOSTS.join(', ')}, separated by commas; got "${env.TEXT_HOSTS}"`);
        }
        if (new Set(hosts).size !== hosts.length) throw new ConfigError(`TEXT_HOSTS names a host twice: "${env.TEXT_HOSTS}"`);
        return hosts as TextHost[];
    }
    const textHost = env.TEXT_HOST || 'openrouter';
    if (textHost !== 'openrouter' && textHost !== 'venice') {
        throw new ConfigError(`TEXT_HOST must be "openrouter" or "venice", got "${textHost}"`);
    }
    return [textHost];
}

export class ConfigError extends Error {}

/** A base64url string's decoded length, or -1 when it isn't base64url. */
function base64UrlBytes(text: string): number {
    if (!/^[A-Za-z0-9_-]+$/.test(text)) return -1;
    return Buffer.from(text, 'base64url').length;
}

/**
 * VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY (+ VAPID_SUBJECT). Neither: alerts are off. Half a pair or a
 * malformed key fails start-up, so a typo never leaves alerts silently off.
 */
function readVapid(env: NodeJS.ProcessEnv): VapidConfig | undefined {
    const publicKey = env.VAPID_PUBLIC_KEY?.trim() || undefined;
    const privateKey = env.VAPID_PRIVATE_KEY?.trim() || undefined;
    if (publicKey === undefined && privateKey === undefined) return undefined;
    if (publicKey === undefined || privateKey === undefined) {
        throw new ConfigError('VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY go together: set both, or neither to turn reply alerts off.');
    }
    // An uncompressed P-256 point, and a P-256 private scalar.
    if (base64UrlBytes(publicKey) !== 65) throw new ConfigError('VAPID_PUBLIC_KEY must be the base64url public key `web-push generate-vapid-keys` prints.');
    if (base64UrlBytes(privateKey) !== 32) throw new ConfigError('VAPID_PRIVATE_KEY must be the base64url private key `web-push generate-vapid-keys` prints.');
    const subject = env.VAPID_SUBJECT?.trim() || DEFAULT_VAPID_SUBJECT;
    if (!/^(mailto:\S+|https:\/\/\S+)$/.test(subject)) {
        throw new ConfigError(`VAPID_SUBJECT must be a mailto: or https: address; got "${subject}"`);
    }
    return { publicKey, privateKey, subject };
}

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

    const textHosts = readTextHosts(env);

    const backgroundWaitMs = env.BACKGROUND_WAIT_MS ? Number(env.BACKGROUND_WAIT_MS) : DEFAULT_BACKGROUND_WAIT_MS;
    if (!Number.isInteger(backgroundWaitMs) || backgroundWaitMs < 0) {
        throw new ConfigError(`BACKGROUND_WAIT_MS must be a non-negative integer, got "${env.BACKGROUND_WAIT_MS}"`);
    }

    const backgroundRetryMs = env.BACKGROUND_RETRY_MS ? Number(env.BACKGROUND_RETRY_MS) : DEFAULT_BACKGROUND_RETRY_MS;
    if (!Number.isInteger(backgroundRetryMs) || backgroundRetryMs < 0) {
        throw new ConfigError(`BACKGROUND_RETRY_MS must be a non-negative integer, got "${env.BACKGROUND_RETRY_MS}"`);
    }

    const reachOutTickMs = env.REACH_OUT_TICK_MS ? Number(env.REACH_OUT_TICK_MS) : DEFAULT_REACH_OUT_TICK_MS;
    if (!Number.isInteger(reachOutTickMs) || reachOutTickMs < 0) {
        throw new ConfigError(`REACH_OUT_TICK_MS must be a non-negative integer, got "${env.REACH_OUT_TICK_MS}"`);
    }

    const imageDir = path.resolve(env.IMAGE_DIR!);
    // Default: a folder named `speech` beside the image folder.
    const speechDir = env.SPEECH_DIR ? path.resolve(env.SPEECH_DIR) : path.join(path.dirname(imageDir), 'speech');
    // Default: `models/isnet-anime.onnx` beside the image folder. A file, never a secret; missing is fine.
    const cutoutModelPath = env.CUTOUT_MODEL ? path.resolve(env.CUTOUT_MODEL) : path.join(path.dirname(imageDir), 'models', 'isnet-anime.onnx');
    const fromImages = path.relative(imageDir, speechDir);
    if (fromImages === '' || (!fromImages.startsWith('..') && !path.isAbsolute(fromImages))) {
        throw new ConfigError(
            `SPEECH_DIR (${speechDir}) must not be inside IMAGE_DIR (${imageDir}): the backup copies the image folder, and audio is not backed up.`,
        );
    }

    const host = env.HOST || '127.0.0.1';
    const loginPassword = env.LOGIN_PASSWORD || undefined;
    if (loginPassword !== undefined && loginPassword.length < LOGIN_PASSWORD_MIN) {
        throw new ConfigError(`LOGIN_PASSWORD must be at least ${LOGIN_PASSWORD_MIN} characters.`);
    }
    const sessionSecret = env.SESSION_SECRET || undefined;
    if (sessionSecret !== undefined && sessionSecret.length < SESSION_SECRET_MIN) {
        throw new ConfigError(`SESSION_SECRET must be at least ${SESSION_SECRET_MIN} characters.`);
    }
    const supabaseUrl = env.SUPABASE_URL ? env.SUPABASE_URL.replace(/\/+$/, '') : undefined;
    if (supabaseUrl !== undefined && !/^https?:\/\/[^/]+$/.test(supabaseUrl)) {
        throw new ConfigError(`SUPABASE_URL must be the project URL, like https://abcd.supabase.co; got "${env.SUPABASE_URL}"`);
    }
    if (supabaseUrl !== undefined && sessionSecret === undefined) {
        throw new ConfigError("SUPABASE_URL needs SESSION_SECRET: Members' sessions are keyed by it.");
    }
    // Never open on a public address by mistake: every route would answer anyone.
    if (!LOOPBACK_HOSTS.has(host) && loginPassword === undefined && supabaseUrl === undefined) {
        throw new ConfigError(`HOST is ${host}, which is not loopback: set LOGIN_PASSWORD or SUPABASE_URL so the API needs a sign-in.`);
    }

    return {
        port,
        host,
        loginPassword,
        sessionSecret,
        supabaseUrl,
        ownerEmail: env.OWNER_EMAIL || undefined,
        supabaseAnonKey: env.SUPABASE_ANON_KEY || undefined,
        supabaseEmailsConfirmed: env.SUPABASE_EMAILS_CONFIRMED === 'true',
        vapid: readVapid(env),
        databaseUrl: env.DATABASE_URL!,
        imageDir,
        cutoutModelPath,
        speechDir,
        modelGateway,
        textHosts,
        backgroundWaitMs,
        backgroundRetryMs,
        reachOutTickMs,
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

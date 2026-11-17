import { TextHost as TextHostName } from '../../src/config/app-config.js';
import { FetchLike, SleepFn } from '../../src/service/model-gateway/real/http.js';
import {
    GatewayModelSettings,
    NewUsageRecord,
    RealModelGateway,
} from '../../src/service/model-gateway/real/real-model-gateway.js';
import { buildTextHosts } from '../../src/service/model-gateway/real/text-hosts.js';
import { VeniceClient } from '../../src/service/model-gateway/real/venice-client.js';

export const TEST_KEYS = {
    openRouter: 'sk-or-test-not-a-real-key',
    venice: 'venice-test-not-a-real-key',
    veniceAdmin: 'venice-admin-test-not-a-real-key',
};

export interface GatewayUnderTest {
    gateway: RealModelGateway;
    settings: GatewayModelSettings;
    records: NewUsageRecord[];
    sleeps: number[];
    /** The clock the out-of-credit memory reads; move `now` to let time pass. */
    clock: { now: number };
}

/**
 * The real gateway wired to a scripted `fetch`, in-memory Settings and an in-memory usage
 * log, with sleeps recorded instead of waited. Contract tests drive it exactly as the app
 * module does, minus the database.
 */
export function gatewayUnderTest(
    fetchImpl: FetchLike,
    options: { settings?: Partial<GatewayModelSettings>; veniceAdminKey?: string | undefined; textOnVenice?: boolean; textHosts?: TextHostName[] } = {},
): GatewayUnderTest {
    const settings: GatewayModelSettings = {
        playModel: 'glm-5.3',
        imageModel: 'seedream-v4-edit',
        snapshotSize: '1K',
        samplers: {},
        ...options.settings,
    };
    const records: NewUsageRecord[] = [];
    const sleeps: number[] = [];
    const sleep: SleepFn = async (ms) => {
        sleeps.push(ms);
    };
    const venice = new VeniceClient(TEST_KEYS.venice, 'veniceAdminKey' in options ? options.veniceAdminKey : TEST_KEYS.veniceAdmin, fetchImpl, sleep);
    const clock = { now: 1_000_000 };
    const gateway = new RealModelGateway({
        // .scratch/text-fallback/spec.md: TEXT_HOSTS; `textOnVenice` is TEXT_HOST=venice from before the chain.
        textHosts: buildTextHosts(options.textHosts ?? (options.textOnVenice ? ['venice'] : ['openrouter']), TEST_KEYS, fetchImpl, venice, sleep),
        venice,
        settings: { current: async () => ({ ...settings }) },
        usage: {
            record: async (record) => {
                records.push(record);
            },
        },
        creditCacheMs: 0,
        sleep,
        now: () => clock.now,
    });
    return { gateway, settings, records, sleeps, clock };
}

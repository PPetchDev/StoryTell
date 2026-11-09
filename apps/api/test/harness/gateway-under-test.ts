import { FetchLike, SleepFn } from '../../src/service/model-gateway/real/http.js';
import { OpenRouterClient } from '../../src/service/model-gateway/real/openrouter-client.js';
import {
    GatewayModelSettings,
    NewUsageRecord,
    RealModelGateway,
} from '../../src/service/model-gateway/real/real-model-gateway.js';
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
}

/**
 * The real gateway wired to a scripted `fetch`, in-memory Settings and an in-memory usage
 * log, with sleeps recorded instead of waited. Contract tests drive it exactly as the app
 * module does, minus the database.
 */
export function gatewayUnderTest(
    fetchImpl: FetchLike,
    options: { settings?: Partial<GatewayModelSettings>; veniceAdminKey?: string | undefined } = {},
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
    const gateway = new RealModelGateway({
        openRouter: new OpenRouterClient(TEST_KEYS.openRouter, fetchImpl, sleep),
        venice: new VeniceClient(
            TEST_KEYS.venice,
            'veniceAdminKey' in options ? options.veniceAdminKey : TEST_KEYS.veniceAdmin,
            fetchImpl,
            sleep,
        ),
        settings: { current: async () => ({ ...settings }) },
        usage: {
            record: async (record) => {
                records.push(record);
            },
        },
        creditCacheMs: 0,
        sleep,
    });
    return { gateway, settings, records, sleeps };
}

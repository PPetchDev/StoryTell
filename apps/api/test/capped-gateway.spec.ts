import { CappedModelGateway } from '../src/service/model-gateway/capped-model-gateway.js';
import { FakeModelGateway } from '../src/service/model-gateway/fake-model-gateway.js';
import { MEMBER_CALLS_AT_ONCE, SpendCap } from '../src/service/model-gateway/spend-cap.js';
import { AccountEntity, AccountRole } from '../src/model/account/entities/account.entity.js';
import { requestScope } from '../src/model/account/request-scope.js';
import type { AccountModelService } from '../src/model/account/account.service.js';
import type { UsageRecordModelService } from '../src/model/usage-record/usage-record.service.js';

// .scratch/accounts/spec.md: "Monthly cap". The gateway's own rules, with a stand-in for spend.
function member(id: number, capUsd: number): AccountEntity {
    return Object.assign(new AccountEntity(), { id, email: `m${id}@example.com`, role: AccountRole.Member, monthlyCapUsd: capUsd, disabled: false, removed: false, supabaseId: null });
}

function gatewayWith(spentUsd: number): { gateway: CappedModelGateway; inner: FakeModelGateway } {
    const inner = new FakeModelGateway();
    const accounts = { current: () => requestScope.getStore()!.account } as unknown as AccountModelService;
    const usage = { spentSince: async () => spentUsd } as unknown as UsageRecordModelService;
    return { gateway: new CappedModelGateway(inner, new SpendCap(accounts, usage)), inner };
}

describe('Monthly cap at the gateway', () => {
    it("lets a turn through at the cap: every send checks it before the Member's message is saved", async () => {
        const { gateway, inner } = gatewayWith(5);
        inner.scriptText('turn', 'ok');
        inner.scriptText('suggested_replies', 'never');
        await requestScope.run({ account: member(1, 5) }, async () => {
            await expect(gateway.completeText({ kind: 'turn', messages: [] })).resolves.toMatchObject({ text: 'ok' });
            await expect(gateway.completeText({ kind: 'suggested_replies', messages: [] })).rejects.toMatchObject({ code: '402.010.009' });
        });
    });

    it(`runs at most ${MEMBER_CALLS_AT_ONCE} of a Member's paid calls at once, so racing requests can't spend far past the cap`, async () => {
        const { gateway, inner } = gatewayWith(0);
        let release!: () => void;
        const gate = new Promise<void>((resolve) => (release = resolve));
        const complete = inner.completeText.bind(inner);
        inner.completeText = async (request) => {
            await gate;
            return complete(request);
        };
        for (let i = 0; i <= MEMBER_CALLS_AT_ONCE; i++) inner.scriptText('write_for_me', 'line');
        await requestScope.run({ account: member(2, 5) }, async () => {
            const calls = Array.from({ length: MEMBER_CALLS_AT_ONCE }, () => gateway.completeText({ kind: 'write_for_me', messages: [] }));
            await expect(gateway.completeText({ kind: 'write_for_me', messages: [] })).rejects.toMatchObject({ code: '429.010.013' });
            release();
            await Promise.all(calls);
            // Finished calls free their places.
            await expect(gateway.completeText({ kind: 'write_for_me', messages: [] })).resolves.toMatchObject({ text: 'line' });
        });
    });

    it("never limits the Owner's calls", async () => {
        const { gateway, inner } = gatewayWith(1_000);
        const owner = Object.assign(new AccountEntity(), { id: 9, email: 'o@example.com', role: AccountRole.Owner, monthlyCapUsd: null, disabled: false, removed: false, supabaseId: null });
        for (let i = 0; i < 10; i++) inner.scriptText('write_for_me', 'line');
        await requestScope.run({ account: owner }, async () => {
            await Promise.all(Array.from({ length: 10 }, () => gateway.completeText({ kind: 'write_for_me', messages: [] })));
        });
    });
});

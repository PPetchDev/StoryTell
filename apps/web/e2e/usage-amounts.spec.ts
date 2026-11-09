import { expect, test } from '@playwright/test';

import { CALL_KIND_LABEL, usd } from '../lib/types';

// Spec: Documents, "Usage page". A Document search costs about $0.000005, so it must not read as nothing.
test('a non-zero amount under a cent shows as <$0.01, and zero as $0.00', () => {
    expect(usd(0)).toBe('$0.00');
    expect(usd(0.000005)).toBe('<$0.01');
    expect(usd(0.0099)).toBe('<$0.01');
    expect(usd(0.01)).toBe('$0.01');
    expect(usd(1.234)).toBe('$1.23');
});

test('the Usage page names the Document call kinds', () => {
    expect(CALL_KIND_LABEL.document_embedding).toBe('Document adding');
    expect(CALL_KIND_LABEL.document_search).toBe('Document search');
});

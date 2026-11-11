import { expect, test } from '@playwright/test';

import { afterCause } from '../lib/arcs';

// .scratch/arc-changes/spec.md: each Arc change reads "After …" with the cause the Judge wrote.
// The Judge writes causes as sentences ("The letter arrived."), so a leading article is lowered
// to read on after "After". The web has no unit-test runner, so this runs in Playwright with no page.

test('lowers a leading article so the cause reads on after "After"', () => {
    expect(afterCause('The letter from the mainland arrived.')).toBe('After the letter from the mainland arrived.');
    expect(afterCause('A storm cut the island off.')).toBe('After a storm cut the island off.');
    expect(afterCause('An old friend came back.')).toBe('After an old friend came back.');
});

test('leaves a name, the user and anything else as written', () => {
    expect(afterCause('Ash shared the last of the bread.')).toBe('After Ash shared the last of the bread.');
    expect(afterCause('Theo stood between her and the reeve.')).toBe('After Theo stood between her and the reeve.');
    expect(afterCause('Andrea kept the secret.')).toBe('After Andrea kept the secret.');
    expect(afterCause('the night Petch stayed.')).toBe('After the night Petch stayed.');
    expect(afterCause('  The tide turned.  ')).toBe('After the tide turned.');
});

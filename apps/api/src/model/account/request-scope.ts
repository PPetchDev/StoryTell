import { AsyncLocalStorage } from 'node:async_hooks';

import type { AccountEntity } from './entities/account.entity.js';

/**
 * What one request carries through everything it starts, background work included
 * (.scratch/accounts/spec.md: "Current Account"). The sign-in guard puts the Account on the
 * request; an interceptor then runs the handler inside a scope holding it. A Judge or Snapshot a
 * request starts runs inside the same scope, so its usage records name the same Account.
 */
export interface RequestScope {
    account: AccountEntity;
}

export const requestScope = new AsyncLocalStorage<RequestScope>();

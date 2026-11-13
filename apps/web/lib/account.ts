'use client';

import { createContext, useContext } from 'react';

/** What `GET /api/auth/status` answers (.scratch/sign-in/spec.md, .scratch/accounts/spec.md). */
export interface SignInStatus {
    required: boolean;
    signedIn: boolean;
    account: { id: number; email: string; role: 'owner' | 'member' } | null;
    methods: {
        /** The owner password works. */
        password: boolean;
        /** Google and email sign-in: the Supabase project, public by design. */
        supabase: { url: string; anonKey: string } | null;
    };
}

/** The signed-in Account, set by the sign-in gate once the status is read; null while it can't be read. */
export const AccountContext = createContext<SignInStatus | null>(null);

/**
 * The Account the app is used as. While the status can't be read (the API is down) or sign-in is
 * off, everything is the Owner's, as it was before Accounts.
 */
export function useAccount(): { isOwner: boolean; status: SignInStatus | null } {
    const status = useContext(AccountContext);
    return { isOwner: status?.account?.role !== 'member', status };
}

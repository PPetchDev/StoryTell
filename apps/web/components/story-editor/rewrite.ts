import { RewriteRequest } from '@/lib/story';

/** What a field's Rewrite button shows: in flight, or failed with a message and Retry. */
export type RewriteState = { kind: 'busy' } | { kind: 'error'; message: string };

export type RewriteStates = Record<string, RewriteState | undefined>;

/** One key per rewritable field, so each field shows its own state. */
export function rewriteKey(request: RewriteRequest): string {
    return `${request.target}.${request.id ?? ''}.${request.field}`;
}

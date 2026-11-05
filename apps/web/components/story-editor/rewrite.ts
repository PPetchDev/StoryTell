import { RewriteRequest } from '@/lib/story';

/** What a field's Rewrite button shows: in flight, or failed with a message and Retry. */
export type RewriteState = { kind: 'busy' } | { kind: 'error'; message: string };

export type RewriteStates = Record<string, RewriteState | undefined>;

/** One key per rewritable field, so each field shows its own state. */
export function rewriteKey(request: RewriteRequest): string {
    return `${request.target}.${request.id ?? ''}.${request.field}`;
}

/** The DOM id of a field's input, by the field's rewrite key, so a link can focus it. */
export function fieldDomId(request: RewriteRequest): string {
    return `field-${rewriteKey(request)}`;
}

/** What every rewritable field in the editor is wired to, passed down through the cards as one. */
export interface FieldRewrites {
    states: RewriteStates;
    /** Fields the assistant changed, by their rewrite key (ticket 23). */
    highlights: ReadonlySet<string>;
    onRewrite(request: RewriteRequest): void;
}

/** The props a text field needs to offer ✨, to be jumped to, and to show the assistant's mark. */
export function rewritableField(request: RewriteRequest, rewrites: FieldRewrites) {
    const key = rewriteKey(request);
    return {
        domId: fieldDomId(request),
        rewrite: rewrites.states[key],
        onRewrite: () => rewrites.onRewrite(request),
        highlighted: rewrites.highlights.has(key),
    };
}

'use client';

import { useApiQuery } from '@/components/connection';
import { ErrorState, Loading } from '@/components/query-state';
import type { Autosave } from '@/components/story-editor/autosave';
import { appReplaceRules, ReplaceRuleList as ReplaceRuleListAnswer } from '@/lib/replace-rules';
import { ReplaceRuleList } from './replace-rule-list';

/** Settings' "Replace rules" card: the rules for every Story (.scratch/saved-replies-and-replace-rules/spec.md). */
export function AppReplaceRulesCard({ autosave }: { autosave: Autosave }) {
    const rules = useApiQuery<ReplaceRuleListAnswer>('/replace-rules');
    return (
        <section className="card" aria-label="Replace rules">
            <h2>Replace rules</h2>
            <p className="muted">
                Find and replace, for every Story. On AI Messages changes how replies read, never what is stored: the AI keeps
                reading the original. On my Messages fixes what you send before it is sent. These run before a Story&apos;s own.
            </p>
            {rules.status === 'loading' && <Loading label="Loading Replace rules…" lines={2} />}
            {rules.status === 'error' && <ErrorState title="Couldn't load the Replace rules." error={rules.error} onRetry={rules.retry} />}
            {rules.status === 'ready' && (
                <ReplaceRuleList initial={rules.data.replaceRules} store={appReplaceRules} autosave={autosave} saveKey="replaceRules.app" />
            )}
        </section>
    );
}

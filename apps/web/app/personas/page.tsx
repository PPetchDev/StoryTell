'use client';

import { useApiQuery } from '@/components/connection';
import { PersonaList } from '@/components/personas/persona-list';
import { ErrorState, Loading } from '@/components/query-state';
import { STICKY_HEADER } from '@/components/settings/sticky-header';
import { useAutosave } from '@/components/story-editor/autosave';
import { SaveStatus } from '@/components/story-editor/save-status';
import { PersonaList as PersonaListResponse } from '@/lib/persona';

export default function PersonasPage() {
    const personas = useApiQuery<PersonaListResponse>('/personas');
    const autosave = useAutosave();

    return (
        <main>
            <div className={STICKY_HEADER}>
                <h1>Personas</h1>
                {personas.status === 'ready' && (
                    <div className="flex items-center gap-2">
                        <SaveStatus state={autosave.state} />
                    </div>
                )}
            </div>
            <p className="muted">Your own identities, wearable in any Chat in place of the Story&apos;s Role.</p>
            {personas.status === 'loading' && <Loading label="Loading Personas…" />}
            {personas.status === 'error' && <ErrorState title="Couldn't load your Personas." error={personas.error} onRetry={personas.retry} />}
            {personas.status === 'ready' && <PersonaList initial={personas.data.personas} autosave={autosave} />}
        </main>
    );
}

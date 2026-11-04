'use client';

import { useApiQuery } from '@/components/connection';
import { PersonaList } from '@/components/personas/persona-list';
import { PersonaList as PersonaListResponse } from '@/lib/persona';

export default function PersonasPage() {
    const personas = useApiQuery<PersonaListResponse>('/personas');

    return (
        <main>
            <h1>Personas</h1>
            <p className="muted">Your own identities, wearable in any Chat in place of the Story&apos;s Role.</p>
            {personas.status === 'loading' && <p className="muted">Loading…</p>}
            {personas.status === 'error' && <p role="alert">{personas.error.message}</p>}
            {personas.status === 'ready' && <PersonaList initial={personas.data.personas} />}
        </main>
    );
}

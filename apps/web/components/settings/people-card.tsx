'use client';

import { FormEvent, useId, useState } from 'react';

import { useApiQuery } from '@/components/connection';
import { ErrorState, Loading } from '@/components/query-state';
import { ApiError, apiSend } from '@/lib/api';
import { usd } from '@/lib/types';

/** One row of `GET /api/people` (.scratch/accounts/spec.md). */
interface Person {
    id: number;
    email: string;
    role: 'owner' | 'member';
    monthlyCapUsd: number | null;
    disabled: boolean;
    spentThisMonthUsd: number;
    signedInBefore: boolean;
}

/** An amount in USD from 0 to 1,000, to the cent, as the API takes it. */
function readCap(text: string): number | null {
    if (!/^(\d+(\.\d{0,2})?|\.\d{1,2})$/.test(text.trim())) return null;
    const value = Number(text);
    return value <= 1_000 ? value : null;
}

function failureText(failure: unknown): string {
    return failure instanceof ApiError ? failure.message : "Couldn't save. Try again.";
}

/**
 * Settings → People, the Owner only (.scratch/accounts/spec.md): who may sign in, each Member's
 * Monthly cap and this month's spend.
 */
export function PeopleCard() {
    const people = useApiQuery<{ people: Person[] }>('/people');
    const id = useId();
    const [email, setEmail] = useState('');
    const [cap, setCap] = useState('2');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const add = async (event: FormEvent) => {
        event.preventDefault();
        const capUsd = readCap(cap);
        if (capUsd === null) {
            setError('Enter a cap from 0 to 1,000 dollars, to the cent.');
            return;
        }
        setBusy(true);
        setError(null);
        try {
            await apiSend('POST', '/people', { email: email.trim(), monthlyCapUsd: capUsd });
            setEmail('');
            people.retry();
        } catch (failure) {
            setError(failureText(failure));
        } finally {
            setBusy(false);
        }
    };

    return (
        <section className="card" aria-labelledby={`${id}-heading`}>
            <h3 id={`${id}-heading`} className="card-title">People</h3>
            <p className="muted">
                Who may sign in with Google or email. Each Member plays on your credit up to their Monthly cap, counted from the first of the month (UTC).
                Their Stories are their own.
            </p>
            {people.status === 'loading' && <Loading label="Loading People…" />}
            {people.status === 'error' && <ErrorState title="Couldn't load People." error={people.error} onRetry={people.retry} />}
            {people.status === 'ready' && (
                <ul className="m-0 mb-4 flex list-none flex-col gap-3 p-0" aria-label="People">
                    {people.data.people.map((person) => (
                        <PersonRow key={person.id} person={person} onChanged={people.retry} />
                    ))}
                </ul>
            )}
            <form onSubmit={add} aria-label="Add a person">
                <div className="field-row items-end">
                    <div className="field my-0 min-w-0 flex-1">
                        <label htmlFor={`${id}-email`}>Email</label>
                        <input id={`${id}-email`} type="email" autoComplete="off" value={email} onChange={(event) => setEmail(event.target.value)} required />
                    </div>
                    <div className="field my-0 w-28">
                        <label htmlFor={`${id}-cap`}>Cap (USD)</label>
                        <input id={`${id}-cap`} inputMode="decimal" value={cap} onChange={(event) => setCap(event.target.value)} required />
                    </div>
                </div>
                {error !== null && (
                    <p role="alert" className="field-error">
                        {error}
                    </p>
                )}
                <button type="submit" className="button mt-3" disabled={busy || email.trim() === ''} aria-busy={busy}>
                    {busy ? 'Adding…' : 'Add'}
                </button>
            </form>
        </section>
    );
}

function PersonRow({ person, onChanged }: { person: Person; onChanged: () => void }) {
    const id = useId();
    const [cap, setCap] = useState(person.monthlyCapUsd === null ? '' : String(person.monthlyCapUsd));
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const owner = person.role === 'owner';

    const change = async (work: () => Promise<unknown>) => {
        setBusy(true);
        setError(null);
        try {
            await work();
            onChanged();
        } catch (failure) {
            setError(failureText(failure));
        } finally {
            setBusy(false);
        }
    };

    const saveCap = () => {
        const capUsd = readCap(cap);
        if (capUsd === null) {
            setError('Enter a cap from 0 to 1,000 dollars, to the cent.');
            return;
        }
        if (capUsd !== person.monthlyCapUsd) void change(() => apiSend('PATCH', `/people/${person.id}`, { monthlyCapUsd: capUsd }));
    };

    return (
        <li className="rounded-md border border-line p-3" aria-label={person.email}>
            <p className="m-0 font-bold break-all">{person.email}</p>
            <p className="m-0 mb-2 text-md text-muted">
                {owner ? 'Owner' : person.disabled ? 'Member, paused' : person.signedInBefore ? 'Member' : 'Member, not signed in yet'}
                {' · '}
                {usd(person.spentThisMonthUsd)} this month{person.monthlyCapUsd !== null ? ` of ${usd(person.monthlyCapUsd)}` : ''}
            </p>
            {!owner && (
                <div className="flex flex-wrap items-end gap-2">
                    <div className="field my-0 w-28">
                        <label htmlFor={`${id}-cap`}>Cap (USD)</label>
                        <input id={`${id}-cap`} inputMode="decimal" value={cap} onChange={(event) => setCap(event.target.value)} onBlur={saveCap} disabled={busy} />
                    </div>
                    <button
                        type="button"
                        className="button button-quiet button-small"
                        disabled={busy}
                        onClick={() => void change(() => apiSend('PATCH', `/people/${person.id}`, { disabled: !person.disabled }))}
                    >
                        {person.disabled ? 'Resume' : 'Pause'}
                    </button>
                    <button
                        type="button"
                        className="button button-quiet button-small"
                        disabled={busy}
                        onClick={() => {
                            if (window.confirm(`Remove ${person.email}? They can never sign in again. Their Stories stay, out of reach.`)) {
                                void change(() => apiSend('DELETE', `/people/${person.id}`));
                            }
                        }}
                    >
                        Remove
                    </button>
                </div>
            )}
            {error !== null && (
                <p role="alert" className="field-error">
                    {error}
                </p>
            )}
        </li>
    );
}

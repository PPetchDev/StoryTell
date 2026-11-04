'use client';

import Link from 'next/link';
import { useState } from 'react';

import { useConnection } from '@/components/connection';
import { ApiError, ApiUnreachableError } from '@/lib/api';
import { BondChange, chatApi, ChatDashboard, DashboardBond, DashboardCharacter, formatWhen, messageHref } from '@/lib/chat';

/** "the Message" link to the causing Message, or the seed note when nothing caused it. */
function Cause({ dashboard, messageId }: { dashboard: ChatDashboard; messageId: number | null }) {
    if (messageId === null) return <span className="muted">Set by the author</span>;
    return <Link href={messageHref(dashboard.storyId, dashboard.chatId, messageId)}>Go to the Message</Link>;
}

function BondHistory({ dashboard, history }: { dashboard: ChatDashboard; history: BondChange[] }) {
    return (
        <ol className="bond-history">
            {history.map((change) => (
                <li key={change.id}>
                    <p className="bond-label">
                        {change.before ? `${change.before.label} → ${change.label}` : change.label}
                    </p>
                    <p className="message-text">{change.description}</p>
                    {change.event && <p className="event">Because: {change.event}</p>}
                    <p className="muted small">
                        {formatWhen(change.createdAt)} · <Cause dashboard={dashboard} messageId={change.messageId} />
                    </p>
                </li>
            ))}
        </ol>
    );
}

function BondView({ dashboard, bond, from }: { dashboard: ChatDashboard; bond: DashboardBond; from: string }) {
    const latest = bond.history[0];
    return (
        <details className="bond" aria-label={`${from} toward ${bond.toward.name}`}>
            <summary>
                <span className="bond-toward">→ {bond.toward.name}</span> <span className="bond-label">{bond.label}</span>
                <span className="message-text bond-description">{bond.description}</span>
                {latest?.event && <span className="event">Because: {latest.event}</span>}
            </summary>
            <BondHistory dashboard={dashboard} history={bond.history} />
        </details>
    );
}

function CharacterView({ dashboard, character }: { dashboard: ChatDashboard; character: DashboardCharacter }) {
    return (
        <section className="dashboard-character" aria-label={character.name}>
            <h2>{character.name}</h2>
            <h3>Bonds</h3>
            {character.bonds.length === 0 ? (
                <p className="muted">A stranger to everyone so far.</p>
            ) : (
                character.bonds.map((bond) => (
                    <BondView key={`${bond.toward.characterId ?? 'user'}`} dashboard={dashboard} bond={bond} from={character.name} />
                ))
            )}
            <h3>Arc</h3>
            {character.arcDirection && <p className="muted small">Author&apos;s direction: {character.arcDirection}</p>}
            {character.arcSteps.length === 0 ? (
                <p className="muted">Unchanged from the core definition.</p>
            ) : (
                <ol className="arc-steps">
                    {character.arcSteps.map((step) => (
                        <li key={step.id}>
                            <p className="message-text">{step.step}</p>
                            <p className="event">Because: {step.event}</p>
                            <p className="muted small">
                                {formatWhen(step.createdAt)} · <Cause dashboard={dashboard} messageId={step.messageId} />
                            </p>
                        </li>
                    ))}
                </ol>
            )}
        </section>
    );
}

const STATUS_WORDS = { pending: 'Pending', done: 'Done', failed: 'Failed' } as const;

/**
 * The read-only dashboard (spec: "Dashboard"): each Character's Bonds with their history,
 * its Arc steps, the current Scene and the event that advanced it, and the background
 * status of recent AI Messages with Retry. Nothing here is editable; every item links to
 * the Message that caused it, which is where a bad judgement is rewound.
 */
export function Dashboard({ initial }: { initial: ChatDashboard }) {
    const { reportUnreachable } = useConnection();
    const [dashboard, setDashboard] = useState(initial);
    const [retrying, setRetrying] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);

    const retry = async (messageId: number, call: 'judge' | 'memory') => {
        setRetrying(messageId);
        setError(null);
        try {
            const run = call === 'judge' ? chatApi.retryJudge : chatApi.retryExtraction;
            setDashboard(await run(dashboard.storyId, dashboard.chatId, messageId));
        } catch (caught) {
            if (caught instanceof ApiUnreachableError) reportUnreachable();
            else setError(caught instanceof ApiError ? caught.message : 'The retry failed.');
        } finally {
            setRetrying(null);
        }
    };

    return (
        <main className="dashboard">
            <nav className="breadcrumbs">
                <Link href={`/stories/${dashboard.storyId}/chats/${dashboard.chatId}`}>← {dashboard.title}</Link>
            </nav>
            <h1>Dashboard</h1>
            <p className="muted">
                How the Characters feel and how they have changed in this Chat. Nothing here can be edited: to undo a change,
                edit the Message that caused it.
            </p>

            <section className="dashboard-scene" aria-label="Scene">
                <h2>Scene</h2>
                <p className="message-text">
                    {dashboard.scene.current ? dashboard.scene.current.name : 'Free play'}
                </p>
                {dashboard.scene.advance ? (
                    <>
                        <p className="event">
                            Moved on from {dashboard.scene.advance.fromSceneName}
                            {dashboard.scene.advance.toSceneName ? ` to ${dashboard.scene.advance.toSceneName}` : ' into free play'}:{' '}
                            {dashboard.scene.advance.event}
                        </p>
                        <p className="muted small">
                            {formatWhen(dashboard.scene.advance.createdAt)} ·{' '}
                            <Cause dashboard={dashboard} messageId={dashboard.scene.advance.messageId} />
                        </p>
                    </>
                ) : (
                    <p className="muted">{dashboard.scene.current ? 'The Chat is still on its first Scene.' : 'This Story has no Scenes.'}</p>
                )}
            </section>

            {dashboard.characters.map((character) => (
                <CharacterView key={character.id} dashboard={dashboard} character={character} />
            ))}

            <section className="dashboard-background" aria-label="Background calls">
                <h2>Background calls</h2>
                {dashboard.background.length === 0 ? (
                    <p className="muted">No AI reply has been judged yet.</p>
                ) : (
                    <ul className="background-list">
                        {dashboard.background.map((entry) => (
                            <li key={entry.messageId}>
                                <Link href={messageHref(dashboard.storyId, dashboard.chatId, entry.messageId)}>
                                    Reply {entry.position}
                                </Link>
                                : judge {STATUS_WORDS[entry.judge.status]}
                                {entry.judge.error && <span className="turn-error"> — {entry.judge.error}</span>}
                                {entry.judge.status === 'failed' && (
                                    <button
                                        type="button"
                                        className="button button-quiet button-small"
                                        disabled={retrying !== null}
                                        onClick={() => void retry(entry.messageId, 'judge')}
                                    >
                                        {retrying === entry.messageId ? 'Retrying…' : 'Retry'}
                                    </button>
                                )}
                                {entry.memory && (
                                    <>
                                        {' · '}memory {STATUS_WORDS[entry.memory.status]}
                                        {entry.memory.error && <span className="turn-error"> — {entry.memory.error}</span>}
                                        {entry.memory.status === 'failed' && (
                                            <button
                                                type="button"
                                                className="button button-quiet button-small"
                                                disabled={retrying !== null}
                                                onClick={() => void retry(entry.messageId, 'memory')}
                                            >
                                                {retrying === entry.messageId ? 'Retrying…' : 'Retry'}
                                            </button>
                                        )}
                                    </>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
                {error && (
                    <p role="alert" className="turn-error">
                        {error}
                    </p>
                )}
            </section>
        </main>
    );
}

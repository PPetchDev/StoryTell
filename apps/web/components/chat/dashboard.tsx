'use client';

import Link from 'next/link';
import { useId, useState } from 'react';

import { useConnection } from '@/components/connection';
import { FoldTitle, useFoldedState } from '@/components/fold/fold-button';
import { CharacterPortrait } from '@/components/portrait/character-portrait';
import { BondChart } from './bond-chart';
import { Cast, characterColour, Portraits } from '@/lib/character-colour';
import { ApiError, ApiUnreachableError } from '@/lib/api';
import { afterCause } from '@/lib/arcs';
import {
    BondChange,
    chatApi,
    ChatDashboard,
    DashboardBackground,
    DashboardBond,
    DashboardCharacter,
    formatWhen,
    messageHref,
} from '@/lib/chat';
import { useFolded } from '@/lib/folds';

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
            <BondChart dashboard={dashboard} bond={bond} from={from} />
            <BondHistory dashboard={dashboard} history={bond.history} />
        </details>
    );
}

/** Who a Character is and how they look: the cast and Portraits, from the Story. */
interface Pictures {
    cast: Cast;
    portraits: Portraits;
}

function Portrait({ character, pictures }: { character: DashboardCharacter; pictures: Pictures }) {
    return (
        <CharacterPortrait
            name={character.name}
            colour={characterColour(character.id, pictures.cast)}
            portrait={pictures.portraits[character.id]}
            className="dashboard-portrait"
        />
    );
}

/**
 * One Character's Bonds, under "How the Characters feel", with their picture. They fold, and
 * stay folded on this device in every Chat of the Story until unfolded.
 */
function CharacterBonds({ dashboard, character, pictures }: { dashboard: ChatDashboard; character: DashboardCharacter; pictures: Pictures }) {
    const bodyId = useId();
    const foldKey = `feelings:${character.id}`;
    const folded = useFolded(foldKey);
    return (
        <section className="dashboard-person" aria-label={character.name}>
            <div className="dashboard-person-head">
                <FoldTitle foldKey={foldKey} controls={bodyId}>
                    <Portrait character={character} pictures={pictures} />
                    {character.name}
                </FoldTitle>
            </div>
            <div id={bodyId} hidden={folded} className="dashboard-person-body">
                {character.bonds.length === 0 ? (
                    <p className="muted">A stranger to everyone so far.</p>
                ) : (
                    character.bonds.map((bond) => (
                        <BondView key={`${bond.toward.characterId ?? 'user'}`} dashboard={dashboard} bond={bond} from={character.name} />
                    ))
                )}
            </div>
        </section>
    );
}

/**
 * One Character's Arc, under "How they've changed" (.scratch/arc-changes/spec.md): that they
 * changed and what caused it, never the author's direction or the step's own words. The list
 * starts folded and stays as the user leaves it on this device.
 */
function CharacterArc({ dashboard, character, pictures }: { dashboard: ChatDashboard; character: DashboardCharacter; pictures: Pictures }) {
    const bodyId = useId();
    const foldKey = `arcChanges:${character.id}`;
    const folded = useFoldedState(foldKey, true);
    const count = character.arcChanges.length;
    return (
        <section className="dashboard-person" aria-label={character.name}>
            <div className="dashboard-person-head">
                <Portrait character={character} pictures={pictures} />
                <h3>{character.name}</h3>
            </div>
            {count === 0 ? (
                <p className="muted">Hasn&apos;t changed yet</p>
            ) : (
                <>
                    <FoldTitle foldKey={foldKey} controls={bodyId} as="h4" startsFolded>
                        Changed {count} {count === 1 ? 'time' : 'times'}
                    </FoldTitle>
                    <ol id={bodyId} hidden={folded} className="arc-changes">
                        {character.arcChanges.map((change, index) => (
                            <li key={`${change.messageId}:${index}`}>
                                <p className="event">{afterCause(change.cause)}</p>
                                <p className="muted small">
                                    {formatWhen(change.createdAt)} · <Cause dashboard={dashboard} messageId={change.messageId} />
                                </p>
                            </li>
                        ))}
                    </ol>
                </>
            )}
        </section>
    );
}

/** How a reply's updates read on the Dashboard (spec: "Wording"). */
const UPDATE_WORDS = { upToDate: 'Up to date', updating: 'Updating…', failed: "Couldn't update" } as const;
type UpdateStatus = keyof typeof UPDATE_WORDS;

/**
 * A reply's background calls (its Bond, Arc and Scene update, and its Memory update) as one
 * plain status: any failure wins, then anything still running.
 */
function updateStatusOf(entry: DashboardBackground): UpdateStatus {
    const statuses = [entry.judge.status, entry.memory?.status];
    if (statuses.includes('failed')) return 'failed';
    if (statuses.includes('pending')) return 'updating';
    return 'upToDate';
}

/**
 * The read-only dashboard (spec: "Dashboard"), in plain words: how the Characters feel (their
 * Bonds with history), how they've changed (the events that changed them, never the plan),
 * where the story is (the current Scene and the event that moved it on), and whether each
 * recent reply's updates finished, with Retry. Nothing here is editable; every item links to
 * the Message that caused it, which is where a bad change is rewound.
 */
export function Dashboard({ initial, cast = [], portraits = {} }: { initial: ChatDashboard; cast?: Cast; portraits?: Portraits }) {
    const pictures: Pictures = { cast, portraits };
    const { reportUnreachable } = useConnection();
    const [dashboard, setDashboard] = useState(initial);
    const [retrying, setRetrying] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);

    /** Runs each of the reply's failed calls again, the Bond, Arc and Scene update first. */
    const retry = async (entry: DashboardBackground) => {
        setRetrying(entry.messageId);
        setError(null);
        try {
            if (entry.judge.status === 'failed') {
                setDashboard(await chatApi.retryJudge(dashboard.storyId, dashboard.chatId, entry.messageId));
            }
            if (entry.memory?.status === 'failed') {
                setDashboard(await chatApi.retryExtraction(dashboard.storyId, dashboard.chatId, entry.messageId));
            }
        } catch (caught) {
            if (caught instanceof ApiUnreachableError) reportUnreachable();
            else if (caught instanceof ApiError) setError(caught.message);
            else setError("Couldn't update. Try again in a moment.");
        } finally {
            setRetrying(null);
        }
    };

    return (
        <main className="dashboard wide">
            <nav className="breadcrumbs">
                <Link href={`/stories/${dashboard.storyId}/chats/${dashboard.chatId}`}>← {dashboard.title}</Link>
            </nav>
            <h1>Dashboard</h1>
            <p className="muted">
                How the Characters feel and how they have changed in this Chat. Nothing here can be edited: to undo a change,
                edit the Message that caused it.
            </p>

            <section className="dashboard-character" aria-label="How the Characters feel">
                <h2>How the Characters feel</h2>
                {dashboard.characters.map((character) => (
                    <CharacterBonds key={character.id} dashboard={dashboard} character={character} pictures={pictures} />
                ))}
            </section>

            <section className="dashboard-character" aria-label="How they've changed">
                <h2>How they&apos;ve changed</h2>
                {dashboard.characters.map((character) => (
                    <CharacterArc key={character.id} dashboard={dashboard} character={character} pictures={pictures} />
                ))}
            </section>

            <section className="dashboard-scene" aria-label="Where the story is">
                <h2>Where the story is</h2>
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

            <section className="dashboard-background" aria-label="Updates">
                <h2>Updates</h2>
                <p className="muted small">
                    After each reply, the feelings, changes, Scene and Memories above are brought up to date.
                </p>
                {dashboard.background.length === 0 ? (
                    <p className="muted">No replies yet.</p>
                ) : (
                    <ul className="background-list">
                        {dashboard.background.map((entry) => {
                            const status = updateStatusOf(entry);
                            return (
                                <li key={entry.messageId}>
                                    <Link href={messageHref(dashboard.storyId, dashboard.chatId, entry.messageId)}>
                                        Reply {entry.position}
                                    </Link>
                                    {': '}
                                    {status !== 'failed' && UPDATE_WORDS[status]}
                                    {status === 'failed' && (
                                        <>
                                            <span className="turn-error">{UPDATE_WORDS.failed}</span>
                                            {' — '}
                                            <button
                                                type="button"
                                                className="button button-quiet button-small"
                                                disabled={retrying !== null}
                                                onClick={() => void retry(entry)}
                                            >
                                                {retrying === entry.messageId ? 'Retrying…' : 'Retry'}
                                            </button>
                                        </>
                                    )}
                                </li>
                            );
                        })}
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

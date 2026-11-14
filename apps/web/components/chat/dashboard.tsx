'use client';

import Link from 'next/link';
import { ReactNode, useEffect, useId, useState } from 'react';

import { useConnection } from '@/components/connection';
import { FoldTitle, useFoldedState } from '@/components/fold/fold-button';
import { ArrowLeftIcon } from '@/components/icons';
import { CharacterPortrait } from '@/components/portrait/character-portrait';
import { BondChart } from './bond-chart';
import { Summary } from './disclosure';
import { Cast, characterColour, Portraits } from '@/lib/character-colour';
import { ApiError, apiFetch, ApiUnreachableError } from '@/lib/api';
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

/** A paragraph on the Dashboard: no top margin, a little under. */
const P = 'mt-0 mb-1.5';
/** What caused a change, in the event colour. */
const EVENT = 'mt-0 mb-1 text-note text-event';
/** When and where, under an item. */
const WHEN = 'mt-0 mb-1.5 text-sm text-muted';
/** A Bond's label. */
const LABEL = 'm-0 font-bold text-accent';
/** The numbered lists: a change's history, an Arc's changes, the Updates. */
const LIST = 'mt-3 mb-0 grid gap-3.5 pl-5';
/** A section's card: from 1024px roomier. */
const SECTION = 'mb-4 rounded-xl bg-surface px-5 pt-2 pb-5 lg:px-7 lg:pt-3 lg:pb-6';
/** A section's title. */
const H2 = 'mt-3 mb-3 text-lg font-bold';

/** "the Message" link to the causing Message, or the seed note when nothing caused it. */
function Cause({ dashboard, messageId }: { dashboard: ChatDashboard; messageId: number | null }) {
    if (messageId === null) return <span>Set by the author</span>;
    return <Link href={messageHref(dashboard.storyId, dashboard.chatId, messageId)}>Go to the Message</Link>;
}

function BondHistory({ dashboard, history }: { dashboard: ChatDashboard; history: BondChange[] }) {
    return (
        <ol className={LIST}>
            {history.map((change) => (
                <li key={change.id}>
                    <p className={LABEL}>{change.before ? `${change.before.label} → ${change.label}` : change.label}</p>
                    <p className={`${P} whitespace-pre-wrap`}>{change.description}</p>
                    {change.event && <p className={EVENT}>Because: {change.event}</p>}
                    <p className={WHEN}>
                        {formatWhen(change.createdAt)} · <Cause dashboard={dashboard} messageId={change.messageId} />
                    </p>
                </li>
            ))}
        </ol>
    );
}

/**
 * One Bond: its label and why on the summary, and its chart and history inside. The summary ends in
 * "History" rather than a second chevron under the Character's own (docs/ui-audit-2026-11-13.md, M7).
 */
function BondView({ dashboard, bond, from }: { dashboard: ChatDashboard; bond: DashboardBond; from: string }) {
    const latest = bond.history[0];
    return (
        <details className="group mt-2 border-t border-line py-3" aria-label={`${from} toward ${bond.toward.name}`}>
            <Summary top cue={<HistoryCue />}>
                <span className="grid gap-0.5">
                    <span>
                        <span className="text-sm text-muted">→ {bond.toward.name}</span> <span className={LABEL}>{bond.label}</span>
                    </span>
                    <span className="whitespace-pre-wrap">{bond.description}</span>
                    {latest?.event && <span className="text-note text-event">Because: {latest.event}</span>}
                </span>
            </Summary>
            <BondChart dashboard={dashboard} bond={bond} from={from} />
            <BondHistory dashboard={dashboard} history={bond.history} />
        </details>
    );
}

/** The Bond summary's cue: "History ›" while shut, "Hide" while open. */
function HistoryCue() {
    return (
        <span className="mt-0.5 inline-flex flex-none items-center text-sm font-semibold text-accent" aria-hidden="true">
            <span className="group-open:hidden">History ›</span>
            <span className="hidden group-open:inline">Hide</span>
        </span>
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
            className="size-10 flex-none text-base"
        />
    );
}

/**
 * One Character in a section, with their picture. A line above all but the first; from 1024px they
 * sit two to a row, so the first two have none.
 */
function personClass(index: number): string {
    return ['py-2', index > 0 && 'border-t border-line', index === 1 && 'lg:border-t-0'].filter(Boolean).join(' ');
}

/** A Character's name and picture in a row 44px tall. */
const PERSON_HEAD = 'flex min-h-11 items-center gap-3';

/** A Character's Bonds in one line: "Ash: Curious · Kai: Fond", or that they are a stranger. */
function bondsLine(character: DashboardCharacter): string {
    if (character.bonds.length === 0) return 'A stranger to everyone so far.';
    return character.bonds.map((bond) => `${bond.toward.name}: ${bond.label}`).join(' · ');
}

/**
 * One Character's Bonds, under "How the Characters feel", with their picture. They start folded
 * to one line of labels (docs/ui-audit-2026-11-13.md, M6), and stay open on this device in every
 * Chat of the Story once opened.
 */
function CharacterBonds({
    dashboard,
    character,
    pictures,
    index,
}: {
    dashboard: ChatDashboard;
    character: DashboardCharacter;
    pictures: Pictures;
    index: number;
}) {
    const bodyId = useId();
    const titleId = useId();
    const foldKey = `feelingsOpen:${character.id}`;
    const folded = useFoldedState(foldKey, true);
    return (
        <section className={personClass(index)} aria-labelledby={titleId}>
            <div className={PERSON_HEAD}>
                <FoldTitle foldKey={foldKey} controls={bodyId} id={titleId} startsFolded>
                    <Portrait character={character} pictures={pictures} />
                    {character.name}
                </FoldTitle>
            </div>
            {folded && <p className="mt-0 mb-1 pl-13 text-sm text-muted">{bondsLine(character)}</p>}
            <div id={bodyId} hidden={folded} className="mt-2 py-1">
                {character.bonds.length === 0 ? (
                    <p className={`${P} text-muted`}>A stranger to everyone so far.</p>
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
function CharacterArc({
    dashboard,
    character,
    pictures,
    index,
}: {
    dashboard: ChatDashboard;
    character: DashboardCharacter;
    pictures: Pictures;
    index: number;
}) {
    const bodyId = useId();
    const titleId = useId();
    const foldKey = `arcChanges:${character.id}`;
    const folded = useFoldedState(foldKey, true);
    const count = character.arcChanges.length;
    return (
        <section className={personClass(index)} aria-labelledby={titleId}>
            <div className={PERSON_HEAD}>
                <Portrait character={character} pictures={pictures} />
                <h3 id={titleId} className="m-0 min-w-0 flex-1 text-base font-bold">
                    {character.name}
                </h3>
            </div>
            {count === 0 ? (
                <p className={`mt-2 mb-1.5 text-muted`}>Hasn&apos;t changed yet</p>
            ) : (
                <div className="mt-2">
                    <FoldTitle foldKey={foldKey} controls={bodyId} as="h4" startsFolded>
                        Changed {count} {count === 1 ? 'time' : 'times'}
                    </FoldTitle>
                    <ol id={bodyId} hidden={folded} className={LIST}>
                        {character.arcChanges.map((change, step) => (
                            <li key={`${change.messageId}:${step}`}>
                                <p className={EVENT}>{afterCause(change.cause)}</p>
                                <p className={WHEN}>
                                    {formatWhen(change.createdAt)} · <Cause dashboard={dashboard} messageId={change.messageId} />
                                </p>
                            </li>
                        ))}
                    </ol>
                </div>
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

/** "Reply 2: Up to date", with Retry when it failed. */
function UpdateRow({
    dashboard,
    entry,
    retrying,
    onRetry,
}: {
    dashboard: ChatDashboard;
    entry: DashboardBackground;
    retrying: number | null;
    onRetry(entry: DashboardBackground): void;
}) {
    const status = updateStatusOf(entry);
    return (
        <li>
            <Link href={messageHref(dashboard.storyId, dashboard.chatId, entry.messageId)}>Reply {entry.position}</Link>
            {': '}
            {status !== 'failed' && UPDATE_WORDS[status]}
            {status === 'failed' && (
                <>
                    <span className="turn-error">{UPDATE_WORDS.failed}</span>
                    {' — '}
                    <button
                        type="button"
                        className="button button-quiet button-small ml-2"
                        disabled={retrying !== null}
                        aria-busy={retrying === entry.messageId || undefined}
                        onClick={() => onRetry(entry)}
                    >
                        {retrying === entry.messageId ? 'Retrying…' : 'Retry'}
                    </button>
                </>
            )}
        </li>
    );
}

/** How often the Dashboard reads itself again while a reply is still updating (audit M55). */
const UPDATING_POLL_MS = 3000;

/** A section headed by its h2, which names it (audit L36). */
function Section({ title, className = SECTION, children }: { title: string; className?: string; children: ReactNode }) {
    const id = useId();
    return (
        <section className={className} aria-labelledby={id}>
            <h2 id={id} className={`${H2} lg:col-span-full`}>
                {title}
            </h2>
            {children}
        </section>
    );
}

/** The Characters' sections: from 1024px, two to a row under the title. */
const PEOPLE_SECTION = `${SECTION} lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-10`;

/**
 * The read-only dashboard (spec: "Dashboard"), in plain words: where the story is (the current
 * Scene and the event that moved it on), how the Characters feel (their Bonds with history), how
 * they've changed (the events that changed them, never the plan), and whether each recent reply's
 * updates finished, with Retry. Nothing here is editable; every item links to
 * the Message that caused it, which is where a bad change is rewound.
 */
export function Dashboard({ initial, cast = [], portraits = {} }: { initial: ChatDashboard; cast?: Cast; portraits?: Portraits }) {
    const pictures: Pictures = { cast, portraits };
    const { reportUnreachable } = useConnection();
    const [dashboard, setDashboard] = useState(initial);
    const [retrying, setRetrying] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const updating = dashboard.background.some((entry) => updateStatusOf(entry) === 'updating');
    const done = dashboard.background.filter((entry) => updateStatusOf(entry) === 'upToDate');
    const pending = dashboard.background.filter((entry) => updateStatusOf(entry) !== 'upToDate');

    // "Updating…" turns into what happened without a reload: read again every few seconds until nothing is running.
    useEffect(() => {
        if (!updating) return;
        let cancelled = false;
        const timer = setTimeout(() => {
            apiFetch<ChatDashboard>(`/stories/${dashboard.storyId}/chats/${dashboard.chatId}/dashboard`).then(
                (next) => !cancelled && setDashboard(next),
                () => {},
            );
        }, UPDATING_POLL_MS);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [updating, dashboard]);

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
        <main className="wide">
            {/* The one way back on a phone, which has no bottom bar here: a button, not a small link (audit Low, Dashboard). */}
            <nav className="mb-3" aria-label="Breadcrumb">
                <Link href={`/stories/${dashboard.storyId}/chats/${dashboard.chatId}`} className="button button-quiet max-w-full">
                    <ArrowLeftIcon size={18} className="flex-none" />
                    <span className="min-w-0 truncate">Back to {dashboard.title}</span>
                </Link>
            </nav>
            <h1>Dashboard</h1>
            <p className="mt-0 mb-4 text-muted">
                How the Characters feel and how they have changed in this Chat. Nothing here can be edited: to undo a change,
                edit the Message that caused it.
            </p>

            <Section title="Where the story is">
                <p className={`${P} whitespace-pre-wrap`}>{dashboard.scene.current ? dashboard.scene.current.name : 'Free play'}</p>
                {dashboard.scene.advance ? (
                    <>
                        <p className={EVENT}>
                            Moved on from {dashboard.scene.advance.fromSceneName}
                            {dashboard.scene.advance.toSceneName ? ` to ${dashboard.scene.advance.toSceneName}` : ' into free play'}:{' '}
                            {dashboard.scene.advance.event}
                        </p>
                        <p className={WHEN}>
                            {formatWhen(dashboard.scene.advance.createdAt)} ·{' '}
                            <Cause dashboard={dashboard} messageId={dashboard.scene.advance.messageId} />
                        </p>
                    </>
                ) : (
                    <p className={`${P} text-muted`}>
                        {dashboard.scene.current ? 'The Chat is still on its first Scene.' : 'This Story has no Scenes.'}
                    </p>
                )}
            </Section>

            <Section title="How the Characters feel" className={PEOPLE_SECTION}>
                {dashboard.characters.map((character, index) => (
                    <CharacterBonds key={character.id} dashboard={dashboard} character={character} pictures={pictures} index={index} />
                ))}
            </Section>

            <Section title="How they've changed" className={PEOPLE_SECTION}>
                {dashboard.characters.map((character, index) => (
                    <CharacterArc key={character.id} dashboard={dashboard} character={character} pictures={pictures} index={index} />
                ))}
            </Section>

            <Section title="Updates">
                <p className={`${P} text-sm text-muted`}>After each reply, the feelings, changes, Scene and Memories above are brought up to date.</p>
                {dashboard.background.length === 0 ? (
                    <p className={`${P} text-muted`}>No replies yet.</p>
                ) : (
                    // Polite: when "Updating…" turns into the result, it is said.
                    <div aria-live="polite">
                        {/* Replies still updating or that failed stay in sight, each with its Retry. */}
                        {pending.length > 0 && (
                            <ul className={LIST}>
                                {pending.map((entry) => (
                                    <UpdateRow key={entry.messageId} dashboard={dashboard} entry={entry} retrying={retrying} onRetry={(e) => void retry(e)} />
                                ))}
                            </ul>
                        )}
                        {/* The rest in one line (M6), each reply a tap away. */}
                        {done.length > 0 && (
                            <details className="group mt-3">
                                <Summary>
                                    <span>
                                        {pending.length === 0 ? 'All' : 'The other'} {done.length} {done.length === 1 ? 'reply is' : 'replies are'} up
                                        to date
                                    </span>
                                </Summary>
                                <ul className={LIST}>
                                    {done.map((entry) => (
                                        <UpdateRow key={entry.messageId} dashboard={dashboard} entry={entry} retrying={retrying} onRetry={(e) => void retry(e)} />
                                    ))}
                                </ul>
                            </details>
                        )}
                    </div>
                )}
                {error && (
                    <p role="alert" className="turn-error mt-2 mb-0">
                        {error}
                    </p>
                )}
            </Section>
        </main>
    );
}

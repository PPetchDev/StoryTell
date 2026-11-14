'use client';

import Link from 'next/link';
import { useEffect, useId, useState, useSyncExternalStore } from 'react';

import { bondsLine } from '@/components/chat/dashboard';
import { CharacterPortrait } from '@/components/portrait/character-portrait';
import { apiFetch } from '@/lib/api';
import { Cast, characterColour, Portraits } from '@/lib/character-colour';
import { Chat, ChatDashboard, latestReply } from '@/lib/chat';

/** Wide enough for the Chat column and the panel side by side, beside the rail. */
const WIDE = '(min-width: 80rem)';

function subscribe(onChange: () => void): () => void {
    const query = window.matchMedia(WIDE);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
}

/** Whether the window is wide enough for the panel; false on the server and on a phone. */
function useWide(): boolean {
    return useSyncExternalStore(
        subscribe,
        () => window.matchMedia(WIDE).matches,
        () => false,
    );
}

const H3 = 'mt-0 mb-2 text-sm font-semibold tracking-wide text-muted uppercase';

/**
 * The Dashboard at a glance, in the room right of the Chat on a wide screen (docs/ui-audit-2026-11-13.md,
 * Low, Desktop): where the story is and how each Character feels, one line each, read again after
 * every reply and once its Bond update is done. The full Dashboard is a tap away. A phone never
 * reads it; the Memory drawer, docked on that side, takes its place while open.
 */
export function ChatGlance({ chat, cast, portraits }: { chat: Chat; cast: Cast; portraits: Portraits }) {
    const wide = useWide();
    const headingId = useId();
    const sceneId = useId();
    const feelingsId = useId();
    const [dashboard, setDashboard] = useState<ChatDashboard | null>(null);
    const reply = latestReply(chat);
    const updating = reply?.judge?.status === 'pending';
    // What changes when the Dashboard may have: a new Message, the reply's update finishing, a new Scene.
    const revision = `${chat.messages.length}:${reply?.id ?? 0}:${reply?.judge?.status ?? ''}:${chat.currentScene?.id ?? 0}`;

    useEffect(() => {
        if (!wide) return;
        let cancelled = false;
        apiFetch<ChatDashboard>(`/stories/${chat.storyId}/chats/${chat.id}/dashboard`).then(
            (next) => !cancelled && setDashboard(next),
            // The panel keeps what it showed; the Dashboard itself says what failed.
            () => {},
        );
        return () => {
            cancelled = true;
        };
    }, [wide, chat.storyId, chat.id, revision]);

    if (!wide) return null;
    return (
        <aside
            className="chat-glance fixed inset-y-0 right-0 hidden w-[18rem] overflow-y-auto overscroll-contain border-l border-line bg-[color-mix(in_srgb,var(--surface)_30%,var(--bg))] px-5 pt-6 pb-8 min-[80rem]:block"
            aria-labelledby={headingId}
        >
            <h2 id={headingId} className="mt-0 mb-4 text-lg font-bold">
                At a glance
            </h2>
            {!dashboard ? (
                <p className="m-0 text-sm text-muted">Loading…</p>
            ) : (
                <>
                    <section className="mb-5" aria-labelledby={sceneId}>
                        <h3 id={sceneId} className={H3}>
                            Where the story is
                        </h3>
                        <p className="m-0 [overflow-wrap:anywhere]">{dashboard.scene.current ? dashboard.scene.current.name : 'Free play'}</p>
                    </section>
                    <section className="mb-5" aria-labelledby={feelingsId}>
                        <h3 id={feelingsId} className={H3}>
                            How the Characters feel
                        </h3>
                        {updating && <p className="mt-0 mb-2 text-sm text-muted">Updating after the last reply…</p>}
                        <ul className="m-0 grid list-none gap-3 p-0">
                            {dashboard.characters.map((character) => (
                                <li key={character.id} className="flex items-start gap-2.5">
                                    <CharacterPortrait
                                        name={character.name}
                                        colour={characterColour(character.id, cast)}
                                        portrait={portraits[character.id]}
                                        className="size-8 flex-none text-sm"
                                    />
                                    <span className="grid min-w-0">
                                        <strong className="text-md [overflow-wrap:anywhere]">{character.name}</strong>
                                        <span className="text-sm text-muted [overflow-wrap:anywhere]">{bondsLine(character)}</span>
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </section>
                    <Link href={`/stories/${chat.storyId}/chats/${chat.id}/dashboard`} className="button button-quiet w-full">
                        Open the Dashboard
                    </Link>
                </>
            )}
        </aside>
    );
}

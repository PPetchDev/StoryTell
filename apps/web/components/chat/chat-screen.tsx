'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ChatBackdrop } from '@/components/chat/backdrop';
import { CharacterRow } from '@/components/chat/character-row';
import { ChatComposer } from '@/components/chat/chat-composer';
import { ChatThread, OpenAt, PendingLine } from '@/components/chat/chat-thread';
import { ChatTopBar } from '@/components/chat/chat-top-bar';
import { MemoryDrawer } from '@/components/chat/memory-drawer';
import { NovelRequest, NovelView } from '@/components/chat/novel-view';
import { SceneStrip } from '@/components/chat/scene-strip';
import { SnapshotSheet } from '@/components/chat/snapshot-sheet';
import { SnapshotViewer, useChatSnapshots } from '@/components/chat/snapshots';
import { useThaiReadings } from '@/components/chat/thai-reading';
import { useConnection } from '@/components/connection';
import { ApiError, apiFetch, ApiUnreachableError, StreamBrokenError, StreamStoppedError } from '@/lib/api';
import { backdropOf } from '@/lib/backdrop';
import { handOffBranch, takeBranchHandoff } from '@/lib/branch';
import { Cast, Portraits } from '@/lib/character-colour';
import { setChatView, useChatView } from '@/lib/chat-view';
import { backgroundPending, Chat, chatApi, EditedChat, latestReply, Message, MessagePart, rollbackNotice, TurnStream } from '@/lib/chat';
import { Memory, memoryApi, renderUser } from '@/lib/memory';
import { setSceneStripHidden, useSceneStripHidden } from '@/lib/scene-strip';
import { inThreadOrder, Snapshot, snapshotApi } from '@/lib/snapshot';
import { Scene, Story } from '@/lib/story';

import { applyReplaceRules, onMineRules } from '@/lib/replace-rules';
import { ReadAloudProvider, useReadAloudPlayer } from './read-aloud';
import { ShownTextProvider } from './shown-text';
import styles from './chat-screen.module.css';

/** A "Memory added" toast (spec: story 83): one per Memory the AI added in the latest turn. */
interface Toast {
    memoryId: number;
    text: string;
}

/** How long the "Memory added" toasts stay before they go on their own; a tap before then opens the Memory. */
const TOAST_MS = 3_000;

/** How often the Chat is re-read while the last reply's background calls run. */
const BACKGROUND_POLL_MS = 1_000;

/**
 * The Chat screen (spec: "Chat screen"): a top bar, the thread and the composer. Every turn
 * streams (spec: streaming replies): the reply shows as it is written, with the "writing"
 * indicator after it, and ■ Stop ends it early. A stopped or failed turn leaves nothing of the
 * reply, and a User Message it was answering stays with Retry. Any Message can be edited in
 * place, which discards the Messages after it and rolls back their changes, with a short
 * notice of what went; Reset starts the Chat over from the Opening. Bonds and Arcs never show here: the dashboard link
 * leads to them. Memory does: the drawer lists it, and a "Memory added" toast appears for each
 * Memory the AI adds once a turn's extraction is done. 📷 in the newest reply's action row
 * opens a sheet that takes a Snapshot of the latest AI Message while play goes on; Snapshots
 * show under their Message, and a tap opens one full screen.
 */
interface ChatScreenProps {
    initial: Chat;
    cast: Cast;
    /** The cast's Reference images, beside their lines. */
    portraits: Portraits;
    /** The Story's Characters in cast order, for "Who's in this Chat"; empty if the Story can't be read. */
    characters: readonly { id: number; name: string }[];
    /** The Story's Scenes, for the goals in the Scene strip; empty if the Story can't be read. */
    scenes: Scene[];
    /** The Story's Backdrop choice and Cover; null if the Story can't be read, which shows no Backdrop. */
    looks: Pick<Story, 'backdrop' | 'cover'> | null;
}

export function ChatScreen({ initial, cast, characters, portraits, scenes, looks }: ChatScreenProps) {
    const { reportUnreachable } = useConnection();
    const router = useRouter();
    const [chat, setChat] = useState(initial);
    // A new Thai reading goes on its Message in place: nothing else in the Chat changed.
    const thaiReadings = useThaiReadings(chat.storyId, chat.id, (messageId, text) =>
        setChat((current) => ({
            ...current,
            messages: current.messages.map((message) => (message.id === messageId ? { ...message, thaiReading: text } : message)),
        })),
    );
    const [draft, setDraft] = useState('');
    /** The line just sent, shown in the thread until the turn settles. */
    const [pending, setPending] = useState<PendingLine | null>(null);
    const [writing, setWriting] = useState(false);
    /** The reply so far while a turn streams; null before its first words and once it settles. */
    const [replySoFar, setReplySoFar] = useState<MessagePart[] | null>(null);
    /** Stops the turn being written. */
    const stopRef = useRef<AbortController | null>(null);
    const [busy, setBusy] = useState(false);
    /**
     * The Character nudged for the next turn (.scratch/speaker-controls/spec.md, "Nudge"): sent with
     * the next send, Continue, Retry, Again or User Message edit, never stored, gone on leaving.
     */
    const [nudge, setNudge] = useState<number | null>(null);
    /** Each tap on the Character row's "Who's here" opens the sheet in the top bar. */
    const [whoRequest, setWhoRequest] = useState(0);
    const [editing, setEditing] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [rollback, setRollback] = useState<string | null>(null);
    const [drawer, setDrawer] = useState<{ open: boolean; focus: number | null; version: number }>({ open: false, focus: null, version: 0 });
    const [toasts, setToasts] = useState<Toast[]>([]);
    const snaps = useChatSnapshots(initial.storyId, initial.id);
    const [viewing, setViewing] = useState<Snapshot | null>(null);
    const [snapshotSheet, setSnapshotSheet] = useState(false);
    /** The reply ↺ Again is replacing, hidden from the thread while the new one is written. */
    const [replacing, setReplacing] = useState<number | null>(null);
    /** The reply whose finished extraction was already announced, so a re-read never toasts twice. */
    const announcedRef = useRef<number | null>(latestReply(initial)?.id ?? null);
    /** Read aloud's one player: the screen owns it, so it outlives whatever shows the Messages. Leaving stops it. */
    const player = useReadAloudPlayer(initial.storyId, initial.id);
    /** Stops the reading when it is this Message's: ↺ Again, an edit or another version changes its words. */
    /** The Visual novel view (.scratch/chat-looks/spec.md): this device's choice, the moves the screen asks of it, and where it is. */
    const novel = useChatView() === 'novel';
    const [novelRequest, setNovelRequest] = useState<NovelRequest | null>(null);
    const askNovel = (kind: NovelRequest['kind']) => setNovelRequest((current) => ({ kind, nonce: (current?.nonce ?? 0) + 1 }));
    const novelAtRef = useRef<number | null>(null);
    const onNovelPosition = useCallback((messageId: number | null) => {
        novelAtRef.current = messageId;
    }, []);
    /** To the thread, opening at a Message: the one on show in the view, or a Memory's jump link's (outlined). */
    const [threadAt, setThreadAt] = useState<OpenAt | null>(null);
    const showThreadAt = (messageId: number | null, mark = false) => {
        setThreadAt(messageId === null ? null : { messageId, mark });
        setChatView('thread');
    };
    const stopReading = (messageId: number) => {
        if (player.messageId === messageId) player.stop();
    };

    // A Message an edit or a Reset took away is no longer read.
    const { messageId: readingId, stop: stopPlayer } = player;
    useEffect(() => {
        if (readingId !== null && !chat.messages.some((message) => message.id === readingId)) stopPlayer();
    }, [chat.messages, readingId, stopPlayer]);

    // A Chat just made by ⑂ Branch: the quiet "Branched from" line, and a User Message's text in the composer.
    useEffect(() => {
        const handoff = takeBranchHandoff(initial.id);
        if (!handoff) return;
        setRollback(`Branched from ${handoff.from}.`);
        if (handoff.draft !== null) setDraft(handoff.draft);
    }, [initial.id]);

    // While the last reply's background calls run, re-read the Chat until they settle.
    useEffect(() => {
        if (!backgroundPending(chat)) return;
        const timer = setTimeout(() => {
            apiFetch<Chat>(`/stories/${chat.storyId}/chats/${chat.id}`).then(setChat, (caught: unknown) => {
                if (caught instanceof ApiUnreachableError) reportUnreachable();
            });
        }, BACKGROUND_POLL_MS);
        return () => clearTimeout(timer);
    }, [chat, reportUnreachable]);

    // Once a reply's extraction is done, announce what the AI added and let the drawer re-read.
    useEffect(() => {
        const reply = latestReply(chat);
        if (!reply || reply.memory?.status !== 'done' || announcedRef.current === reply.id) return;
        announcedRef.current = reply.id;
        setDrawer((current) => ({ ...current, version: current.version + 1 }));
        memoryApi.list(chat.storyId, chat.id).then(
            (list) => {
                const added = list.memories.filter((memory: Memory) => memory.messageId === reply.id && memory.writtenBy === 'ai');
                setToasts(added.map((memory) => ({ memoryId: memory.id, text: renderUser(memory.text, list.identityName) })));
            },
            () => {
                // The drawer shows the Memory either way; a missed toast is no loss.
            },
        );
    }, [chat]);

    // The toasts announce, they don't wait to be dismissed: they go after TOAST_MS, and the drawer keeps the Memories.
    useEffect(() => {
        if (toasts.length === 0) return;
        const timer = setTimeout(() => setToasts([]), TOAST_MS);
        return () => clearTimeout(timer);
    }, [toasts]);

    const blocked = !chat.playable || chat.textCreditOut;
    // A Character set sitting out can't stay nudged (.scratch/speaker-controls/spec.md).
    useEffect(() => {
        if (nudge !== null && chat.sittingOut.includes(nudge)) setNudge(null);
    }, [nudge, chat.sittingOut]);

    const stripHidden = useSceneStripHidden();

    const openMemory = (memoryId: number | null = null) => {
        setDrawer((current) => ({ open: true, focus: memoryId, version: current.version }));
        if (memoryId !== null) setToasts((current) => current.filter((toast) => toast.memoryId !== memoryId));
    };

    /** Scrolls to a Message and outlines it, from a Memory's jump link. */
    const jumpTo = (messageId: number) => {
        if (novel) {
            showThreadAt(messageId, true);
            return;
        }
        const target = document.getElementById(`message-${messageId}`);
        if (!target) return;
        window.history.replaceState(null, '', `#message-${messageId}`);
        for (const marked of document.querySelectorAll('.message-target')) marked.classList.remove('message-target');
        target.scrollIntoView({ block: 'center' });
        target.classList.add('message-target');
    };

    /**
     * The Chat after a write that may have changed the Memory (an edit, a reset): the drawer
     * re-reads, old toasts go, and the reply's extraction, which runs again after an edit,
     * is announced afresh once it is done.
     */
    const refreshMemory = (next: Chat): Chat => {
        setDrawer((current) => ({ ...current, version: current.version + 1 }));
        setToasts([]);
        announcedRef.current = null;
        // Snapshots of discarded or edited Messages left the timeline for the Gallery.
        void snaps.refresh();
        return next;
    };

    /** The edited Chat, after noting what its rewind rolled back. */
    const noteRollback = (edited: EditedChat): Chat => {
        setRollback(rollbackNotice(edited.rolledBack));
        return edited;
    };

    /**
     * Runs a turn as a stream, with the writing indicator up: each `parts` event shows the
     * reply so far. A failed or stopped turn drops the reply at once and re-reads the Chat,
     * since the User Message may have been stored before the turn failed: it then shows with
     * Retry. A failure shows its error; a Stop does not. `unsent` is called when the User
     * Message wasn't stored, so its text isn't lost.
     */
    const runTurn = async (turn: (stream: TurnStream) => Promise<Chat>, unsent?: () => void) => {
        const stop = new AbortController();
        stopRef.current = stop;
        setWriting(true);
        setError(null);
        setRollback(null);
        try {
            const next = await turn({ signal: stop.signal, onParts: setReplySoFar });
            setChat(next);
            // The nudge rode on this turn, which answered with its reply; a failed or stopped one keeps it for Retry.
            setNudge(null);
            readNewReply(next);
        } catch (caught) {
            setReplySoFar(null);
            if (caught instanceof ApiUnreachableError) {
                unsent?.();
                reportUnreachable();
                return;
            }
            if (!(caught instanceof StreamStoppedError)) {
                setError(caught instanceof ApiError || caught instanceof StreamBrokenError ? caught.message : 'The turn failed.');
            }
            // A stream that broke off had begun, so the API had stored the User Message by then.
            const stored = caught instanceof StreamBrokenError;
            try {
                const reread = await apiFetch<Chat>(`/stories/${chat.storyId}/chats/${chat.id}`);
                setChat(reread);
                if (!reread.awaitingReply) unsent?.();
            } catch (rereadFailed) {
                // The error above already tells the user; a reload shows the rest.
                if (!stored) unsent?.();
                if (rereadFailed instanceof ApiUnreachableError) reportUnreachable();
            }
        } finally {
            stopRef.current = null;
            setReplySoFar(null);
            setWriting(false);
            setPending(null);
        }
    };

    /**
     * Read replies aloud (.scratch/read-aloud/spec.md, "Auto-read"): a reply that a turn started
     * here has just stored, once the turn has settled. Never on load, a version change, a Reset,
     * a stopped or failed turn, or a reply from another tab: only runTurn's success calls this.
     */
    const readNewReply = (next: Chat) => {
        const reply = next.messages[next.messages.length - 1];
        if (next.autoRead && reply?.kind === 'ai') player.play(reply.id);
    };

    /** ■ Stop: ends the reply being written; the API keeps nothing of it. */
    const stopTurn = () => stopRef.current?.abort();

    /** A write that runs no turn: an AI Message edit, Reset, or a judge retry. */
    const runWrite = async (write: () => Promise<Chat>) => {
        setBusy(true);
        setError(null);
        setRollback(null);
        try {
            setChat(await write());
        } catch (caught) {
            if (caught instanceof ApiUnreachableError) reportUnreachable();
            else setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
        } finally {
            setBusy(false);
        }
    };

    /**
     * Sends at once (spec: "Send feedback"): the composer clears and the line shows in the
     * thread while the reply is written. If the API never stored it, the draft goes back in
     * the composer. The Chat's On my Messages Replace rules run first, and their result is what
     * is sent, shown and stored (.scratch/saved-replies-and-replace-rules/spec.md: "Where my-side
     * rules run"); a result with nothing left sends nothing and keeps the draft.
     */
    const send = () => {
        if (draft.trim() === '' || writing || blocked) return;
        const typed = draft;
        const text = applyReplaceRules(typed, onMineRules(chat.replaceRules));
        if (text.trim() === '') {
            setError('Your Replace rules left nothing to send.');
            return;
        }
        setDraft('');
        // Inside the tap, so iOS lets the reply play by itself later.
        player.unlock();
        setPending({ text, identityName: chat.identityName });
        void runTurn(
            (stream) => chatApi.send(chat.storyId, chat.id, text, stream, nudge),
            () => setDraft((current) => (current === '' ? typed : current)),
        );
    };

    /** ▶ (spec: "Continue"): a turn with no User Message. A failed one stores nothing, so ▶ again is the way on. */
    const continueStory = () => {
        if (writing || busy || blocked || chat.awaitingReply) return;
        player.unlock();
        void runTurn((stream) => chatApi.continue(chat.storyId, chat.id, stream, nudge));
    };

    /**
     * ↺ Again (spec: "Regenerate"): the newest reply is written again in place, with the writing
     * indicator where it was, and the rollback notice notes what it had changed. The replaced
     * reply is kept as a Reply version (‹ n/m ›). A failed turn keeps the reply it had, so the
     * re-read Chat shows it again; the Memory and Snapshots re-read either way.
     */
    const again = (messageId: number) => {
        if (writing || busy || blocked) return;
        stopReading(messageId);
        player.unlock();
        setReplacing(messageId);
        askNovel('newest-reply');
        // Shown again only once the turn has settled, so the old reply never flashes back first.
        void runTurn(async (stream) => {
            try {
                return refreshMemory(noteRollback(await chatApi.regenerate(chat.storyId, chat.id, messageId, stream, nudge)));
            } catch (caught) {
                if (!(caught instanceof ApiUnreachableError)) refreshMemory(chat);
                throw caught;
            }
        }).finally(() => setReplacing(null));
    };

    /** ‹ n/m › or a swipe: shows another Reply version, with the rollback notice like an edit. */
    const chooseVersion = (messageId: number, version: number) => {
        if (writing || busy) return;
        stopReading(messageId);
        askNovel('newest-reply');
        void runWrite(async () => refreshMemory(noteRollback(await chatApi.chooseVersion(chat.storyId, chat.id, messageId, version))));
    };

    /** Opening a Message's edit stops reading it. */
    const startEdit = (messageId: number) => {
        stopReading(messageId);
        setEditing(messageId);
    };

    const saveEdit = (message: Message, text: string) => {
        setEditing(null);
        stopReading(message.id);
        const edited = (next: EditedChat) => refreshMemory(noteRollback(next));
        // An edited User Message gets a fresh reply, so it runs as a turn; an AI Message does not.
        if (message.kind === 'user') {
            player.unlock();
            void runTurn(async (stream) => edited(await chatApi.edit(chat.storyId, chat.id, message.id, text, stream, nudge)));
        } else {
            void runWrite(async () => edited(await chatApi.edit(chat.storyId, chat.id, message.id, text)));
        }
    };

    /**
     * ⑂ Branch (.scratch/branch/spec.md): no confirmation, since it changes nothing here. The
     * actions stay disabled while it runs; on success the new Chat opens, handed the title it
     * came from and any User Message's text. An error shows in the usual line, here.
     */
    const branchFrom = (messageId: number) => {
        if (writing || busy) return;
        setBusy(true);
        setError(null);
        setRollback(null);
        chatApi.branch(chat.storyId, chat.id, messageId).then(
            (made) => {
                handOffBranch(made.id, { from: chat.title, draft: made.draft });
                router.push(`/stories/${chat.storyId}/chats/${made.id}`);
            },
            (caught: unknown) => {
                setBusy(false);
                if (caught instanceof ApiUnreachableError) reportUnreachable();
                else setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
            },
        );
    };

    /** Swaps the worn identity; the drawer re-reads, since it renders {user} as the worn name. */
    const swapIdentity = (personaId: number | null) =>
        void runWrite(async () => {
            const swapped = await chatApi.swapIdentity(chat.storyId, chat.id, personaId);
            setDrawer((current) => ({ ...current, version: current.version + 1 }));
            return swapped;
        });

    // The Backdrop follows the thread: a new Snapshot, or one an edit or Reset took away, changes it.
    const backdrop = looks ? backdropOf(looks, snaps.state.snapshots, chat.messages) : null;

    const failedJobs = snaps.state.jobs.filter((job) => job.status === 'failed');

    /**
     * The background notice's one Retry (.scratch/background-retry/spec.md): the latest reply's
     * failed judge and extraction, and each failed Snapshot, run again together; then the Chat
     * and its Snapshots re-read so the notice clears. A rerun extraction's adds are announced.
     */
    const retryBackground = () =>
        void runWrite(async () => {
            const reply = latestReply(chat);
            if (reply?.memory?.status === 'failed') announcedRef.current = null;
            await Promise.all([
                // One after the other: each holds the Chat's turn lock while it runs.
                (async () => {
                    if (reply?.judge?.status === 'failed') await chatApi.retryJudge(chat.storyId, chat.id, reply.id);
                    if (reply?.memory?.status === 'failed') await chatApi.retryExtraction(chat.storyId, chat.id, reply.id);
                })(),
                ...failedJobs.map((job) => snapshotApi.retry(chat.storyId, chat.id, job.id)),
            ]);
            await snaps.refresh();
            return apiFetch<Chat>(`/stories/${chat.storyId}/chats/${chat.id}`);
        });

    return (
        <main className={`chat ${styles.screen}`}>
            <ChatBackdrop picture={backdrop} />
            <ChatTopBar
                chat={chat}
                cast={cast}
                characters={characters}
                portraits={portraits}
                error={error}
                busy={writing || busy || editing !== null}
                stripHidden={stripHidden}
                onShowStrip={() => setSceneStripHidden(false)}
                onSwapIdentity={swapIdentity}
                onOpenMemory={() => openMemory()}
                onRename={(title) =>
                    void runWrite(() => chatApi.rename(chat.storyId, chat.id, title))
                }
                onSetAuthorsNote={(text) =>
                    void runWrite(() => chatApi.setAuthorsNote(chat.storyId, chat.id, text))
                }
                onSetAutoRead={(autoRead) => void runWrite(() => chatApi.setAutoRead(chat.storyId, chat.id, autoRead))}
                onSetSittingOut={(characterIds) =>
                    void runWrite(() => chatApi.setSittingOut(chat.storyId, chat.id, characterIds))
                }
                onReset={() => {
                    player.stop();
                    askNovel('opening');
                    void runWrite(async () => refreshMemory(await chatApi.reset(chat.storyId, chat.id)));
                }}
                whoRequest={whoRequest}
                novel={novel}
                onToggleNovel={() => (novel ? showThreadAt(novelAtRef.current) : setChatView('novel'))}
            />
            {!stripHidden && (
                <SceneStrip
                    current={chat.currentScene}
                    timeOfDay={chat.timeOfDay}
                    scenes={scenes}
                    onHide={() => setSceneStripHidden(true)}
                />
            )}

            {toasts.length > 0 && (
                <div className="toasts" aria-label="Memory added">
                    {toasts.map((toast) => (
                        <button key={toast.memoryId} type="button" className="toast" role="status" onClick={() => openMemory(toast.memoryId)}>
                            <strong>Memory added</strong>
                            <span>{toast.text}</span>
                        </button>
                    ))}
                </div>
            )}

            {drawer.open && (
                <MemoryDrawer
                    storyId={chat.storyId}
                    chatId={chat.id}
                    focusMemoryId={drawer.focus}
                    version={drawer.version}
                    onClose={() => setDrawer((current) => ({ ...current, open: false, focus: null }))}
                    onJump={jumpTo}
                    portraits={portraits}
                />
            )}

            <ShownTextProvider rules={chat.replaceRules}>
            <ReadAloudProvider player={player}>
            {novel ? (
                <NovelView
                    messages={chat.messages}
                    cast={cast}
                    pending={pending}
                    writing={writing}
                    replySoFar={replySoFar}
                    replacing={replacing}
                    snapshots={snaps.state}
                    busy={busy}
                    canAct={!writing && !busy && editing === null}
                    blocked={blocked}
                    request={novelRequest}
                    onAgain={again}
                    onVersion={chooseVersion}
                    onSnapshot={() => setSnapshotSheet(true)}
                    onEditInThread={(messageId) => {
                        showThreadAt(messageId);
                        startEdit(messageId);
                    }}
                    onOpenSnapshot={setViewing}
                    onPosition={onNovelPosition}
                />
            ) : (
            <ChatThread
                messages={chat.messages}
                cast={cast}
                portraits={portraits}
                pending={pending}
                writing={writing}
                replySoFar={replySoFar}
                editing={editing}
                canEdit={!writing && !busy && editing === null}
                blocked={blocked}
                snapshots={snaps.state}
                replacing={replacing}
                onAgain={again}
                onVersion={chooseVersion}
                onEdit={startEdit}
                onBranch={branchFrom}
                onSave={saveEdit}
                onCancelEdit={() => setEditing(null)}
                onSnapshot={() => setSnapshotSheet(true)}
                onOpenSnapshot={setViewing}
                onDismissSnapshot={(job) => void snaps.dismiss(job)}
                thaiReadings={thaiReadings}
                openAt={threadAt}
            />
            )}
            </ReadAloudProvider>
            </ShownTextProvider>

            <ChatComposer
                chat={chat}
                draft={draft}
                writing={writing}
                busy={busy}
                blocked={blocked}
                error={error}
                rollback={rollback}
                snapshotError={snaps.error}
                failedSnapshots={failedJobs.length}
                onDraft={setDraft}
                onSend={send}
                onContinue={continueStory}
                onStop={stopTurn}
                onRetry={() => {
                    player.unlock();
                    void runTurn((stream) => chatApi.retry(chat.storyId, chat.id, stream, nudge));
                }}
                onRetryBackground={retryBackground}
                characterRow={(writingForMe) => (
                    <CharacterRow
                        characters={characters}
                        cast={cast}
                        portraits={portraits}
                        sittingOut={chat.sittingOut}
                        nudge={nudge}
                        disabled={writing || busy || writingForMe}
                        onNudge={setNudge}
                        onWhosHere={() => setWhoRequest((count) => count + 1)}
                    />
                )}
            />

            {snapshotSheet && (
                <SnapshotSheet
                    imageCreditOut={chat.imageCreditOut}
                    onTake={(hint) => void snaps.take(hint)}
                    onClose={() => setSnapshotSheet(false)}
                />
            )}

            {viewing && (
                <SnapshotViewer
                    snapshots={inThreadOrder(chat.messages, snaps.state.snapshots)}
                    openId={viewing.id}
                    onClose={() => setViewing(null)}
                    onDelete={(snapshot) => {
                        setViewing(null);
                        void snaps.remove(snapshot);
                    }}
                    onRetake={
                        chat.imageCreditOut
                            ? undefined
                            : (snapshot) => {
                                  setViewing(null);
                                  void snaps.take(snapshot.hint, snapshot.messageId ?? undefined);
                              }
                    }
                />
            )}
        </main>
    );
}

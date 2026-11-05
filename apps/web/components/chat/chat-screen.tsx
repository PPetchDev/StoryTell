'use client';

import { useEffect, useRef, useState } from 'react';

import { ChatComposer } from '@/components/chat/chat-composer';
import { ChatThread, PendingLine } from '@/components/chat/chat-thread';
import { ChatTopBar } from '@/components/chat/chat-top-bar';
import { MemoryDrawer } from '@/components/chat/memory-drawer';
import { SnapshotViewer, useChatSnapshots } from '@/components/chat/snapshots';
import { useConnection } from '@/components/connection';
import { ApiError, apiFetch, ApiUnreachableError } from '@/lib/api';
import { Cast } from '@/lib/character-colour';
import { backgroundPending, Chat, chatApi, EditedChat, latestReply, Message, rollbackNotice } from '@/lib/chat';
import { Memory, memoryApi, renderUser } from '@/lib/memory';
import { Snapshot } from '@/lib/snapshot';

import styles from './chat-screen.module.css';

/** A "Memory added" toast (spec: story 83): one per Memory the AI added in the latest turn. */
interface Toast {
    memoryId: number;
    text: string;
}

/** How often the Chat is re-read while the last reply's background calls run. */
const BACKGROUND_POLL_MS = 1_000;

/**
 * The Chat screen (spec: "Chat screen"): a top bar, the thread and the composer. No
 * streaming: a "writing" indicator shows while the turn is written, and a failed turn leaves
 * the User Message with Retry. Any Message can be edited in place, which discards the
 * Messages after it and rolls back their changes, with a short notice of what went; Reset
 * starts the Chat over from the Opening. Bonds and Arcs never show here: the dashboard link
 * leads to them. Memory does: the drawer lists it, and a "Memory added" toast appears for each
 * Memory the AI adds once a turn's extraction is done. The camera takes a Snapshot of the
 * latest AI Message while play goes on; Snapshots show under their Message, and a tap opens
 * one full screen.
 */
interface ChatScreenProps {
    initial: Chat;
    cast: Cast;
}

export function ChatScreen({ initial, cast }: ChatScreenProps) {
    const { reportUnreachable } = useConnection();
    const [chat, setChat] = useState(initial);
    const [draft, setDraft] = useState('');
    /** The line just sent, shown in the thread until the turn settles. */
    const [pending, setPending] = useState<PendingLine | null>(null);
    const [writing, setWriting] = useState(false);
    const [busy, setBusy] = useState(false);
    const [editing, setEditing] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [rollback, setRollback] = useState<string | null>(null);
    const [drawer, setDrawer] = useState<{ open: boolean; focus: number | null; version: number }>({ open: false, focus: null, version: 0 });
    const [toasts, setToasts] = useState<Toast[]>([]);
    const snaps = useChatSnapshots(initial.storyId, initial.id);
    const [viewing, setViewing] = useState<Snapshot | null>(null);
    /** The reply whose finished extraction was already announced, so a re-read never toasts twice. */
    const announcedRef = useRef<number | null>(latestReply(initial)?.id ?? null);

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

    const blocked = !chat.playable || chat.textCreditOut;

    const openMemory = (memoryId: number | null = null) => {
        setDrawer((current) => ({ open: true, focus: memoryId, version: current.version }));
        if (memoryId !== null) setToasts((current) => current.filter((toast) => toast.memoryId !== memoryId));
    };

    /** Scrolls to a Message and outlines it, from a Memory's jump link. */
    const jumpTo = (messageId: number) => {
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
     * Runs a turn with the writing indicator up. A failed turn shows its error and re-reads
     * the Chat, since the User Message may have been stored before the turn failed: it then
     * shows with Retry. `unsent` is called when it wasn't stored, so its text isn't lost.
     */
    const runTurn = async (turn: () => Promise<Chat>, unsent?: () => void) => {
        setWriting(true);
        setError(null);
        setRollback(null);
        try {
            setChat(await turn());
        } catch (caught) {
            if (caught instanceof ApiUnreachableError) {
                unsent?.();
                reportUnreachable();
                return;
            }
            setError(caught instanceof ApiError ? caught.message : 'The turn failed.');
            try {
                const reread = await apiFetch<Chat>(`/stories/${chat.storyId}/chats/${chat.id}`);
                setChat(reread);
                if (!reread.awaitingReply) unsent?.();
            } catch {
                // The error above already tells the user; a reload shows the rest.
                unsent?.();
            }
        } finally {
            setWriting(false);
            setPending(null);
        }
    };

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
     * thread while the reply is written. If the API never stored it, the text goes back in
     * the composer.
     */
    const send = () => {
        if (draft.trim() === '' || writing || blocked) return;
        const text = draft;
        setDraft('');
        setPending({ text, identityName: chat.identityName });
        void runTurn(
            () => chatApi.send(chat.storyId, chat.id, text),
            () => setDraft((current) => (current === '' ? text : current)),
        );
    };

    const saveEdit = (message: Message, text: string) => {
        setEditing(null);
        const edit = async () => refreshMemory(noteRollback(await chatApi.edit(chat.storyId, chat.id, message.id, text)));
        // An edited User Message gets a fresh reply, so it runs as a turn; an AI Message does not.
        if (message.kind === 'user') void runTurn(edit);
        else void runWrite(edit);
    };

    /** Swaps the worn identity; the drawer re-reads, since it renders {user} as the worn name. */
    const swapIdentity = (personaId: number | null) =>
        void runWrite(async () => {
            const swapped = await chatApi.swapIdentity(chat.storyId, chat.id, personaId);
            setDrawer((current) => ({ ...current, version: current.version + 1 }));
            return swapped;
        });

    /** Runs only the failed judge again, then re-reads the Chat so the notice clears. */
    const retryJudge = (messageId: number) =>
        void runWrite(async () => {
            await chatApi.retryJudge(chat.storyId, chat.id, messageId);
            return apiFetch<Chat>(`/stories/${chat.storyId}/chats/${chat.id}`);
        });

    /** The same for a failed Memory extraction; its adds are announced once the Chat reads done. */
    const retryExtraction = (messageId: number) =>
        void runWrite(async () => {
            announcedRef.current = null;
            await chatApi.retryExtraction(chat.storyId, chat.id, messageId);
            return apiFetch<Chat>(`/stories/${chat.storyId}/chats/${chat.id}`);
        });

    return (
        <main className={`chat ${styles.screen}`}>
            <ChatTopBar
                chat={chat}
                busy={writing || busy || editing !== null}
                onSwapIdentity={swapIdentity}
                onOpenMemory={() => openMemory()}
                onReset={() => void runWrite(async () => refreshMemory(await chatApi.reset(chat.storyId, chat.id)))}
            />

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
                />
            )}

            <ChatThread
                messages={chat.messages}
                cast={cast}
                pending={pending}
                writing={writing}
                editing={editing}
                canEdit={!writing && !busy && editing === null}
                blocked={blocked}
                snapshots={snaps.state}
                onEdit={setEditing}
                onSave={saveEdit}
                onCancelEdit={() => setEditing(null)}
                onOpenSnapshot={setViewing}
                onRetrySnapshot={(job) => void snaps.retry(job)}
                onDismissSnapshot={(job) => void snaps.dismiss(job)}
            />

            <ChatComposer
                chat={chat}
                draft={draft}
                writing={writing}
                busy={busy}
                editing={editing !== null}
                blocked={blocked}
                error={error}
                rollback={rollback}
                snapshotError={snaps.error}
                onDraft={setDraft}
                onSend={send}
                onRetry={() => void runTurn(() => chatApi.retry(chat.storyId, chat.id))}
                onRetryJudge={retryJudge}
                onRetryExtraction={retryExtraction}
                onTakeSnapshot={(hint) => void snaps.take(hint)}
            />

            {viewing && (
                <SnapshotViewer
                    // A swipe moves through the Chat's Snapshots in thread order.
                    snapshots={chat.messages.flatMap((message) => snaps.state.snapshots.filter((s) => s.messageId === message.id))}
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

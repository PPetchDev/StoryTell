'use client';

import { useRouter } from 'next/navigation';
import { EMOTION_LABEL, type ExpressionEmotion } from '@/lib/expressions';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ChatBackdrop } from '@/components/chat/backdrop';
import { BookmarksProvider, useChatBookmarks } from '@/components/chat/bookmarks';
import { SecretRevealsProvider } from '@/components/chat/secret-reveals';
import { useOpenProfile, useProfileChat, useProfileGoals, useProfileNow, useProfileOutfits, useProfileSecrets } from '@/components/chat/character-profile';
import { diaryEntrySeen, markDiaryEntrySeen } from '@/lib/diary-seen';
import { CharacterRow } from '@/components/chat/character-row';
import { ChatComposer } from '@/components/chat/chat-composer';
import { ChatThread, OpenAt, PendingLine } from '@/components/chat/chat-thread';
import { ChatTopBar } from '@/components/chat/chat-top-bar';
import { ChatGlance } from '@/components/chat/chat-glance';
import { CueSheet } from '@/components/chat/cue-sheet';
import { FindSheet, FindTab } from '@/components/chat/find-sheet';
import { FactsSheet } from '@/components/chat/facts-sheet';
import { ItemsSheet } from '@/components/chat/items-sheet';
import { MemoryDrawer } from '@/components/chat/memory-drawer';
import { NovelRequest, NovelView } from '@/components/chat/novel-view';
import { PersonaPictures } from '@/components/chat/persona-pictures';
import { SceneStrip } from '@/components/chat/scene-strip';
import { ChaptersSheet } from '@/components/chat/chapters-sheet';
import { LoreSuggestionsSheet } from '@/components/chat/lore-suggestions-sheet';
import { RecapCard } from '@/components/chat/recap-card';
import { RollOfferBand } from '@/components/chat/roll-offer-band';
import { SuddenEventBanner, suddenEventAnnouncement } from '@/components/chat/sudden-event-banner';
import { EventProposalCard, eventProposalAnnouncement } from '@/components/chat/event-proposal-card';
import { EndingBanner, endingAnnouncement, epilogueWritten } from '@/components/chat/ending-banner';
import { SnapshotSheet } from '@/components/chat/snapshot-sheet';
import { SnapshotViewer, useChatSnapshots } from '@/components/chat/snapshots';
import { useThaiReadings } from '@/components/chat/thai-reading';
import { useConnection } from '@/components/connection';
import { LowCreditLine } from '@/components/low-credit-banner';
import { ApiError, apiFetch, ApiUnreachableError, StreamBrokenError, StreamStoppedError, TurnLostError } from '@/lib/api';
import { backdropOf } from '@/lib/backdrop';
import { handOffBranch, takeBranchHandoff } from '@/lib/branch';
import { Cast, Portraits } from '@/lib/character-colour';
import { setChatView, useChatView } from '@/lib/chat-view';
import { backgroundPending, Chat, chatApi, EditedChat, isOpening, latestReply, Message, MessagePart, rollbackNotice, RollStat, signedStat, TurnStream } from '@/lib/chat';
import { Memory, memoryApi, renderUser } from '@/lib/memory';
import { setSceneStripHidden, useSceneStripHidden } from '@/lib/scene-strip';
import { inThreadOrder, Snapshot, snapshotApi } from '@/lib/snapshot';
import { useReplyCosts } from '@/lib/reply-cost';
import { RoleStat, Scene, Story } from '@/lib/story';

import { announce } from '@/components/announcer';
import { COLUMN } from '@/components/chat/chat-classes';
import { applyReplaceRules, onMineRules } from '@/lib/replace-rules';
import { ReadAloudProvider, useReadAloudPlayer } from './read-aloud';
import { ShownTextProvider } from './shown-text';
import { useWatch, WatchBand, WatchSheet } from './watch';

/**
 * A "Memory added" toast (spec: story 83), one per Memory the AI added in the latest turn; or a
 * "Diary: <name>" toast, one per entry a Character wrote by themselves (.scratch/diary/spec.md).
 */
type Toast = { kind: 'memory'; memoryId: number; text: string } | { kind: 'diary'; entryId: number; characterId: number; name: string };

/**
 * How long the "Memory added" toasts stay before they go on their own; a tap before then opens the
 * Memory. Five seconds, and never while the pointer or focus is on them (audit M13).
 */
const TOAST_MS = 5_000;

/** A toast over the thread: a real button, which opens what it tells of. */
const TOAST =
    'bare-button grid w-full cursor-pointer gap-0.5 rounded-md border border-toast-line bg-toast-surface px-3.5 py-2.5 text-left text-text shadow-lg shadow-shadow-soft press focus-ring motion-safe:animate-fade-in';

/**
 * What a screen reader hears when a reply lands (audit H7): that it came, and who speaks in it.
 * Not its words: they are the newest Message, one arrow key away, and a second copy of them in
 * the live region would be read twice and found twice by anything searching the page's text.
 */
function replyAnnouncement(message: Message | undefined): string | null {
    if (message?.kind !== 'ai') return null;
    const speakers = [...new Set(message.parts.flatMap((part) => (part.kind === 'speech' ? [part.speakerName] : [])))];
    if (speakers.length === 0) return 'New reply.';
    return `Reply from ${speakers.slice(0, -1).join(', ')}${speakers.length > 1 ? ' and ' : ''}${speakers.at(-1)}.`;
}

/**
 * The Chat fills the screen below whatever the app shell shows above it, so the thread scrolls on
 * its own between the top bar and the composer. The page around it is styled from here: each
 * variant below that starts `.page:has(>&)` matches the layout's `.page` holding this screen (and
 * its other children: the banners), so nothing outside the Chat screen changes for it. Those other
 * children keep their size through `.page > *` in globals.css: a `:has()` rule reaching them
 * restyled the whole thread on every change (audit M32).
 */
const SCREEN = [
    'flex min-h-0 flex-1 flex-col',
    // Pinned to the window's four edges, not `h-dvh` (2026-11-18, on the user's Android phone): after the
    // keyboard closed, the page kept its keyboard-time height and stayed scrolled, so the top bar was
    // gone and half the screen lay empty under the composer. A fixed page can't be scrolled, and its
    // height is always the window's, which still shrinks above the keyboard (interactive-widget).
    '[.page:has(>&)]:fixed [.page:has(>&)]:inset-0 [.page:has(>&)]:flex [.page:has(>&)]:flex-col',
    // The thin top bar sits at the very top, below only the phone's status bar.
    '[.page:has(>&)]:pt-[env(safe-area-inset-top)] [.page:has(>&)]:pb-0',
    // Desktop (spec: "Desktop layout"): the thread scrolls anywhere across the page beside the rail.
    'lg:[.page:has(>&)]:px-0',
].join(' ');

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
 * opens a sheet that writes the Snapshot prompt of the latest AI Message to read before drawing it; Snapshots
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
    /** The Role's Stats (.scratch/judge-rolls/spec.md), for the Scene strip; empty without, or if the Story can't be read. */
    stats?: readonly RoleStat[];
}

export function ChatScreen({ initial, cast, characters, portraits, scenes, looks, stats = [] }: ChatScreenProps) {
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
    // What each reply cost, while "Show cost per reply" is on (.scratch/cost-view/spec.md).
    const replyCosts = useReplyCosts(chat);
    const [draft, setDraft] = useState('');
    /** The line just sent, shown in the thread until the turn settles. */
    const [pending, setPending] = useState<PendingLine | null>(null);
    const [writing, setWriting] = useState(false);
    /** The reply so far while a turn streams; null before its first words and once it settles. */
    const [replySoFar, setReplySoFar] = useState<MessagePart[] | null>(null);
    /** Stops the turn being written. */
    const stopRef = useRef<AbortController | null>(null);
    const [busy, setBusy] = useState(false);
    /** Watch (.scratch/watch-mode/spec.md): the story playing on by itself, run by the API; each reply it adds re-reads the Chat. */
    const watch = useWatch(initial.storyId, initial.id, setChat, (next) => readNewReply(next));
    const watching = watch.running;
    const [watchSheet, setWatchSheet] = useState(false);
    /**
     * The Character nudged for the next turn (.scratch/speaker-controls/spec.md, "Nudge"): sent with
     * the next send, Continue, Retry, Again or User Message edit, never stored, gone on leaving.
     */
    const [nudge, setNudge] = useState<number | null>(null);
    /**
     * The Cue for the next turn (CONTEXT.md, "Cue"): a few words to the Narrator for one reply. Like
     * the nudge it rides on the next send, Continue, Retry, Again or User Message edit, is never
     * stored, and is gone on leaving.
     */
    const [cue, setCue] = useState<string | null>(null);
    const [cueSheet, setCueSheet] = useState(false);
    // The Facts panel (.scratch/facts-panel/spec.md), opened from the Scene strip.
    const [factsSheet, setFactsSheet] = useState(false);
    // The Items sheet (.scratch/story-items/spec.md), opened from the Scene strip too.
    const [itemsSheet, setItemsSheet] = useState(false);
    /** The Chapters sheet, with Move on (.scratch/scene-chapters/spec.md). */
    const [chaptersOpen, setChaptersOpen] = useState(false);
    /** Lore from this Chat (.scratch/lore-from-chat/spec.md): its sheet asks as it opens. */
    const [loreSuggestionsOpen, setLoreSuggestionsOpen] = useState(false);
    /** Counts the asks for "Previously on…" from the Chat menu (.scratch/previously-on/spec.md). */
    const [recapRequest, setRecapRequest] = useState(0);
    /**
     * The Roll armed for the next Message (CONTEXT.md, "Roll"): sent with the next send only, where
     * the app throws the dice. Gone on leaving, like the nudge and the Cue.
     */
    const [roll, setRoll] = useState(false);
    /** The face picked for the next Message (.scratch/your-faces/spec.md); it goes with one send, like the Roll. */
    const [face, setFace] = useState<ExpressionEmotion | null>(null);
    /** The Stat of the Roll offer taken (.scratch/judge-rolls/spec.md), sent with the armed Roll; null when it was armed by hand. */
    const [rollStat, setRollStat] = useState<RollStat | null>(null);
    /** Each tap on the Character row's "Who's here" opens the sheet in the top bar. */
    const [whoRequest, setWhoRequest] = useState(0);
    const [editing, setEditing] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [rollback, setRollback] = useState<string | null>(null);
    const [drawer, setDrawer] = useState<{ open: boolean; focus: number | null; version: number }>({ open: false, focus: null, version: 0 });
    /** "Find in this Chat" (.scratch/chat-search/spec.md): open or not, and its tab and query, kept for the next opening. */
    const [find, setFind] = useState<{ open: boolean; tab: FindTab; query: string }>({ open: false, tab: 'search', query: '' });
    const bookmarks = useChatBookmarks(initial.storyId, initial.id);
    const [toasts, setToasts] = useState<Toast[]>([]);
    const snaps = useChatSnapshots(initial.storyId, initial.id);
    const [viewing, setViewing] = useState<Snapshot | null>(null);
    /** The open Snapshot sheet: from 📷 (no Message: the latest AI Message), or a retake's hint and Message. */
    const [snapshotSheet, setSnapshotSheet] = useState<{ hint: string; messageId?: number } | null>(null);
    /** The reply ↺ Again is replacing, hidden from the thread while the new one is written. */
    const [replacing, setReplacing] = useState<number | null>(null);
    /** The reply whose finished extraction was already announced, so a re-read never toasts twice. */
    const announcedRef = useRef<number | null>(latestReply(initial)?.id ?? null);
    /** Read aloud's one player: the screen owns it, so it outlives whatever shows the Messages. Leaving stops it. */
    const player = useReadAloudPlayer(initial.storyId, initial.id);
    /** Stops the reading when it is this Message's: ↺ Again, an edit or another version changes its words. */
    /** The Visual novel view (.scratch/chat-looks/spec.md): this device's choice, the moves the screen asks of it, and where it is. */
    const novel = useChatView() === 'novel';
    /** In the novel view the composer is put away for reading until ✎ brings it out (.scratch/novel-reading/spec.md). */
    const [writeOpen, setWriteOpen] = useState(false);
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
        // So does a dressed stage still drawing (.scratch/dressed-stage/spec.md).
        if (!backgroundPending(chat) && !((chat.stage?.drawing ?? 0) > 0)) return;
        const timer = setTimeout(() => {
            apiFetch<Chat>(`/stories/${chat.storyId}/chats/${chat.id}`).then(setChat, (caught: unknown) => {
                if (caught instanceof ApiUnreachableError) reportUnreachable();
            });
        }, BACKGROUND_POLL_MS);
        return () => clearTimeout(timer);
    }, [chat, reportUnreachable]);

    // A Character's profile shows what they are wearing now in this Chat (.scratch/info-box/spec.md).
    useProfileOutfits(chat.outfits);
    // And what they are after now (.scratch/character-minds/spec.md).
    useProfileGoals(chat.goals);
    // The Secrets the Chat has revealed, which the profiles show (.scratch/secret-reveals/spec.md).
    useProfileSecrets(chat.secretReveals);
    // And what has lastingly changed about them, which the user can edit there (.scratch/growing-cards/spec.md).
    useProfileNow(chat.nowNotes, chat.identityName, async (characterId, text) => {
        try {
            setChat(await chatApi.setNowNote(chat.storyId, chat.id, characterId, text));
            return null;
        } catch (caught) {
            if (caught instanceof ApiUnreachableError) reportUnreachable();
            return caught instanceof ApiError ? caught.message : 'Something went wrong.';
        }
    });
    // And their Diary, which is written at the Chat's newest AI Message (.scratch/diary/spec.md).
    useProfileChat(chat.storyId, chat.id, chat.messages.findLast((message) => message.kind === 'ai')?.id ?? null);

    // A Sudden event that began, moved or ended is said once, when the re-read Chat shows it (the banner shows the same).
    const eventRef = useRef(initial.suddenEvent);
    useEffect(() => {
        const said = suddenEventAnnouncement(eventRef.current, chat.suddenEvent);
        eventRef.current = chat.suddenEvent;
        if (said) announce(said);
    }, [chat.suddenEvent]);

    // A Sudden event the story proposes is said once as well (.scratch/ai-events/spec.md); the card shows it.
    const proposalRef = useRef(initial.eventProposal ?? null);
    useEffect(() => {
        const said = eventProposalAnnouncement(proposalRef.current, chat.eventProposal ?? null);
        proposalRef.current = chat.eventProposal ?? null;
        if (said) announce(said);
    }, [chat.eventProposal]);

    // An Ending reached is said once too (.scratch/endings/spec.md); the banner shows it.
    const endingRef = useRef(initial.ending);
    // The Ending the Chat already had when it was opened: its banner is one row. One reached while playing opens to say why.
    const [endingAtOpen] = useState(initial.ending);
    useEffect(() => {
        const said = endingAnnouncement(endingRef.current, chat.ending);
        endingRef.current = chat.ending;
        if (said) announce(said);
    }, [chat.ending]);

    // Once a reply's extraction is done, announce what the AI added and let the drawer re-read.
    useEffect(() => {
        const reply = latestReply(chat);
        if (!reply || reply.memory?.status !== 'done' || announcedRef.current === reply.id) return;
        announcedRef.current = reply.id;
        setDrawer((current) => ({ ...current, version: current.version + 1 }));
        memoryApi.list(chat.storyId, chat.id).then(
            (list) => {
                const added = list.memories.filter((memory: Memory) => memory.messageId === reply.id && memory.writtenBy === 'ai');
                setToasts((current) => [
                    ...current.filter((toast) => toast.kind === 'diary'),
                    ...added.map((memory) => ({ kind: 'memory' as const, memoryId: memory.id, text: renderUser(memory.text, list.identityName) })),
                ]);
            },
            () => {
                // The drawer shows the Memory either way; a missed toast is no loss.
            },
        );
    }, [chat]);

    // An entry a Character wrote by themselves shows as a toast that opens their profile. Those there when the Chat
    // opened, and those the user asked for, are seen already.
    useEffect(() => {
        for (const entry of initial.diaryLatest ?? []) markDiaryEntrySeen(entry.entryId);
    }, [initial.diaryLatest]);
    const openProfile = useOpenProfile();
    useEffect(() => {
        const fresh = (chat.diaryLatest ?? []).filter((entry) => !diaryEntrySeen(entry.entryId));
        if (fresh.length === 0) return;
        for (const entry of fresh) markDiaryEntrySeen(entry.entryId);
        const named = fresh.flatMap((entry) => {
            const name = characters.find((character) => character.id === entry.characterId)?.name;
            return name ? [{ kind: 'diary' as const, entryId: entry.entryId, characterId: entry.characterId, name }] : [];
        });
        if (named.length > 0) setToasts((current) => [...current, ...named]);
    }, [chat.diaryLatest, characters]);

    // The toasts announce, they don't wait to be dismissed: they go after TOAST_MS, and the drawer keeps the Memories.
    // They stay while the pointer or focus is on them, and go a moment after it leaves (audit M13).
    const toastsRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (toasts.length === 0) return;
        let timer = 0;
        const expire = () => {
            const region = toastsRef.current;
            const held = region !== null && (region.contains(document.activeElement) || region.matches(':hover'));
            if (held) timer = window.setTimeout(expire, 1_000);
            else setToasts([]);
        };
        timer = window.setTimeout(expire, TOAST_MS);
        return () => clearTimeout(timer);
    }, [toasts]);

    /** Hands focus back to `target` once what held it has gone, unless the user is already elsewhere (audit L15). */
    const refocus = (target: () => HTMLElement | null) =>
        requestAnimationFrame(() => {
            const active = document.activeElement;
            if (!active || active === document.body) target()?.focus({ preventScroll: true });
        });
    const menuButtonRef = useRef<HTMLButtonElement>(null);
    const novelToggleRef = useRef<HTMLButtonElement>(null);

    const blocked = !chat.playable || chat.textCreditOut;
    /** The reply ↺ Again would write again now: the newest Message, when a model wrote it. The Cue sheet offers it. */
    const newestMessage = chat.messages.at(-1);
    const againTarget =
        newestMessage && newestMessage.kind === 'ai' && !isOpening(newestMessage) && !blocked && !writing && !busy && !watching ? newestMessage.id : null;
    // A Character set sitting out can't stay nudged (.scratch/speaker-controls/spec.md).
    useEffect(() => {
        if (nudge !== null && chat.sittingOut.includes(nudge)) setNudge(null);
    }, [nudge, chat.sittingOut]);

    const stripHidden = useSceneStripHidden();

    const openMemory = (memoryId: number | null = null) => {
        setDrawer((current) => ({ open: true, focus: memoryId, version: current.version }));
        if (memoryId !== null) setToasts((current) => current.filter((toast) => toast.kind !== 'memory' || toast.memoryId !== memoryId));
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
     * A Search result's or a Bookmark's Message: the sheet closes, the thread goes there and
     * outlines it, and focus lands on it once the sheet has handed focus back, without scrolling again.
     */
    const jumpFromFind = (messageId: number) => {
        setFind((current) => ({ ...current, open: false }));
        jumpTo(messageId);
        requestAnimationFrame(() =>
            requestAnimationFrame(() => document.getElementById(`message-${messageId}`)?.focus({ preventScroll: true })),
        );
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
        // The reply so far is drawn at most once a frame, however fast its pieces come (audit M32).
        let frame = 0;
        const onParts = (parts: MessagePart[]) => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => setReplySoFar(parts));
        };
        try {
            const next = await turn({ signal: stop.signal, onParts });
            cancelAnimationFrame(frame);
            setChat(next);
            // The nudge and the Cue rode on this turn, which answered with its reply; a failed or stopped one keeps them for Retry.
            setNudge(null);
            setCue(null);
            // Once, when the turn is over: never each streamed piece (audit H7).
            const said = replyAnnouncement(next.messages.at(-1));
            if (said) announce(said);
            readNewReply(next);
        } catch (caught) {
            cancelAnimationFrame(frame);
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
            // A turn the API no longer knows (.scratch/resume-reply/spec.md) may or may not have been.
            const stored = caught instanceof StreamBrokenError && !(caught instanceof TurnLostError);
            try {
                const reread = await apiFetch<Chat>(`/stories/${chat.storyId}/chats/${chat.id}`);
                setChat(reread);
                // A broken or lost turn the API wrote to the end after all left its reply: nothing failed, and nothing is unsent.
                const answered = !reread.awaitingReply && reread.messages.length > chat.messages.length;
                if (answered && caught instanceof StreamBrokenError) setError(null);
                if (!reread.awaitingReply && !answered) unsent?.();
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

    /** ■ Stop: ends the reply being written, with its own request to the API, which keeps nothing of it. */
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
        // A write in flight (Reset, a swap, an edit) holds the send too (audit M28).
        if (draft.trim() === '' || writing || busy || blocked) return;
        const typed = draft;
        const text = applyReplaceRules(typed, onMineRules(chat.replaceRules));
        if (text.trim() === '') {
            setError('Your Replace rules left nothing to send.');
            return;
        }
        setDraft('');
        // A send stops Watch: the API stops it before the send runs (.scratch/watch-mode/spec.md), so here it is only let go.
        if (watching) watch.detach();
        // Inside the tap, so iOS lets the reply play by itself later.
        player.unlock();
        // The Roll rides on this send and no other; a send the API never stored arms it again with the draft.
        const rolled = roll;
        const rolledStat = rolled ? rollStat : null;
        setRoll(false);
        setRollStat(null);
        const faced = face;
        setFace(null);
        setPending({ text, identityName: chat.identityName, personaId: chat.personaId, roll: rolled, face: faced });
        void runTurn(
            (stream) => chatApi.send(chat.storyId, chat.id, text, stream, { nudge, cue, roll: rolled, rollStat: rolledStat?.name ?? null, face: faced }),
            () => {
                setDraft((current) => (current === '' ? typed : current));
                if (rolled) setRoll(true);
                if (rolled) setRollStat(rolledStat);
                if (faced) setFace(faced);
            },
        );
    };

    // An Epilogue can be asked for like a Continue, but not right after one: Again writes that one anew.
    const newestIsEpilogue = newestMessage?.kind === 'ai' && newestMessage.epilogue;
    const canEndStory = !writing && !busy && !watching && !blocked && !chat.awaitingReply && !newestIsEpilogue;
    // Watch starts as a Continue would, and not while a Sudden event is under way: the user must play it.
    const canWatch = !writing && !busy && !watching && !blocked && !chat.awaitingReply && editing === null && chat.suddenEvent?.status !== 'active';
    // Why it can't be, when the reason lasts (audit L8); a turn in flight only makes it wait.
    const epilogueWhyNot = !chat.playable
        ? 'The epilogue waits: the Story has empty fields.'
        : chat.textCreditOut
          ? 'The epilogue waits: text credit is used up.'
          : chat.awaitingReply
            ? 'The epilogue waits: your last message has no reply yet.'
            : null;
    /** The story's Epilogue (.scratch/endings/spec.md): a turn with no User Message, streamed like any reply. */
    const writeEpilogue = () => {
        if (!canEndStory) return;
        player.unlock();
        void runTurn((stream) => chatApi.epilogue(chat.storyId, chat.id, stream));
    };

    /** ▶ (spec: "Continue"): a turn with no User Message. A failed one stores nothing, so ▶ again is the way on. */
    const continueStory = () => {
        if (writing || busy || watching || blocked || chat.awaitingReply) return;
        player.unlock();
        void runTurn((stream) => chatApi.continue(chat.storyId, chat.id, stream, { nudge, cue }));
    };

    /**
     * ↺ Again (spec: "Regenerate"): the newest reply is written again in place, with the writing
     * indicator where it was, and the rollback notice notes what it had changed. The replaced
     * reply is kept as a Reply version (‹ n/m ›). A failed turn keeps the reply it had, so the
     * re-read Chat shows it again; the Memory and Snapshots re-read either way.
     */
    const again = (messageId: number, withCue: string | null = cue) => {
        if (writing || busy || watching || blocked) return;
        stopReading(messageId);
        player.unlock();
        setReplacing(messageId);
        askNovel('newest-reply');
        // Shown again only once the turn has settled, so the old reply never flashes back first.
        void runTurn(async (stream) => {
            try {
                return refreshMemory(noteRollback(await chatApi.regenerate(chat.storyId, chat.id, messageId, stream, { nudge, cue: withCue })));
            } catch (caught) {
                if (!(caught instanceof ApiUnreachableError)) refreshMemory(chat);
                throw caught;
            }
        }).finally(() => setReplacing(null));
    };

    /** ‹ n/m › or a swipe: shows another Reply version, with the rollback notice like an edit. */
    const chooseVersion = (messageId: number, version: number) => {
        if (writing || busy || watching) return;
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
            void runTurn(async (stream) => edited(await chatApi.edit(chat.storyId, chat.id, message.id, text, stream, { nudge, cue })));
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
    const backdrop = looks ? backdropOf(looks, snaps.state.snapshots, chat.messages, chat.stage?.placePicturePath ?? null) : null;

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
        // The user's lines look their Persona's picture up here (.scratch/persona-image/spec.md).
        <PersonaPictures images={chat.personaImages ?? []} roleImage={chat.roleImagePath ?? null} faces={chat.personaExpressions ?? []} roleFaces={chat.roleExpressions ?? []}>
        <main className={SCREEN}>
            <ChatBackdrop picture={backdrop} />
            <ChatTopBar
                chat={chat}
                cast={cast}
                characters={characters}
                portraits={portraits}
                error={error}
                busy={writing || busy || watching || editing !== null}
                stripHidden={stripHidden}
                onShowStrip={() => setSceneStripHidden(false)}
                onOpenChapters={scenes.length > 0 ? () => setChaptersOpen(true) : undefined}
                onOpenRecap={() => setRecapRequest((count) => count + 1)}
                onOpenLoreSuggestions={chat.messages.length > 1 ? () => setLoreSuggestionsOpen(true) : undefined}
                onSwapIdentity={swapIdentity}
                onOpenMemory={() => openMemory()}
                onRename={(title) =>
                    void runWrite(() => chatApi.rename(chat.storyId, chat.id, title))
                }
                onSetAuthorsNote={(text) =>
                    void runWrite(() => chatApi.setAuthorsNote(chat.storyId, chat.id, text))
                }
                onSetAutoRead={(autoRead) => void runWrite(() => chatApi.setAutoRead(chat.storyId, chat.id, autoRead))}
                onSetEndingSuggestions={(on) => void runWrite(() => chatApi.setEndingSuggestions(chat.storyId, chat.id, on))}
                onSetAutoDiary={(on) => void runWrite(() => chatApi.setAutoDiary(chat.storyId, chat.id, on))}
                onSetDressStage={(on) => void runWrite(() => chatApi.setDressStage(chat.storyId, chat.id, on))}
                onSetCharacterThoughts={(on) => void runWrite(() => chatApi.setCharacterThoughts(chat.storyId, chat.id, on))}
                onSetSittingOut={(characterIds) =>
                    void runWrite(() => chatApi.setSittingOut(chat.storyId, chat.id, characterIds))
                }
                onEndStory={writeEpilogue}
                canEndStory={canEndStory}
                onWatch={() => setWatchSheet(true)}
                canWatch={canWatch}
                onReset={() => {
                    player.stop();
                    askNovel('opening');
                    void runWrite(async () => refreshMemory(await chatApi.reset(chat.storyId, chat.id)));
                }}
                whoRequest={whoRequest}
                novel={novel}
                onToggleNovel={() => {
                    if (!novel) return setChatView('novel');
                    showThreadAt(novelAtRef.current);
                    refocus(() => novelToggleRef.current);
                }}
                menuButtonRef={menuButtonRef}
                novelToggleRef={novelToggleRef}
                onOpenFind={() => setFind((current) => ({ ...current, open: true }))}
            />
            {/* The novel view keeps the screen for the story; the Chat menu still opens the Chapters. */}
            {!stripHidden && !novel && (
                <SceneStrip
                    current={chat.currentScene}
                    timeOfDay={chat.timeOfDay}
                    place={chat.place}
                    weather={chat.weather}
                    outfits={chat.outfits}
                    stats={stats}
                    scenes={scenes}
                    characters={characters}
                    factCount={chat.facts?.length ?? 0}
                    onOpenFacts={() => setFactsSheet(true)}
                    itemCount={(chat.items ?? []).filter((item) => item.end === null).length}
                    onOpenItems={() => setItemsSheet(true)}
                    onOpenChapters={scenes.length > 0 ? () => setChaptersOpen(true) : undefined}
                    onHide={() => {
                        setSceneStripHidden(true);
                        // The ⋯ menu is where it comes back from.
                        refocus(() => menuButtonRef.current);
                    }}
                />
            )}
            {/* An Epilogue stands outside a Sudden event (docs/ui-audit-2026-11-16.md M6): right after one, only the Ending shows. */}
            {chat.suddenEvent && !newestIsEpilogue && <SuddenEventBanner event={chat.suddenEvent} />}
            {/* .scratch/ai-events/spec.md: an event the story made up waits for the user's answer where the banner goes. */}
            {chat.eventProposal && !chat.suddenEvent && !newestIsEpilogue && (
                <EventProposalCard
                    key={chat.eventProposal.id}
                    proposal={chat.eventProposal}
                    busy={writing || busy}
                    onStart={() => void runWrite(() => chatApi.acceptEventProposal(chat.storyId, chat.id, chat.eventProposal!.id))}
                    onDecline={() => void runWrite(() => chatApi.declineEventProposal(chat.storyId, chat.id, chat.eventProposal!.id))}
                />
            )}
            {chat.ending && (
                <EndingBanner
                    key={`${chat.ending.messageId}:${chat.ending.name}`}
                    ending={chat.ending}
                    written={epilogueWritten(chat)}
                    canWrite={canEndStory}
                    whyNot={epilogueWhyNot}
                    fresh={!(endingAtOpen && endingAtOpen.messageId === chat.ending.messageId && endingAtOpen.name === chat.ending.name)}
                    busy={writing || busy}
                    onWrite={writeEpilogue}
                    onDismiss={() => void runWrite(() => chatApi.dismissEnding(chat.storyId, chat.id))}
                />
            )}
            {/* .scratch/previously-on/spec.md: where the story stands, on coming back after a while away. */}
            <RecapCard
                // Its own key space: a bare Chat id could equal a sibling's (the proposal card is keyed by its id).
                key={`recap-${chat.id}`}
                storyId={chat.storyId}
                chatId={chat.id}
                newestMessageId={chat.messages.at(-1)?.id ?? null}
                openRequest={recapRequest}
            />

            {/*
             * The low-credit line (audit M3) and the "Memory added" toasts lie over the top of the
             * thread rather than pushing it down (M14). Their status region is there throughout, so
             * what comes into it is read (M13); each toast inside is a real button, which opens the Memory.
             */}
            <div className={`relative z-sticky h-0 ${COLUMN}`}>
                <div ref={toastsRef} role="status" className="absolute inset-x-0 top-2 grid gap-2">
                    <LowCreditLine />
                    {toasts.map((toast) =>
                        toast.kind === 'memory' ? (
                            <button key={`memory-${toast.memoryId}`} type="button" className={TOAST} onClick={() => openMemory(toast.memoryId)}>
                                <strong>Memory added</strong>
                                <span className="text-note text-muted">{toast.text}</span>
                            </button>
                        ) : (
                            <button
                                key={`diary-${toast.entryId}`}
                                type="button"
                                className={TOAST}
                                data-diary-toast
                                onClick={() => {
                                    setToasts((current) => current.filter((other) => other !== toast));
                                    openProfile?.(toast.characterId);
                                }}
                            >
                                <strong>Diary: {toast.name}</strong>
                                <span className="text-note text-muted">A new entry. Tap to read it.</span>
                            </button>
                        ),
                    )}
                </div>
            </div>

            {drawer.open && (
                <MemoryDrawer
                    storyId={chat.storyId}
                    chatId={chat.id}
                    focusMemoryId={drawer.focus}
                    version={drawer.version}
                    onClose={() => setDrawer((current) => ({ ...current, open: false, focus: null }))}
                    onJump={jumpTo}
                    portraits={portraits}
                    bonds={chat.bonds}
                    sittingOut={chat.sittingOut}
                />
            )}

            <BookmarksProvider value={bookmarks}>
            <SecretRevealsProvider reveals={chat.secretReveals} cast={cast}>
            <ShownTextProvider rules={chat.replaceRules}>
            <ReadAloudProvider player={player}>
            {novel ? (
                <NovelView
                    messages={chat.messages}
                    cast={cast}
                    pending={pending}
                    writing={writing || watching}
                    replySoFar={writing ? replySoFar : watch.replySoFar}
                    replacing={replacing}
                    snapshots={snaps.state}
                    busy={busy}
                    canAct={!writing && !busy && !watching && editing === null}
                    blocked={blocked}
                    request={novelRequest}
                    onAgain={again}
                    onVersion={chooseVersion}
                    onSnapshot={() => setSnapshotSheet({ hint: '' })}
                    onEditInThread={(messageId) => {
                        showThreadAt(messageId);
                        startEdit(messageId);
                    }}
                    onOpenSnapshot={setViewing}
                    onPosition={onNovelPosition}
                    stage={chat.stage ?? null}
                    onWrite={writeOpen ? undefined : () => setWriteOpen(true)}
                />
            ) : (
            <ChatThread
                messages={chat.messages}
                cast={cast}
                portraits={portraits}
                pending={pending}
                writing={writing || watching}
                replySoFar={writing ? replySoFar : watch.replySoFar}
                editing={editing}
                canEdit={!writing && !busy && !watching && editing === null}
                blocked={blocked}
                snapshots={snaps.state}
                replacing={replacing}
                onAgain={again}
                onVersion={chooseVersion}
                onEdit={startEdit}
                onBranch={branchFrom}
                onSave={saveEdit}
                onCancelEdit={() => setEditing(null)}
                onSnapshot={() => setSnapshotSheet({ hint: '' })}
                onOpenSnapshot={setViewing}
                onDismissSnapshot={(job) => void snaps.dismiss(job)}
                thaiReadings={thaiReadings}
                openAt={threadAt}
                costs={replyCosts}
            />
            )}
            </ReadAloudProvider>
            </ShownTextProvider>
            </SecretRevealsProvider>
            </BookmarksProvider>

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
                onSend={(...args: Parameters<typeof send>) => {
                    // Sent: back to reading the reply.
                    if (novel) setWriteOpen(false);
                    return send(...args);
                }}
                onContinue={continueStory}
                onStop={stopTurn}
                onRetry={() => {
                    player.unlock();
                    void runTurn((stream) => chatApi.retry(chat.storyId, chat.id, stream, { nudge, cue }));
                }}
                onRetryBackground={retryBackground}
                cue={cue}
                onCue={() => setCueSheet(true)}
                onClearCue={() => setCue(null)}
                face={face}
                onFace={(next) => {
                    setFace(next);
                    announce(next ? `Your face for this message: ${EMOTION_LABEL[next]}.` : 'No face for this message.');
                }}
                faces={chat.personaId === null ? (chat.roleExpressions ?? []) : ((chat.personaExpressions ?? []).find((entry) => entry.personaId === chat.personaId)?.expressions ?? [])}
                roll={roll}
                onRoll={(next) => {
                    setRoll(next);
                    // Armed by hand, the Roll adds no Stat; turned off, a pending offer shows again.
                    setRollStat(null);
                    announce(next ? `The dice will decide your next message: ${chat.rollTarget} or more succeeds.` : 'Roll off.');
                }}
                rollStat={roll ? rollStat : null}
                rollOfferBand={
                    // The Judge's Roll offer (.scratch/judge-rolls/spec.md): gone once taken, while a reply is written, or with a failed turn.
                    chat.rollOffer && !roll && !writing && !watching && !chat.awaitingReply ? (
                        <RollOfferBand
                            offer={chat.rollOffer}
                            target={chat.rollTarget}
                            busy={busy}
                            onTake={() => {
                                const offered = chat.rollOffer;
                                if (!offered) return;
                                setRoll(true);
                                setRollStat(offered.stat);
                                announce(
                                    `The dice will decide your next message: ${chat.rollTarget} or more succeeds${offered.stat ? `, ${signedStat(offered.stat.bonus)} ${offered.stat.name}` : ''}.`,
                                );
                            }}
                            onDismiss={() => void runWrite(() => chatApi.dismissRollOffer(chat.storyId, chat.id))}
                        />
                    ) : null
                }
                watching={watching}
                watchBand={<WatchBand control={watch} />}
                compact={novel}
                tucked={novel && !writeOpen}
                onTuck={() => setWriteOpen(false)}
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

            {loreSuggestionsOpen && <LoreSuggestionsSheet storyId={chat.storyId} chatId={chat.id} onClose={() => setLoreSuggestionsOpen(false)} />}
            {chaptersOpen && (
                <ChaptersSheet
                    chat={chat}
                    scenes={scenes}
                    busy={writing || busy || editing !== null}
                    onMoved={(moved) => {
                        setChat(moved);
                        announce(moved.currentScene ? `Moved on to ${moved.currentScene.name}.` : 'Moved on into free play.');
                    }}
                    onClose={() => setChaptersOpen(false)}
                />
            )}
            {watchSheet && (
                <WatchSheet
                    storyId={chat.storyId}
                    chatId={chat.id}
                    identityName={chat.identityName}
                    onStart={(replies) => {
                        player.unlock();
                        return watch.start(replies);
                    }}
                    onClose={() => setWatchSheet(false)}
                />
            )}
            {cueSheet && (
                <CueSheet
                    cue={cue ?? ''}
                    canAgain={againTarget !== null}
                    onSet={(text) => {
                        setCue(text === '' ? null : text);
                        setCueSheet(false);
                        announce(text === '' ? 'Cue cleared.' : 'Cue set for the next reply.');
                    }}
                    onAgain={(text) => {
                        setCue(text);
                        setCueSheet(false);
                        if (againTarget !== null) again(againTarget, text);
                    }}
                    onClose={() => setCueSheet(false)}
                />
            )}

            {find.open && (
                <FindSheet
                    storyId={chat.storyId}
                    chatId={chat.id}
                    messages={chat.messages}
                    bookmarks={bookmarks}
                    tab={find.tab}
                    onTab={(tab) => setFind((current) => ({ ...current, tab }))}
                    query={find.query}
                    onQuery={(query) => setFind((current) => ({ ...current, query }))}
                    onJump={jumpFromFind}
                    onClose={() => setFind((current) => ({ ...current, open: false }))}
                />
            )}

            {factsSheet && (
                <FactsSheet
                    facts={chat.facts ?? []}
                    onSave={async (topic, fact) => {
                        try {
                            setChat(await chatApi.setFact(chat.storyId, chat.id, topic, fact));
                            return null;
                        } catch (caught) {
                            if (caught instanceof ApiUnreachableError) reportUnreachable();
                            return caught instanceof ApiError ? caught.message : 'Something went wrong.';
                        }
                    }}
                    onClose={() => setFactsSheet(false)}
                />
            )}
            {itemsSheet && (
                <ItemsSheet
                    items={chat.items ?? []}
                    characters={characters.map((character) => character.name)}
                    onSave={async (change) => {
                        try {
                            setChat(await chatApi.setItem(chat.storyId, chat.id, change));
                            return null;
                        } catch (caught) {
                            if (caught instanceof ApiUnreachableError) reportUnreachable();
                            return caught instanceof ApiError ? caught.message : 'Something went wrong.';
                        }
                    }}
                    onClose={() => setItemsSheet(false)}
                />
            )}
            {snapshotSheet && (
                <SnapshotSheet
                    imageCreditOut={chat.imageCreditOut}
                    initialHint={snapshotSheet.hint}
                    messageId={snapshotSheet.messageId}
                    write={snaps.writePrompt}
                    onDraw={(prompt, text) => void snaps.draw(prompt, text)}
                    onClose={() => setSnapshotSheet(null)}
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
                                  // A retake is read before it is drawn too.
                                  setSnapshotSheet({ hint: snapshot.hint, messageId: snapshot.messageId ?? undefined });
                              }
                    }
                />
            )}
            {/*
             * The room right of the Chat on a wide screen: the Memory drawer while open, else the
             * Dashboard at a glance. Last in the page, so Tab reaches it after the composer.
             */}
            {!drawer.open && <ChatGlance chat={chat} cast={cast} portraits={portraits} />}
        </main>
        </PersonaPictures>
    );
}

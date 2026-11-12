'use client';

import {
    CSSProperties,
    FocusEvent,
    Fragment,
    KeyboardEvent,
    memo,
    MouseEvent,
    PointerEvent,
    ReactNode,
    useEffect,
    useId,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from 'react';

import { ACTION, ACTION_ICON, MessageTabStop } from '@/components/chat/chat-classes';
import { AiMessageParts, MessageBody, UserLine } from '@/components/chat/message-body';
import { ReadAloudAction, ReadAloudControls, readingNowOf, useReadAloud } from '@/components/chat/read-aloud';
import { MessageSnapshots } from '@/components/chat/snapshots';
import { ThaiReadingAction, ThaiReadingBlock, ThaiReadings } from '@/components/chat/thai-reading';
import { BranchIcon, CameraIcon, ChevronLeftIcon, ChevronRightIcon, MoreIcon, PencilIcon, UndoIcon } from '@/components/icons';
import { ConfirmButton } from '@/components/story-editor/fields';
import { Cast, Portraits } from '@/lib/character-colour';
import { isOpening, Message, MessagePart, messageText, ReplyVersions } from '@/lib/chat';
import { ChatSnapshots, Snapshot, SnapshotJob } from '@/lib/snapshot';
import { STORY_TEXT_SIZE, useTextSize } from '@/lib/text-size';

function messageLabel(message: Message): string {
    if (message.kind === 'user') return `${message.identityName} said`;
    return isOpening(message) ? 'Opening' : 'AI reply';
}

/** Focus back on a Message once what held it (its edit box, a menu item) is gone, unless the user is already elsewhere. */
function refocus(element: () => HTMLElement | null) {
    requestAnimationFrame(() => {
        const active = document.activeElement;
        if (!active || active === document.body) element()?.focus({ preventScroll: true });
    });
}

interface EditFormProps {
    message: Message;
    /** How many Messages come after this one; they are discarded on save, after confirming. */
    later: number;
    onSave(text: string): void;
    onCancel(): void;
}

/**
 * The in-place edit box. A User Message is edited as plain text; an AI Message as narration
 * paragraphs and `@Name:` speech lines, which the API re-splits. Saving with later Messages
 * asks first, since they go for good.
 */
function EditForm({ message, later, onSave, onCancel }: EditFormProps) {
    const [value, setValue] = useState(() => messageText(message));
    const empty = value.trim() === '';
    const what = message.kind === 'user' ? 'and the AI replies afresh' : 'and the Chat waits for you';
    return (
        <form
            className="grid gap-2"
            aria-label={`Edit ${messageLabel(message)}`}
            onSubmit={(event) => {
                event.preventDefault();
                if (!empty && later === 0) onSave(value);
            }}
        >
            <textarea
                className="w-full min-w-0 resize-y rounded-sm border border-field-line bg-bg px-2.5 py-2 font-[inherit] text-text"
                aria-label="Message text"
                value={value}
                rows={Math.min(12, Math.max(3, value.split('\n').length + 1))}
                autoFocus
                onChange={(event) => setValue(event.target.value)}
            />
            {message.kind === 'ai' && <p className="m-0 text-sm text-muted">Speech goes on `@Name:` lines; a blank line starts narration.</p>}
            <div className="toolbar">
                {later === 0 ? (
                    <button type="submit" className="button" disabled={empty}>
                        Save
                    </button>
                ) : (
                    <ConfirmButton
                        label="Save"
                        question={`This discards the ${later === 1 ? 'Message' : `${later} Messages`} after it ${what}.`}
                        confirmLabel="Save and rewind"
                        onConfirm={() => onSave(value)}
                        focusAfter={() => document.getElementById(messageAnchor(message.id))}
                        disabled={empty}
                    />
                )}
                <button type="button" className="button button-quiet" onClick={onCancel}>
                    Cancel
                </button>
            </div>
        </form>
    );
}

/** A Message's element id: the `#message-N` that dashboard and Memory links land on. */
function messageAnchor(messageId: number): string {
    return `message-${messageId}`;
}

/** Taps on these inside a Message do their own thing and never show or hide its Edit. */
const OWN_CONTROLS = 'button, a, input, textarea, select, form';

/** ✎ Edit, in the action row and under a tapped Message. */
function EditAction({ onEdit }: { onEdit(): void }) {
    return (
        <button type="button" className={ACTION} onClick={onEdit}>
            <PencilIcon size={16} className={ACTION_ICON} />
            Edit
        </button>
    );
}

/** ⑂ Branch (.scratch/branch/spec.md): always the last action, in the action row and under a tapped Message. */
function BranchAction({ onBranch }: { onBranch(): void }) {
    return (
        <button type="button" className={ACTION} onClick={onBranch}>
            <BranchIcon size={16} className={ACTION_ICON} />
            Branch
        </button>
    );
}

interface OverflowItem {
    key: string;
    node: ReactNode;
}

/**
 * A row of actions on one line (integration: "Message actions"): whatever doesn't fit moves, from
 * the end, into a "⋯" menu, so the row never runs past the screen. Each item's natural width is
 * read off a hidden copy of the row, again whenever the row changes size. The menu closes on
 * Escape, when focus leaves it and after a choice, and hands focus back to ⋯ (audit M23).
 */
function OverflowActions({ label, className, items }: { label: string; className: string; items: OverflowItem[] }) {
    const rowRef = useRef<HTMLDivElement>(null);
    const measureRef = useRef<HTMLDivElement>(null);
    const moreRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLSpanElement>(null);
    const [fit, setFit] = useState(items.length);
    const [open, setOpen] = useState(false);
    const keys = items.map((item) => item.key).join(' ');

    useLayoutEffect(() => {
        const row = rowRef.current;
        const measure = measureRef.current;
        if (!row || !measure) return;
        const measureFit = () => {
            const gap = parseFloat(getComputedStyle(measure).columnGap) || 0;
            const widths = [...measure.children].map((child) => child.getBoundingClientRect().width);
            // The hidden copy ends with the ⋯ button.
            const more = widths.pop() ?? 0;
            const room = row.clientWidth;
            const all = widths.reduce((sum, width, index) => sum + width + (index > 0 ? gap : 0), 0);
            if (all <= room) {
                setFit(widths.length);
                return;
            }
            let used = more;
            let count = 0;
            while (count < widths.length && used + gap + widths[count] <= room) used += gap + widths[count++];
            setFit(count);
        };
        measureFit();
        const observer = new ResizeObserver(measureFit);
        observer.observe(row);
        return () => observer.disconnect();
    }, [keys]);

    // A tap anywhere else closes the menu.
    useEffect(() => {
        if (!open) return;
        const onClick = (event: Event) => {
            if (!rowRef.current?.contains(event.target as Node)) setOpen(false);
        };
        document.addEventListener('click', onClick, true);
        return () => document.removeEventListener('click', onClick, true);
    }, [open]);

    // An open menu near the thread's end scrolls into view rather than hanging past it.
    useEffect(() => {
        if (open) menuRef.current?.scrollIntoView({ block: 'nearest' });
    }, [open]);

    /** Closes the menu; focus that had nowhere left to go lands back on ⋯. */
    const close = () => {
        setOpen(false);
        refocus(() => moreRef.current);
    };

    const hidden = items.slice(fit);
    return (
        <div ref={rowRef} className={`${className} relative flex min-w-0 flex-nowrap gap-2 *:shrink-0`} role="group" aria-label={label}>
            {items.slice(0, fit).map((item) => (
                <Fragment key={item.key}>{item.node}</Fragment>
            ))}
            {hidden.length > 0 && (
                <span
                    className="relative"
                    onKeyDown={(event) => {
                        if (event.key !== 'Escape' || !open) return;
                        event.stopPropagation();
                        setOpen(false);
                        moreRef.current?.focus();
                    }}
                    onBlur={(event: FocusEvent<HTMLSpanElement>) => {
                        if (open && !event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
                    }}
                >
                    <button
                        ref={moreRef}
                        type="button"
                        className={ACTION}
                        aria-label="More actions"
                        aria-expanded={open}
                        onClick={() => setOpen((current) => !current)}
                    >
                        <MoreIcon size={18} className={ACTION_ICON} />
                    </button>
                    {open && (
                        <span
                            ref={menuRef}
                            className="absolute top-full right-0 z-popover mt-1 flex flex-col items-stretch gap-2 rounded-md border border-line bg-surface p-1.5 whitespace-nowrap shadow-lg shadow-shadow-soft"
                            role="group"
                            aria-label="More actions"
                            onClick={close}
                        >
                            {hidden.map((item) => (
                                <Fragment key={item.key}>{item.node}</Fragment>
                            ))}
                        </span>
                    )}
                </span>
            )}
            {/* Clipped to nothing, so the copy never widens the row or the thread. */}
            <div className="pointer-events-none invisible absolute top-0 left-0 size-0 overflow-hidden" aria-hidden="true" inert>
                <div ref={measureRef} className="flex w-max gap-2 whitespace-nowrap *:shrink-0">
                    {items.map((item) => (
                        <Fragment key={item.key}>{item.node}</Fragment>
                    ))}
                    <span className={ACTION}>
                        <MoreIcon size={18} />
                    </span>
                </div>
            </div>
        </div>
    );
}

/** How far a finger must travel sideways on a reply before a swipe changes its version, in CSS pixels. */
const SWIPE_VERSION_PX = 60;

interface VersionSwitchProps {
    versions: ReplyVersions;
    onVersion(version: number): void;
}

const VERSION_STEP = [
    'bare-button grid size-11 place-items-center rounded-full text-text',
    'cursor-pointer press focus-ring',
    'disabled:cursor-not-allowed disabled:text-faint',
].join(' ');

/** ‹ n/m › (.scratch/swipe/spec.md): steps through the newest reply's Reply versions. */
export function VersionSwitch({ versions, onVersion }: VersionSwitchProps) {
    const { current, count } = versions;
    return (
        <span
            className="inline-flex items-center rounded-full border border-field-line bg-surface text-sm font-semibold text-muted"
            role="group"
            aria-label="Reply versions"
        >
            <button type="button" className={VERSION_STEP} aria-label="Previous version" disabled={current <= 1} onClick={() => onVersion(current - 1)}>
                <ChevronLeftIcon size={18} />
            </button>
            <span className="min-w-9 text-center tabular-nums" aria-label={`Version ${current} of ${count}`}>
                {current}/{count}
            </span>
            <button type="button" className={VERSION_STEP} aria-label="Next version" disabled={current >= count} onClick={() => onVersion(current + 1)}>
                <ChevronRightIcon size={18} />
            </button>
        </span>
    );
}

interface ActionRowProps {
    /** ↺ Again; null where it isn't offered (the Opening, an older reply, or sending blocked). */
    onAgain: (() => void) | null;
    onEdit(): void;
    onSnapshot(): void;
    onBranch(): void;
    /** ‹ n/m ›; null while the reply has only one version. */
    versions: VersionSwitchProps | null;
    /** ▶ Read aloud, after the existing actions; null while this Message is the one being read. */
    read: ReactNode;
    /** ไทย, just before ⑂ Branch (integration: "Message actions"). */
    thai: ReactNode;
}

/**
 * Under the newest AI Message while no turn is in flight (spec: "Action row"). ‹ n/m › goes
 * first when the reply has versions, then ↺ Again, never on the Opening; ▶ Read aloud, ไทย, then ⑂ Branch last.
 */
function ActionRow({ onAgain, onEdit, onSnapshot, onBranch, versions, read, thai }: ActionRowProps) {
    const items: OverflowItem[] = [];
    if (versions) items.push({ key: 'versions', node: <VersionSwitch {...versions} /> });
    if (onAgain) {
        items.push({
            key: 'again',
            node: (
                <button type="button" className={ACTION} onClick={onAgain}>
                    <UndoIcon size={16} className={ACTION_ICON} />
                    Again
                </button>
            ),
        });
    }
    items.push({ key: 'edit', node: <EditAction onEdit={onEdit} /> });
    items.push({
        key: 'snapshot',
        node: (
            <button type="button" className={ACTION} onClick={onSnapshot}>
                <CameraIcon size={16} className={ACTION_ICON} />
                Snapshot
            </button>
        ),
    });
    if (read) items.push({ key: 'read', node: read });
    items.push({ key: 'thai', node: thai });
    items.push({ key: 'branch', node: <BranchAction onBranch={onBranch} /> });
    return <OverflowActions label="Message actions" className="mt-2" items={items} />;
}

/** The Chat screen's callbacks and the thread's own, through one object that never changes. */
interface RowHandlers extends Handlers {
    /** Whether a tap on a Message may show its Edit now: no turn or write in flight, no edit open. */
    canTap(): boolean;
    /** Shows or hides a Message's Edit. */
    onTap(messageId: number): void;
    onThaiToggle(message: Message): void;
    onThaiRetry(messageId: number): void;
}

/**
 * One Message's props: each is a primitive, a stable object, or the Message itself, compared by
 * content (audit M32). So a finished reply, which refetches the Chat and gives every Message a
 * new object, redraws only the rows whose content or place changed.
 */
interface MessageViewProps {
    message: Message;
    cast: Cast;
    portraits: Portraits;
    /** How many Messages come after it, while it is edited (saving discards them); 0 otherwise. */
    later: number;
    editing: boolean;
    /** The thread's one tab stop (audit H10): the others take focus from the arrow keys. */
    tabStop: boolean;
    /** Tells the Message what the arrow keys move to. */
    keysHintId: string;
    /** It carries the action row: the latest AI Message, while Edit and Branch are offered. */
    withRow: boolean;
    /** With the action row, it is also the newest Message: ↺ Again and its Reply versions. */
    newest: boolean;
    /** Its Edit shows after a tap. */
    tapped: boolean;
    /** Sending is blocked; read only where the action row or a tapped Message's tools show. */
    blocked: boolean;
    /** The Chat has a Read aloud player. */
    readable: boolean;
    /** It is the Message the player reads (or last read). */
    beingRead: boolean;
    /** The part and paragraph being read out, while it is being read. */
    readPart: number | null;
    readParagraph: number | null;
    thaiShown: boolean;
    thaiBusy: boolean;
    thaiFailed: boolean;
    /** Its Snapshots and Snapshot jobs. */
    snapshots: Snapshot[];
    jobs: SnapshotJob[];
    handlers: RowHandlers;
}

const MESSAGE = [
    'mb-5 rounded-sm',
    'focus-visible:outline-offset-4',
    // A Dashboard or Memory link's Message, outlined (ticket 27); `message-target` is set by script.
    '[&.message-target]:outline-2 [&.message-target]:outline-offset-2 [&.message-target]:outline-accent',
].join(' ');

/**
 * A Message that shows its Edit on a tap, while the thread allows taps (`data-can-tap`, set while
 * Edit is offered). The thread's attribute, not a prop, so a turn starting or ending redraws no
 * Message. The pointer is set on hover only, and the tap flash is off for good: both are inherited,
 * and switching either on every Message restyled the whole thread twice a turn (audit M32).
 */
const TAPPABLE = '[[data-can-tap]_&:hover]:cursor-pointer [-webkit-tap-highlight-color:transparent]';

/** Same story text, speaker and versions: what a Message row draws from (the rest is in its other props). */
function sameMessage(a: Message, b: Message): boolean {
    if (a === b) return true;
    if (a.id !== b.id || a.thaiReading !== b.thaiReading) return false;
    if (a.kind === 'user' || b.kind === 'user') {
        return a.kind === 'user' && b.kind === 'user' && a.text === b.text && a.identityName === b.identityName;
    }
    return (
        a.model === b.model &&
        a.versions?.current === b.versions?.current &&
        a.versions?.count === b.versions?.count &&
        a.parts.length === b.parts.length &&
        a.parts.every((part, index) => sameFields(part, b.parts[index]))
    );
}

/** The same keys holding the same values, one level deep. */
function sameFields(a: object, b: object): boolean {
    const keys = Object.keys(a) as (keyof typeof a)[];
    return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
}

/** Snapshots and jobs come back as new objects on every re-read; compared by what they hold. */
function sameItems<T extends object>(a: T[], b: T[]): boolean {
    return a === b || (a.length === b.length && a.every((item, index) => JSON.stringify(item) === JSON.stringify(b[index])));
}

function sameRow(prev: MessageViewProps, next: MessageViewProps): boolean {
    for (const key of Object.keys(next) as (keyof MessageViewProps)[]) {
        if (key === 'message') {
            if (!sameMessage(prev.message, next.message)) return false;
        } else if (key === 'snapshots' || key === 'jobs') {
            if (!sameItems<object>(prev[key], next[key])) return false;
        } else if (!Object.is(prev[key], next[key])) return false;
    }
    return true;
}

/** The thread's own keys on a Message: up and down to the Messages beside it, Home and End to the ends. */
function moveBetweenMessages(event: KeyboardEvent<HTMLElement>): boolean {
    const keys: Record<string, (all: HTMLElement[], at: number) => number> = {
        ArrowUp: (_, at) => at - 1,
        ArrowDown: (_, at) => at + 1,
        Home: () => 0,
        End: (all) => all.length - 1,
    };
    const step = keys[event.key];
    const thread = event.currentTarget.closest('[data-thread]');
    if (!step || !thread) return false;
    const all = [...thread.querySelectorAll<HTMLElement>('article[data-message-id]')];
    const target = all[step(all, all.indexOf(event.currentTarget))];
    event.preventDefault();
    target?.focus();
    return true;
}

/**
 * One Message, with what goes under it: its Thai reading, Snapshots, tools and Read aloud controls.
 * Memoised (audit M32): it redraws only when its own props change, compared by `sameRow`.
 */
const MessageView = memo(function MessageView({
    message,
    cast,
    portraits,
    later,
    editing,
    tabStop,
    keysHintId,
    withRow,
    newest,
    tapped,
    blocked,
    readable,
    beingRead,
    readPart,
    readParagraph,
    thaiShown,
    thaiBusy,
    thaiFailed,
    snapshots,
    jobs,
    handlers,
}: MessageViewProps) {
    const readingNow = useMemo(() => (readPart === null ? null : { partIndex: readPart, paragraph: readParagraph }), [readPart, readParagraph]);
    const readings = useMemo<ThaiReadings>(
        () => ({
            shown: () => thaiShown,
            busy: () => thaiBusy,
            failed: () => thaiFailed,
            toggle: handlers.onThaiToggle,
            retry: handlers.onThaiRetry,
        }),
        [thaiShown, thaiBusy, thaiFailed, handlers],
    );

    const edit = () => handlers.onEdit(message.id);
    const branch = () => handlers.onBranch(message.id);
    /** ▶ Read aloud for an AI Message, unless it is the one being read (its controls show instead). */
    const read = message.kind === 'ai' && readable && !beingRead ? <ReadAloudAction messageId={message.id} /> : null;
    // Only the newest reply has Reply versions, and they change only while no turn or write is in flight.
    const versions = newest && message.kind === 'ai' ? message.versions : null;
    let tools: ReactNode = null;
    if (withRow) {
        // ↺ Again runs a turn: only on a reply that is the newest Message, never the Opening.
        const again = newest && !isOpening(message) && !blocked;
        tools = (
            <ActionRow
                onAgain={again ? () => handlers.onAgain(message.id) : null}
                onEdit={edit}
                onSnapshot={handlers.onSnapshot}
                onBranch={branch}
                versions={versions ? { versions, onVersion: (version) => handlers.onVersion(message.id, version) } : null}
                read={read}
                thai={<ThaiReadingAction message={message} readings={readings} />}
            />
        );
    } else if (tapped) {
        // A User Message edit runs a turn, so it waits while sending is blocked; a Branch runs none.
        const editable = message.kind === 'ai' || !blocked;
        const items: OverflowItem[] = [];
        if (editable) items.push({ key: 'edit', node: <EditAction onEdit={edit} /> });
        if (read) items.push({ key: 'read', node: read });
        items.push({ key: 'thai', node: <ThaiReadingAction message={message} readings={readings} /> });
        items.push({ key: 'branch', node: <BranchAction onBranch={branch} /> });
        tools = <OverflowActions label="Message tools" className={message.kind === 'user' ? 'mt-1.5 justify-end' : 'mt-1.5'} items={items} />;
    }

    /** A tap shows or hides its Edit, while the thread allows it; the action row's Message has its Edit already. */
    const canTap = () => !withRow && handlers.canTap();
    /** A sideways swipe: 1 for the next Reply version (a swipe left), -1 for the one before; null when it has none. */
    const onSwipe =
        versions && !editing
            ? (by: 1 | -1) => {
                  const version = versions.current + by;
                  if (version >= 1 && version <= versions.count) handlers.onVersion(message.id, version);
              }
            : null;

    // Where a finger went down on a reply with versions; a sideways move past the threshold steps.
    const swipeRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
    const swipeStart = (event: PointerEvent<HTMLElement>) => {
        // A swipe may start on a button too: a finger that moves sideways never clicks it.
        if (!onSwipe || !event.isPrimary || event.pointerType === 'mouse') return;
        swipeRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    };
    const swipeEnd = (event: PointerEvent<HTMLElement>) => {
        const start = swipeRef.current;
        swipeRef.current = null;
        if (!onSwipe || start?.pointerId !== event.pointerId) return;
        const dx = event.clientX - start.x;
        const dy = event.clientY - start.y;
        if (Math.abs(dx) < SWIPE_VERSION_PX || Math.abs(dx) <= Math.abs(dy)) return;
        onSwipe(dx < 0 ? 1 : -1);
    };
    const tap = (event: MouseEvent<HTMLElement>) => {
        // A drag that selects text is reading, not a tap.
        const selecting = (window.getSelection()?.toString() ?? '') !== '';
        if (!selecting && !(event.target as Element).closest(OWN_CONTROLS) && canTap()) handlers.onTap(message.id);
    };
    // The same from the keyboard, so Edit stays reachable without a pointer; the arrows move between Messages.
    const key = (event: KeyboardEvent<HTMLElement>) => {
        if (event.target !== event.currentTarget) return;
        if (moveBetweenMessages(event)) return;
        if ((event.key === 'Enter' || event.key === ' ') && canTap()) {
            event.preventDefault();
            handlers.onTap(message.id);
        }
    };
    const self = () => document.getElementById(messageAnchor(message.id));
    return (
        <article
            id={messageAnchor(message.id)}
            data-message-id={message.id}
            className={[MESSAGE, !withRow && TAPPABLE, onSwipe && 'touch-pan-y'].filter(Boolean).join(' ')}
            aria-label={messageLabel(message)}
            aria-describedby={keysHintId}
            tabIndex={tabStop ? 0 : -1}
            onClick={tap}
            onKeyDown={key}
            onPointerDown={swipeStart}
            onPointerUp={swipeEnd}
            onPointerCancel={() => (swipeRef.current = null)}
        >
            <MessageTabStop.Provider value={tabStop}>
                {editing ? (
                    <EditForm
                        message={message}
                        later={later}
                        onSave={(text) => {
                            handlers.onSave(message, text);
                            refocus(self);
                        }}
                        onCancel={() => {
                            handlers.onCancelEdit();
                            refocus(self);
                        }}
                    />
                ) : (
                    <MessageBody message={message} cast={cast} portraits={portraits} readingNow={readingNow} />
                )}
                {/* Its Thai reading, or why one failed: under the story text, above the Snapshots. */}
                {!editing && <ThaiReadingBlock message={message} readings={readings} />}
                {message.kind === 'ai' && (
                    <MessageSnapshots snapshots={snapshots} jobs={jobs} onOpen={handlers.onOpenSnapshot} onDismiss={handlers.onDismissSnapshot} />
                )}
                {!editing && tools}
                {/* Read aloud's Pause, Resume and Stop while it is being read, whether or not its tools show. */}
                {!editing && message.kind === 'ai' && beingRead && <ReadAloudControls messageId={message.id} />}
            </MessageTabStop.Provider>
        </article>
    );
}, sameRow);

/**
 * The Message whose Edit shows after a tap (spec: "Action row"). A second tap on it, or a tap
 * anywhere outside it, hides it again.
 */
function useTappedMessage(canEdit: boolean) {
    const [tapped, setTapped] = useState<number | null>(null);
    // A turn or a write hides every action, and a Message tapped before it stays hidden after.
    const [couldEdit, setCouldEdit] = useState(canEdit);
    if (couldEdit !== canEdit) {
        setCouldEdit(canEdit);
        if (!canEdit) setTapped(null);
    }
    useEffect(() => {
        if (tapped === null) return;
        const onClick = (event: Event) => {
            const message = document.getElementById(messageAnchor(tapped));
            if (!message?.contains(event.target as Node)) setTapped(null);
        };
        // Capture, so a tap on another Message hides this one before that one shows its own.
        document.addEventListener('click', onClick, true);
        return () => document.removeEventListener('click', onClick, true);
    }, [tapped]);
    return [tapped, setTapped] as const;
}

/** How close to the end, in pixels, still counts as reading at the end. */
const AT_END_SLACK = 48;

/**
 * Keeps the thread at its end (spec: "Scrolling"). It opens at the end, or on the Message a
 * dashboard or Memory link names in the URL hash. It goes back to the end whenever `followKey`
 * changes (a Message added or replaced, the writing indicator shown or gone), and stays there
 * while the content or the thread itself changes size (a Snapshot loading, a notice showing,
 * a streamed reply growing), unless the user has scrolled up to read. A streamed reply that
 * finishes while the user reads further up leaves them where they are (spec: streaming
 * replies, story 4).
 */
function useFollowEnd(followKey: string, streaming: boolean, writing: boolean, openAt: OpenAt | null) {
    const threadRef = useRef<HTMLElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const atEndRef = useRef(true);
    const openedRef = useRef(false);
    /** The turn being written has shown words, even if they are gone again (a Stop, a failure). */
    const streamedRef = useRef(false);
    /** The key the thread opened at a Message under: a second run for it (React's dev double run) keeps that place. */
    const openedAtRef = useRef<string | null>(null);

    useLayoutEffect(() => {
        if (streaming) streamedRef.current = true;
    }, [streaming]);

    useLayoutEffect(() => {
        const thread = threadRef.current;
        if (!thread) return;
        if (openedAtRef.current === followKey) return;
        openedAtRef.current = null;
        const streamed = streamedRef.current;
        if (!writing) streamedRef.current = false;
        // A turn whose reply streamed is over: following it was the user's to stop.
        if (streamed && !atEndRef.current) return;
        if (!openedRef.current) {
            openedRef.current = true;
            // At the Message the Visual novel view showed (its top), else the one the URL's hash names.
            const shown = openAt ? document.getElementById(messageAnchor(openAt.messageId)) : null;
            const hash = window.location.hash.slice(1);
            const target = shown ?? (hash ? document.getElementById(hash) : null);
            if (target) {
                target.scrollIntoView({ block: shown && !openAt?.mark ? 'start' : 'center' });
                if (!shown || openAt?.mark) target.classList.add('message-target');
                atEndRef.current = false;
                openedAtRef.current = followKey;
                return;
            }
        }
        thread.scrollTop = thread.scrollHeight;
        atEndRef.current = true;
        // `writing` is read here too, and it is part of `followKey`.
    }, [followKey]);

    useLayoutEffect(() => {
        const thread = threadRef.current;
        const content = contentRef.current;
        if (!thread || !content) return;
        const onScroll = () => {
            atEndRef.current = thread.scrollHeight - thread.scrollTop - thread.clientHeight <= AT_END_SLACK;
        };
        const observer = new ResizeObserver(() => {
            if (atEndRef.current) thread.scrollTop = thread.scrollHeight;
        });
        thread.addEventListener('scroll', onScroll, { passive: true });
        observer.observe(thread);
        observer.observe(content);
        return () => {
            thread.removeEventListener('scroll', onScroll);
            observer.disconnect();
        };
    }, []);

    return { threadRef, contentRef };
}

/** Where the thread opens instead of its end: a Message, outlined when a link led there. */
export interface OpenAt {
    messageId: number;
    mark: boolean;
}

/** A line the user just sent, shown before the API has answered (spec: "Send feedback"). */
export interface PendingLine {
    text: string;
    identityName: string;
}

/** "Writing…" with three pulsing dots, where the reply will appear (the thread, the Visual novel view's box). */
export function WritingLine({ className = '' }: { className?: string }) {
    return (
        <p className={`flex items-center gap-2 text-md text-muted ${className}`} role="status">
            <span className="inline-flex gap-1" aria-hidden="true">
                {['', '[animation-delay:200ms]', '[animation-delay:400ms]'].map((delay) => (
                    <i key={delay} className={`size-1.5 rounded-full bg-accent motion-safe:animate-pulse-soft ${delay}`} />
                ))}
            </span>
            Writing…
        </p>
    );
}

interface ChatThreadProps {
    messages: Message[];
    cast: Cast;
    /** The cast's Reference images, beside their lines. */
    portraits: Portraits;
    pending: PendingLine | null;
    /** A turn is being written: the indicator shows where the reply will appear. */
    writing: boolean;
    /** The reply so far while the turn streams, shown before the indicator. */
    replySoFar: MessagePart[] | null;
    /** The Message being edited in place, if any. */
    editing: number | null;
    /** Edit and Branch are offered at all (no turn or write in flight, no other edit open). */
    canEdit: boolean;
    /** User Messages can't be edited while sending is blocked, since an edit runs a turn; Branch runs none, so it stays. */
    blocked: boolean;
    snapshots: ChatSnapshots;
    /** The reply ↺ Again is replacing: hidden while its replacement is written in its place. */
    replacing: number | null;
    /** ↺ Again on the newest reply. */
    onAgain(messageId: number): void;
    /** Shows another Reply version of the newest reply (‹ n/m › or a swipe). */
    onVersion(messageId: number, version: number): void;
    onEdit(messageId: number): void;
    /** ⑂ Branch: a new Chat from this Message. */
    onBranch(messageId: number): void;
    onSave(message: Message, text: string): void;
    onCancelEdit(): void;
    /** 📷 in the action row: a Snapshot of the latest AI Message. */
    onSnapshot(): void;
    onOpenSnapshot(snapshot: Snapshot): void;
    onDismissSnapshot(job: SnapshotJob): void;
    /** ไทย on each Message, and which readings show. */
    thaiReadings: ThaiReadings;
    /** Opens at this Message rather than the end (coming from the Visual novel view); read once, on opening. */
    openAt?: OpenAt | null;
}

type Handlers = Pick<
    ChatThreadProps,
    'onAgain' | 'onVersion' | 'onEdit' | 'onBranch' | 'onSave' | 'onCancelEdit' | 'onSnapshot' | 'onOpenSnapshot' | 'onDismissSnapshot'
>;

interface MessageListProps {
    shown: Message[];
    cast: Cast;
    portraits: Portraits;
    editing: number | null;
    canEdit: boolean;
    blocked: boolean;
    snapshots: ChatSnapshots;
    thaiReadings: ThaiReadings;
    tapped: number | null;
    /** The Message that is the thread's tab stop. */
    tabStop: number | null;
    keysHintId: string;
    /** The callbacks, through one object that never changes, so a streamed chunk never redraws this list. */
    handlers: RowHandlers;
}

const NONE: never[] = [];

/** Each Message's Snapshots and jobs, by Message id. */
function byMessage<T extends { messageId: number | null }>(items: T[]): Map<number, T[]> {
    const map = new Map<number, T[]>();
    for (const item of items) {
        if (item.messageId === null) continue;
        const list = map.get(item.messageId);
        if (list) list.push(item);
        else map.set(item.messageId, [item]);
    }
    return map;
}

/**
 * The stored Messages (audit M32): memoised, so a reply streaming in below them redraws only
 * itself. Its props hold still while a turn streams; the callbacks reach the screen's latest.
 * Each row is memoised too and gets only what it uses, so when the Chat changes (a finished
 * reply refetches it) only the Messages whose content or place changed redraw.
 */
const MessageList = memo(function MessageList({
    shown,
    cast,
    portraits,
    editing,
    canEdit,
    blocked,
    snapshots,
    thaiReadings,
    tapped,
    tabStop,
    keysHintId,
    handlers,
}: MessageListProps) {
    const player = useReadAloud();
    const now = readingNowOf(player);
    const last = shown[shown.length - 1];
    // The action row goes under the latest AI Message (the Opening counts), the one a Snapshot is taken of.
    const newestAiMessage = shown.findLast((message) => message.kind === 'ai');
    const snapshotsOf = useMemo(() => byMessage(snapshots.snapshots), [snapshots.snapshots]);
    const jobsOf = useMemo(() => byMessage(snapshots.jobs), [snapshots.jobs]);

    return shown.map((message, index) => {
        const isEditing = editing === message.id;
        const withRow = canEdit && message === newestAiMessage;
        const isTapped = canEdit && !withRow && tapped === message.id;
        const reading = now?.messageId === message.id ? now : null;
        return (
            <MessageView
                key={message.id}
                message={message}
                cast={cast}
                portraits={portraits}
                // Read only by its edit box: the others stay 0, so a new Message redraws none of them.
                later={isEditing ? shown.length - index - 1 : 0}
                editing={isEditing}
                tabStop={message.id === tabStop}
                keysHintId={keysHintId}
                withRow={withRow}
                newest={withRow && message === last}
                tapped={isTapped}
                blocked={(withRow || isTapped) && blocked}
                readable={player !== null}
                beingRead={player !== null && player.messageId === message.id}
                readPart={reading ? reading.partIndex : null}
                readParagraph={reading ? reading.paragraph : null}
                thaiShown={thaiReadings.shown(message)}
                thaiBusy={thaiReadings.busy(message.id)}
                thaiFailed={thaiReadings.failed(message.id)}
                snapshots={snapshotsOf.get(message.id) ?? NONE}
                jobs={jobsOf.get(message.id) ?? NONE}
                handlers={handlers}
            />
        );
    });
});

/**
 * The Chat's Messages in order, as their own scroll area between the top bar and the composer.
 * It is one stop in the Tab order (audit H10): Tab lands on one Message, the arrow keys move to
 * the others, and Tab again goes on to that Message's controls and then the composer.
 */
export function ChatThread(props: ChatThreadProps) {
    const { messages, cast, portraits, pending, writing, replySoFar, editing, canEdit, blocked, snapshots, replacing, thaiReadings, openAt = null } =
        props;
    // ↺ Again replaces the reply in place: it leaves the thread while the writing indicator shows.
    const shown = useMemo(() => (replacing === null ? messages : messages.filter((message) => message.id !== replacing)), [messages, replacing]);
    const last = shown[shown.length - 1];
    // The newest Message's text is in the key too: an edit replaces it in place, under its id.
    const newest = last ? `${last.id}:${messageText(last)}` : '';
    // A growing reply is followed by the size observer, and only while the user is at the end.
    const streaming = writing && replySoFar !== null && replySoFar.length > 0;
    const { threadRef, contentRef } = useFollowEnd(`${shown.length}:${newest}:${pending !== null}:${writing}`, streaming, writing, openAt);
    const storySize = { '--story-size': STORY_TEXT_SIZE[useTextSize()] } as CSSProperties;
    const [tapped, setTapped] = useTappedMessage(canEdit);
    const keysHintId = useId();

    // The Message last focused is the tab stop; until there is one, the one being edited or the newest.
    const [focused, setFocused] = useState<number | null>(null);
    const tabStop = shown.some((message) => message.id === focused) ? focused : (editing ?? last?.id ?? null);

    // The callbacks change with every render of the screen; the list reads them through this one object.
    const latest = useRef<ChatThreadProps>(props);
    useLayoutEffect(() => {
        latest.current = props;
    });
    const handlers = useMemo<RowHandlers>(
        () => ({
            onAgain: (id) => latest.current.onAgain(id),
            onVersion: (id, version) => latest.current.onVersion(id, version),
            onEdit: (id) => {
                setTapped(null);
                latest.current.onEdit(id);
            },
            onBranch: (id) => latest.current.onBranch(id),
            onSave: (message, text) => latest.current.onSave(message, text),
            onCancelEdit: () => latest.current.onCancelEdit(),
            onSnapshot: () => latest.current.onSnapshot(),
            onOpenSnapshot: (snapshot) => latest.current.onOpenSnapshot(snapshot),
            onDismissSnapshot: (job) => latest.current.onDismissSnapshot(job),
            canTap: () => latest.current.canEdit,
            onTap: (id) => setTapped((current) => (current === id ? null : id)),
            onThaiToggle: (message) => latest.current.thaiReadings.toggle(message),
            onThaiRetry: (id) => latest.current.thaiReadings.retry(id),
        }),
        [setTapped],
    );

    return (
        <section
            ref={threadRef}
            data-thread=""
            data-can-tap={canEdit ? '' : undefined}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
            style={storySize}
            aria-label="Messages"
            onFocus={(event) => {
                const article = (event.target as Element).closest<HTMLElement>('article[data-message-id]');
                if (article) setFocused(Number(article.dataset.messageId));
            }}
        >
            <p id={keysHintId} hidden>
                Up and down arrows move between Messages. Enter shows a Message&apos;s actions.
            </p>
            <div ref={contentRef} className="px-1 pt-2 pb-4 lg:mx-auto lg:w-[min(100%_-_3rem,48rem)] lg:pt-5">
                <MessageList
                    shown={shown}
                    cast={cast}
                    portraits={portraits}
                    editing={editing}
                    canEdit={canEdit}
                    blocked={blocked}
                    snapshots={snapshots}
                    thaiReadings={thaiReadings}
                    tapped={tapped}
                    tabStop={tabStop}
                    keysHintId={keysHintId}
                    handlers={handlers}
                />
                {pending && (
                    <article className="mb-5" aria-label={`${pending.identityName} said`} aria-busy="true">
                        <UserLine identityName={pending.identityName} text={pending.text} />
                    </article>
                )}
                {streaming && (
                    <article className="mb-5" aria-label="AI reply" aria-busy="true">
                        <AiMessageParts parts={replySoFar} cast={cast} portraits={portraits} />
                    </article>
                )}
                {writing && <WritingLine className="mt-0 mb-4" />}
            </div>
        </section>
    );
}

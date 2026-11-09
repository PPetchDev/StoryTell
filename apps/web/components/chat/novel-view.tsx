'use client';

import { CSSProperties, KeyboardEvent, MouseEvent, PointerEvent, ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { useCastCharacter, useCharacterProfile } from '@/components/chat/character-profile';
import { VersionSwitch } from '@/components/chat/chat-thread';
import { withActions } from '@/components/chat/message-body';
import { ReadAloudControls, useReadAloud } from '@/components/chat/read-aloud';
import { useShownText } from '@/components/chat/shown-text';
import { initialOf } from '@/components/portrait/character-portrait';
import { snapshotAlt } from '@/components/snapshot/snapshot-viewer';
import { Cast, characterColour } from '@/lib/character-colour';
import { isOpening, Message, MessagePart } from '@/lib/chat';
import { linePicture } from '@/lib/expressions';
import { firstStepOf, isLive, novelSteps, NovelStep, openingStep, readingStep, stepIndex } from '@/lib/novel-steps';
import { ChatSnapshots, Snapshot, snapshotImageUrl } from '@/lib/snapshot';
import type { SpeechItem } from '@/lib/read-aloud';
import { STORY_TEXT_SIZE, useTextSize } from '@/lib/text-size';

import threadStyles from './chat-thread.module.css';
import styles from './novel-view.module.css';

/** A move the Chat screen asks of the view: to the newest reply's first step (↺ Again, a version), or the Opening's (Reset). */
export interface NovelRequest {
    kind: 'newest-reply' | 'opening';
    /** A new number for each request, so the same kind can be asked again. */
    nonce: number;
}

interface NovelViewProps {
    messages: Message[];
    cast: Cast;
    pending: { identityName: string; text: string } | null;
    writing: boolean;
    replySoFar: MessagePart[] | null;
    replacing: number | null;
    snapshots: ChatSnapshots;
    /** A write that runs no turn is in flight (a version change, a Reset). */
    busy: boolean;
    /** The newest reply's actions are on offer: no turn, write or edit in flight. */
    canAct: boolean;
    blocked: boolean;
    request: NovelRequest | null;
    onAgain(messageId: number): void;
    onVersion(messageId: number, version: number): void;
    onSnapshot(): void;
    onEditInThread(messageId: number): void;
    onOpenSnapshot(snapshot: Snapshot): void;
    /** The Message of the step on show, so switching to the thread can scroll to it. */
    onPosition(messageId: number | null): void;
}

/** Taps on these do their own thing and never step. */
const OWN_CONTROLS = 'button, a, input, textarea, select, form';

/** How far a pointer may move between down and up and still be a tap, in CSS pixels. */
const TAP_SLOP_PX = 8;

/**
 * The Visual novel view (.scratch/chat-looks/spec.md, "Visual novel view"): the Chat one step at
 * a time over the Backdrop. The thread stays the source of truth: the steps come from the same
 * Messages, line being sent, streamed reply and Snapshots, in their shown text.
 */
export function NovelView(props: NovelViewProps) {
    const { messages, pending, writing, replySoFar, replacing, snapshots, busy, canAct, blocked, request } = props;
    const shown = useShownText();
    const steps = useMemo(
        () => novelSteps({ messages, pending, replySoFar, replacing, snapshots: snapshots.snapshots, shown }),
        [messages, pending, replySoFar, replacing, snapshots.snapshots, shown],
    );

    /** The step on show, by key; null until the view has opened. */
    const [key, setKey] = useState<string | null>(null);
    /** Next was pressed past the last step that has arrived: the writing dots show until the next one comes. */
    const [waiting, setWaiting] = useState(false);
    const lastIndexRef = useRef(0);
    let index = key === null ? openingStep(steps) : stepIndex(steps, key);
    if (index < 0) index = Math.min(lastIndexRef.current, steps.length - 1);
    const step: NovelStep | undefined = steps[index];
    lastIndexRef.current = Math.max(index, 0);

    const go = (to: number) => {
        const target = steps[to];
        if (!target) return;
        lastIndexRef.current = to;
        setKey(target.key);
        setWaiting(false);
    };

    // The key follows the step it resolved to: a streamed step becomes the stored one, so the position holds.
    useEffect(() => {
        if (step && step.key !== key) setKey(step.key);
    }, [step, key]);

    const { onPosition } = props;
    useEffect(() => onPosition(step?.messageId ?? null), [step?.messageId, onPosition]);

    // --- Playing: a turn started in this tab ------------------------------------------------------
    /** Moves to the reply once, when its first step arrives: a turn started here (Send, Continue, Retry) is followed to its start. */
    const followRef = useRef(false);
    const wasWritingRef = useRef(writing);
    useLayoutEffect(() => {
        if (writing && !wasWritingRef.current) {
            followRef.current = true;
            // Send: the user's own line first.
            const sent = steps.findIndex((candidate) => candidate.key === 'pending');
            if (sent >= 0) go(sent);
        }
        if (!writing) followRef.current = false;
        wasWritingRef.current = writing;
        // Only the turn's start and end matter here.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [writing]);

    const handledRef = useRef<number | null>(null);
    const prevKeysRef = useRef<string[] | null>(null);
    const hadJobsRef = useRef(snapshots.jobs.length > 0);
    useEffect(() => {
        const prevKeys = prevKeysRef.current;
        prevKeysRef.current = steps.map((each) => each.key);
        const hadJobs = hadJobsRef.current;
        hadJobsRef.current = snapshots.jobs.length > 0;

        if (request && handledRef.current !== request.nonce) {
            if (request.kind === 'newest-reply') {
                const live = steps.findIndex(isLive);
                if (live >= 0) {
                    handledRef.current = request.nonce;
                    followRef.current = false;
                    go(live);
                    return;
                }
                if (!writing && !busy) {
                    handledRef.current = request.nonce;
                    const newest = messages.findLast((message) => message.kind === 'ai' && message.id !== replacing);
                    if (newest) go(firstStepOf(steps, newest.id));
                    return;
                }
            } else if (!writing && !busy) {
                handledRef.current = request.nonce;
                go(0);
                return;
            }
        }
        // Next past the end: the next step to arrive shows.
        if (waiting && index < steps.length - 1) {
            go(index + 1);
            return;
        }
        if (followRef.current && writing) {
            const live = steps.findIndex(isLive);
            if (live >= 0) {
                followRef.current = false;
                go(live);
                return;
            }
        }
        // A Snapshot taken here comes up as its own step, if the user is on the step it follows.
        if (prevKeys && hadJobs) {
            const next = steps[index + 1];
            if (next?.kind === 'snapshot' && !prevKeys.includes(next.key)) go(index + 1);
        }
        // `go` and `index` are read fresh each time; the steps, the turn and the request drive this.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [steps, writing, busy, request, waiting]);

    // --- Read aloud: the view shows the step being read, and moves on with the audio -------------
    const player = useReadAloud();
    const reading = player && player.messageId !== null && player.item && (player.state === 'loading' || player.state === 'playing' || player.state === 'paused');
    const readingAt = reading ? readingStep(steps, player.messageId!, player.item!.partIndex, player.item!.paragraph) : -1;
    useEffect(() => {
        if (readingAt >= 0) go(readingAt);
        // Each new item moves the view once; stepping by hand meanwhile is the user's.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [player?.messageId, player?.item?.index]);

    // --- Going on and back ------------------------------------------------------------------------
    const next = () => {
        if (index < steps.length - 1) go(index + 1);
        else if (writing) setWaiting(true);
    };
    const back = () => {
        if (waiting) setWaiting(false);
        else if (index > 0) go(index - 1);
    };

    const stageRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        stageRef.current?.focus({ preventScroll: true });
    }, []);
    // Focus stays on the stage between steps: a button that went with the last step hands it back.
    useEffect(() => {
        const active = document.activeElement;
        if (!active || active === document.body) stageRef.current?.focus({ preventScroll: true });
    }, [index]);

    const downRef = useRef<{ x: number; y: number } | null>(null);
    const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
        downRef.current = { x: event.clientX, y: event.clientY };
    };
    const onClick = (event: MouseEvent<HTMLDivElement>) => {
        const down = downRef.current;
        downRef.current = null;
        if ((event.target as Element).closest(OWN_CONTROLS)) return;
        // A drag that scrolls the box, or selects its text, is reading, not a tap.
        if (down && Math.hypot(event.clientX - down.x, event.clientY - down.y) > TAP_SLOP_PX) return;
        if ((window.getSelection()?.toString() ?? '') !== '') return;
        next();
    };
    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        const target = event.target as Element;
        if (target.closest('input, textarea, select')) return;
        const onControl = target.closest('button, a') !== null;
        if (event.key === 'ArrowRight' || ((event.key === ' ' || event.key === 'Enter') && !onControl)) {
            event.preventDefault();
            next();
        } else if (event.key === 'ArrowLeft') {
            event.preventDefault();
            back();
        }
    };

    // --- The newest reply's actions, on its last step ----------------------------------------------
    const shownMessages = replacing === null ? messages : messages.filter((message) => message.id !== replacing);
    const last = shownMessages[shownMessages.length - 1];
    const newestAi = shownMessages.findLast((message) => message.kind === 'ai');
    const newestLastStep = newestAi ? steps.findLastIndex((each) => each.messageId === newestAi.id && each.kind !== 'snapshot') : -1;
    const withRow = canAct && newestAi !== undefined && index === newestLastStep;

    const storySize = { '--story-size': STORY_TEXT_SIZE[useTextSize()] } as CSSProperties;
    const pendingJobs = snapshots.jobs.filter((job) => job.status === 'pending').length;
    const failedJobs = snapshots.jobs.filter((job) => job.status === 'failed').length;

    const nav = (
        <div className={styles.nav}>
            <button type="button" className={styles.navButton} onClick={back} disabled={index <= 0 && !waiting}>
                <span aria-hidden="true">‹ </span>Back
            </button>
            <button type="button" className={styles.navButton} onClick={next} disabled={index >= steps.length - 1 && !writing}>
                Next<span aria-hidden="true"> ›</span>
            </button>
        </div>
    );

    return (
        <section className={styles.view} style={storySize} aria-label="Visual novel view">
            <div
                ref={stageRef}
                className={styles.stage}
                data-stage=""
                tabIndex={0}
                onPointerDown={onPointerDown}
                onClick={onClick}
                onKeyDown={onKeyDown}
            >
                {(pendingJobs > 0 || failedJobs > 0) && (
                    <div className={styles.chips}>
                        {pendingJobs > 0 && (
                            <p className={styles.chip} role="status">
                                Drawing a Snapshot…
                            </p>
                        )}
                        {failedJobs > 0 && <p className={`${styles.chip} ${styles.chipFailed}`}>Snapshot failed</p>}
                    </div>
                )}
                {step?.kind === 'snapshot' ? (
                    <>
                        <div className={styles.figure}>
                            {/* eslint-disable-next-line @next/next/no-img-element -- served by the API from the image folder */}
                            <img key={step.key} className={styles.snapshot} src={snapshotImageUrl(step.snapshot)} alt={snapshotAlt(step.snapshot)} />
                            <button type="button" className={`button button-quiet ${styles.open}`} onClick={() => props.onOpenSnapshot(step.snapshot)}>
                                Open
                            </button>
                        </div>
                        {nav}
                    </>
                ) : (
                    <>
                        <div className={styles.figure}>{step?.kind === 'speech' && <SpeakerPicture key={step.key} step={step} cast={props.cast} />}</div>
                        {step && (
                            <div className={styles.boxFrame}>
                                <section className={styles.box} aria-label="Shown line" aria-live="polite">
                                    {waiting ? (
                                        <p className={threadStyles.writing} role="status">
                                            <span className={threadStyles.dots} aria-hidden="true">
                                                <i />
                                                <i />
                                                <i />
                                            </span>
                                            Writing…
                                        </p>
                                    ) : (
                                        <StepText step={step} cast={props.cast} />
                                    )}
                                </section>
                                {!waiting && (
                                    <StepTools
                                        step={step}
                                        withRow={withRow}
                                        newestAi={withRow ? newestAi! : null}
                                        isLast={newestAi === last}
                                        blocked={blocked}
                                        onAgain={props.onAgain}
                                        onVersion={props.onVersion}
                                        onSnapshot={props.onSnapshot}
                                        onEditInThread={props.onEditInThread}
                                    />
                                )}
                                {nav}
                            </div>
                        )}
                    </>
                )}
            </div>
        </section>
    );
}

/** The large picture of a speech step: the whole Expression or Reference image, else a large initial on their colour. */
function SpeakerPicture({ step, cast }: { step: Extract<NovelStep, { kind: 'speech' }>; cast: Cast }) {
    const character = useCastCharacter(step.characterId);
    const openProfile = useCharacterProfile(step.characterId);
    const whole = linePicture(character, step.emotion).whole;
    const colour = characterColour(step.characterId, cast);
    const picture = whole ? (
        // eslint-disable-next-line @next/next/no-img-element -- served by the API from the image folder
        <img className={styles.picture} src={whole} alt={step.speakerName} data-stage-picture="" draggable={false} />
    ) : (
        <span className={styles.initial} style={{ background: colour }} role="img" aria-label={step.speakerName} data-stage-picture="">
            {initialOf(step.speakerName)}
        </span>
    );
    if (!openProfile) return picture;
    return (
        <button type="button" className={styles.pictureButton} aria-label={`Profile of ${step.speakerName}`} onClick={openProfile}>
            {picture}
        </button>
    );
}

/** The box's words: the speaker's name in their colour (the worn name for the user's line, none for narration), then the text. */
function StepText({ step, cast }: { step: Exclude<NovelStep, { kind: 'snapshot' }>; cast: Cast }) {
    if (step.kind === 'narration') {
        return (
            <p className={`${styles.text} ${styles.narration}`} data-line="">
                {step.text}
            </p>
        );
    }
    const colour = step.kind === 'user' ? 'var(--accent)' : characterColour(step.characterId, cast);
    const name = step.kind === 'user' ? step.identityName : step.speakerName;
    return (
        <>
            <p className={styles.speaker} style={{ color: colour }} data-speaker="">
                {name}
            </p>
            <p className={styles.text} data-line="">
                {withActions(step.text)}
            </p>
        </>
    );
}

interface StepToolsProps {
    step: Exclude<NovelStep, { kind: 'snapshot' }>;
    /** The newest reply's last step, with nothing in flight: the action row. */
    withRow: boolean;
    newestAi: Message | null;
    /** The newest AI Message is the newest Message: ↺ Again and versions are on offer. */
    isLast: boolean;
    blocked: boolean;
    onAgain(messageId: number): void;
    onVersion(messageId: number, version: number): void;
    onSnapshot(): void;
    onEditInThread(messageId: number): void;
}

/**
 * Under the box: on the newest reply's last step the action row (‹ n/m ›, ↺ Again, 📷 Snapshot,
 * ▶ Read aloud, Edit in thread); on any other step of a stored AI Message, ▶ Read aloud from it. While
 * that Message is read, its Pause and Stop instead of ▶.
 */
function StepTools({ step, withRow, newestAi, isLast, blocked, onAgain, onVersion, onSnapshot, onEditInThread }: StepToolsProps) {
    const player = useReadAloud();
    const messageId = step.kind !== 'user' ? step.messageId : null;
    let read: ReactNode = null;
    if (player && messageId !== null && step.kind !== 'user') {
        const { partIndex } = step;
        const paragraph = step.kind === 'narration' ? step.paragraph : null;
        read =
            player.messageId === messageId ? (
                <ReadAloudControls messageId={messageId} />
            ) : (
                <button
                    type="button"
                    className={threadStyles.action}
                    onClick={() => {
                        // From the item of the step on show (its part, and for narration its paragraph).
                        const from = (items: SpeechItem[]) =>
                            items.findIndex(
                                (item) => item.partIndex === partIndex && (paragraph === null || item.paragraph === paragraph),
                            );
                        player.play(messageId, from);
                        player.unlock();
                    }}
                >
                    <span aria-hidden="true">▶</span>Read aloud
                </button>
            );
    }
    if (!withRow || !newestAi || newestAi.kind !== 'ai') {
        return read ? <div className={styles.tools}>{read}</div> : null;
    }
    const versions = isLast ? newestAi.versions : null;
    const again = isLast && !isOpening(newestAi) && !blocked;
    return (
        <div className={styles.tools} role="group" aria-label="Message actions">
            {versions && <VersionSwitch versions={versions} onVersion={(version) => onVersion(newestAi.id, version)} />}
            {again && (
                <button type="button" className={threadStyles.action} onClick={() => onAgain(newestAi.id)}>
                    <span aria-hidden="true">↺</span>Again
                </button>
            )}
            <button type="button" className={threadStyles.action} onClick={onSnapshot}>
                <span aria-hidden="true">📷</span>Snapshot
            </button>
            {read}
            <button type="button" className={threadStyles.action} onClick={() => onEditInThread(newestAi.id)}>
                <span aria-hidden="true">✎</span>Edit in thread
            </button>
        </div>
    );
}

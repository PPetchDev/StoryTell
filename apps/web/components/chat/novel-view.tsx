'use client';

import { CSSProperties, KeyboardEvent, MouseEvent, PointerEvent, ReactNode, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useYourFace } from '@/components/chat/persona-pictures';

import { useCastCharacter, useCastLookup, useCharacterProfile } from '@/components/chat/character-profile';
import { COLUMN } from '@/components/chat/chat-classes';
import { VersionSwitch, WritingLine } from '@/components/chat/chat-thread';
import { RollLine, withActions } from '@/components/chat/message-body';
import { ReadAloudControls, useReadAloud } from '@/components/chat/read-aloud';
import { useShownText } from '@/components/chat/shown-text';
import { CameraIcon, ChevronLeftIcon, ChevronRightIcon, PencilIcon, PlayIcon, ThreadIcon, UndoIcon } from '@/components/icons';
import { initialOf } from '@/components/portrait/character-portrait';
import { snapshotAlt } from '@/components/snapshot/snapshot-viewer';
import { Cast, characterColour } from '@/lib/character-colour';
import { ChatStage, isOpening, Message, MessagePart } from '@/lib/chat';
import { linePicture, outfitPicture, stageSrc } from '@/lib/expressions';
import { referenceImageUrl } from '@/lib/story';
import { stageAt } from '@/lib/stage';
import { firstStepOf, isLive, novelSteps, NovelStep, openingStep, readingStep, stepIndex } from '@/lib/novel-steps';
import { ChatSnapshots, Snapshot, snapshotImageUrl } from '@/lib/snapshot';
import type { SpeechItem } from '@/lib/read-aloud';
import { SCROLL_FADES, useScrollFade } from '@/lib/scroll-fade';
import { STORY_TEXT_SIZE, useTextSize } from '@/lib/text-size';

/*
 * The view is a stage between the top bar and the composer, over the Backdrop (or the plain page).
 * The speaker stands bottom-centred above the box; the box holds the words, at most 40% of the
 * stage (30% on a PC, where the picture may stand taller), scrolling inside.
 */
const STAGE = [
    // On a phone the stage fills the screen edge to edge, under the top bar (2026-11-22): no gutter, no gap, no rounded corners.
    'relative flex min-h-0 flex-1 flex-col max-lg:-mx-4 lg:pt-2',
    'cursor-pointer select-none focus-ring-inset',
    COLUMN,
].join(' ');

/** Back and Next, the view's own controls: 44px tall and 80px wide (audit H29). */
/** A round arrow in the novel box: 44px, quiet, disabled faint. */
/**
 * A tool in the box (↺ Again, 📷 Snapshot, ▶ Read aloud, ☰ Edit in thread): a round 44px icon, its name
 * for screen readers and as a title (.scratch/novel-reading/spec.md: icons only, so the row fits a
 * 360px phone without scrolling).
 */
const BOX_TOOL = 'bare-button icon-ring grid size-11 shrink-0 place-items-center rounded-full text-text cursor-pointer press focus-ring disabled:cursor-not-allowed disabled:text-faint';
const ROUND_NAV = 'bare-button icon-ring inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted cursor-pointer press focus-ring disabled:opacity-35 disabled:cursor-default';

const NAV_BUTTON = [
    'bare-button inline-flex min-h-11 min-w-20 items-center justify-center gap-1 rounded-full px-3',
    'text-md font-semibold text-muted',
    'cursor-pointer press focus-ring',
    'disabled:cursor-not-allowed disabled:text-faint',
].join(' ');

/** "Drawing a Snapshot…", "Snapshot failed": over the stage's corner. */
const CHIP = 'm-0 rounded-full border px-2.5 py-0.5 text-sm font-semibold';

/** The words in the box, in the story's size. */
const STEP_TEXT = 'm-0 text-[length:var(--story-size,1.0625rem)] leading-[1.55] whitespace-pre-wrap';

/** A move the Chat screen asks of the view: to the newest reply's first step (↺ Again, a version), or the Opening's (Reset). */
export interface NovelRequest {
    kind: 'newest-reply' | 'opening';
    /** A new number for each request, so the same kind can be asked again. */
    nonce: number;
}

interface NovelViewProps {
    messages: Message[];
    cast: Cast;
    pending: { identityName: string; text: string; roll?: boolean } | null;
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
    /** The dressed stage (.scratch/dressed-stage/spec.md): the place behind, and the outfits; null with it off. */
    stage?: ChatStage | null;
    /** Brings the composer out while it is put away for reading (.scratch/novel-reading/spec.md); left out while it is out. */
    onWrite?(): void;
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

    // The next lines' pictures load while this one shows, so a step never opens on an empty stage.
    const castLookup = useCastLookup();
    const { stage } = props;
    // Each line shows the place and the clothes of its own moment (.scratch/dressed-stage/spec.md).
    const messageIds = useMemo(() => messages.map((message) => message.id), [messages]);
    const moment = useMemo(() => stageAt(stage, messageIds, step?.messageId ?? null), [stage, messageIds, step?.messageId]);
    useEffect(() => {
        for (const ahead of steps.slice(index + 1, index + 4)) {
            if (ahead.kind !== 'speech') continue;
            const sprites = stageAt(stage, messageIds, ahead.messageId).sprites(ahead.characterId);
            const picture = outfitPicture(sprites, ahead.emotion) ?? linePicture(castLookup(ahead.characterId), ahead.emotion);
            if (picture.whole) new Image().src = stageSrc(picture.whole, picture.cutout);
        }
    }, [index, steps, stage, messageIds, castLookup]);

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

    const keysId = useId();
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

    /**
     * ✎ brings the composer out while it is put away for reading (.scratch/novel-reading/spec.md). It
     * stands just above the box, by the thumb: at the top of the stage the low-credit line and the
     * toasts lay over it, and their × took the tap.
     */
    const writeButton = props.onWrite && (
        <button
            type="button"
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-line bg-surface/85 text-text shadow-md backdrop-blur-sm press focus-ring"
            aria-label="Write a message"
            title="Write a message"
            onClick={props.onWrite}
        >
            <PencilIcon size={20} />
        </button>
    );
    const nav = (
        <div className={`flex justify-between gap-2 ${step?.kind === 'snapshot' ? 'mt-1.5 max-lg:mx-4' : ''}`}>
            <button type="button" className={NAV_BUTTON} onClick={back} disabled={index <= 0 && !waiting}>
                <ChevronLeftIcon size={18} />
                Back
            </button>
            {writeButton}
            <button type="button" className={NAV_BUTTON} onClick={next} disabled={index >= steps.length - 1 && !writing}>
                Next
                <ChevronRightIcon size={18} />
            </button>
        </div>
    );
    // In the box (.scratch/novel-reading/spec.md): a round 44px arrow each, either side of the tools, so the words get the room.
    const backButton = (
        <button type="button" className={ROUND_NAV} aria-label="Back" onClick={back} disabled={index <= 0 && !waiting}>
            <ChevronLeftIcon size={18} />
        </button>
    );
    const nextButton = (
        <button type="button" className={ROUND_NAV} aria-label="Next" onClick={next} disabled={index >= steps.length - 1 && !writing}>
            <ChevronRightIcon size={18} />
        </button>
    );

    return (
        <section className="flex min-h-0 flex-1 flex-col" style={storySize} aria-label="Visual novel view">
            <p id={keysId} hidden>
                Next: Space, Enter or the right arrow, or a tap. Back: the left arrow.
            </p>
            <div
                ref={stageRef}
                className={STAGE}
                // What it is and how it steps (audit M24): a group, named, with its keys.
                role="group"
                aria-label="Story stage"
                aria-describedby={keysId}
                data-stage=""
                tabIndex={0}
                onPointerDown={onPointerDown}
                onClick={onClick}
                onKeyDown={onKeyDown}
            >
                {(pendingJobs > 0 || failedJobs > 0) && (
                    <div className={`absolute right-0 z-raised flex flex-col items-end gap-1 top-2 max-lg:right-2`}>
                        {pendingJobs > 0 && (
                            <p className={`${CHIP} border-line bg-surface text-muted`} role="status">
                                Drawing a Snapshot…
                            </p>
                        )}
                        {failedJobs > 0 && <p className={`${CHIP} border-snapshot-failed-line bg-snapshot-failed-surface text-text`}>Snapshot failed</p>}
                    </div>
                )}
                {step?.kind === 'snapshot' ? (
                    <>
                        <div className="relative flex min-h-0 flex-1 items-end justify-center max-lg:mx-4 max-lg:pt-2">
                            {/* eslint-disable-next-line @next/next/no-img-element -- served by the API from the image folder */}
                            <img key={step.key} className="block size-full object-contain motion-safe:animate-fade-in" src={snapshotImageUrl(step.snapshot)} alt={snapshotAlt(step.snapshot)} />
                            <button type="button" className="button button-quiet absolute right-2 bottom-2" onClick={() => props.onOpenSnapshot(step.snapshot)}>
                                Open
                            </button>
                        </div>
                        {nav}
                    </>
                ) : (
                    <>
                        {/* The whole stage, the box over its foot (.scratch/novel-reading/spec.md): the picture is as tall as the screen allows. */}
                        <div className="absolute inset-x-0 top-0 bottom-0 flex items-end justify-center overflow-hidden lg:top-2 lg:rounded-t-xl">
                            {moment.placePicturePath && (
                                // The place, drawn with no one in it, behind whoever speaks (.scratch/dressed-stage/spec.md).
                                // eslint-disable-next-line @next/next/no-img-element -- served by the API from the image folder
                                <img
                                    key={moment.placePicturePath}
                                    className="pointer-events-none absolute inset-0 size-full object-cover motion-safe:animate-fade-in"
                                    src={stageSrc(referenceImageUrl(moment.placePicturePath), true)}
                                    alt=""
                                    aria-hidden="true"
                                    data-stage-place=""
                                    draggable={false}
                                />
                            )}
                            {/* Your face on the stage (.scratch/your-faces/spec.md): only where the Role or Persona has that Expression. */}
                            {step?.kind === 'user' && step.face && <YourFacePicture key={step.key} step={step} />}
                            {step?.kind === 'speech' && (
                                <SpeakerPicture
                                    key={step.key}
                                    step={step}
                                    cast={props.cast}
                                    sprites={moment.sprites(step.characterId)}
                                />
                            )}
                        </div>
                        {step && (
                            <div
                                className="relative z-raised mt-auto mb-1 flex max-h-[58%] max-lg:mx-2 min-h-0 cursor-auto flex-col gap-1 rounded-xl border border-line bg-surface/90 px-3.5 pt-3 pb-1.5 shadow-lg backdrop-blur-sm select-text lg:max-h-[40%]"
                                data-novel-box=""
                            >
                                {writeButton && <div className="absolute right-0 bottom-full mb-2">{writeButton}</div>}
                                {/* Quiet while the words on show are still streaming in, so a screen reader isn't read every piece (audit M24). */}
                                <section className="min-h-0 overflow-y-auto overscroll-contain" aria-label="Shown line" aria-live={isLive(step) ? 'off' : 'polite'}>
                                    {waiting ? (
                                        <WritingLine className="m-0" />
                                    ) : (
                                        <StepText
                                            step={step}
                                            cast={props.cast}
                                            epilogue={step.kind !== 'user' && messages.some((message) => message.id === step.messageId && message.kind === 'ai' && message.epilogue)}
                                        />
                                    )}
                                </section>
                                {/* One row: Back, the step's tools, Next (.scratch/novel-reading/spec.md). */}
                                <div className="flex items-center gap-1">
                                    {backButton}
                                    <div className="min-w-0 flex-1">
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
                                    </div>
                                    {nextButton}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </section>
    );
}

/**
 * A cut-out on the stage (.scratch/stage-pictures/spec.md): the figure alone, standing on the Backdrop.
 * On a wide stage it is drawn 128% as tall as the stage, its top at the stage's top, so the stage's
 * bottom edge cuts it below the knees. It is never wider than the stage: on a phone, where the stage
 * is tall and narrow, it is drawn as wide as the stage and stands on the stage's foot, behind the
 * box, so it never floats over a short line (2026-11-22). Its size is worked out from the picture's
 * own shape, known once it has loaded (2 by 3 until then).
 */
function StageFigure({ src, alt, ...data }: { src: string; alt: string } & Record<`data-${string}`, string>) {
    const [shape, setShape] = useState(1.5);
    return (
        <div className="absolute inset-0 flex flex-col items-center overflow-hidden" style={{ containerType: 'size' }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- served by the API from the image folder */}
            <img
                // `mt-auto` stands a figure shorter than the stage on its foot; one taller keeps its top at the stage's top.
                className="stage-figure mt-auto block w-auto max-w-none shrink-0 select-none"
                style={{ height: `min(128cqh, ${shape} * 100cqw)` }}
                src={src}
                alt={alt}
                data-stage-picture=""
                draggable={false}
                onLoad={(event) => {
                    const { naturalWidth, naturalHeight } = event.currentTarget;
                    if (naturalWidth > 0 && naturalHeight > 0) setShape(naturalHeight / naturalWidth);
                }}
                ref={(image) => {
                    // A picture already loaded from the cache fires no load event.
                    if (image?.complete && image.naturalWidth > 0) setShape(image.naturalHeight / image.naturalWidth);
                }}
                {...data}
            />
        </div>
    );
}

/** The large picture of a speech step: the whole Expression or Reference image, else a large initial on their colour. */
function SpeakerPicture({ step, cast, sprites }: { step: Extract<NovelStep, { kind: 'speech' }>; cast: Cast; sprites?: ChatStage['outfits'][number]['sprites'] }) {
    const character = useCastCharacter(step.characterId);
    // The outfit the Chat has them in, when the stage is dressed; else their Expressions.
    const { whole, cutout } = outfitPicture(sprites, step.emotion) ?? linePicture(character, step.emotion);
    const colour = characterColour(step.characterId, cast);
    // A speaker who is no Character of the Story (a stranger, a name the model got wrong) has no
    // picture and no colour of their own: the place stays, with nothing standing in front of it.
    // The block with an initial showed as a blank slab behind the box (live, 2026-11-23).
    if (step.characterId === null && !whole) return null;
    if (whole && cutout) {
        return <StageFigure src={stageSrc(whole, true)} alt={step.speakerName} data-stage-cutout="" data-emotion={step.emotion ?? 'neutral'} />;
    }
    // Held to the stage's top, as a cut-out is: on a phone the stage is taller than the picture is
    // wide, and at the bottom the box covered the face (2026-11-22).
    // Positioned (`relative`), as the cut-out's wrapper is, so it paints over the place picture, which is
    // positioned too and comes first; unpositioned, the place covered it once it loaded (2026-11-21).
    const picture = whole ? (
        // eslint-disable-next-line @next/next/no-img-element -- served by the API from the image folder
        <img className="relative block h-full max-w-full object-contain object-top motion-safe:animate-fade-in" src={whole} alt={step.speakerName} data-stage-picture="" draggable={false} />
    ) : (
        <span className="relative grid aspect-2/3 h-[min(100%,15rem)] place-items-center rounded-xl text-[4.5rem] leading-none font-bold text-on-character motion-safe:animate-fade-in" style={{ background: colour }} role="img" aria-label={step.speakerName} data-stage-picture="">
            {initialOf(step.speakerName)}
        </span>
    );
    return picture;
}

/** The user's character with the face of their line, cut out where it can be (.scratch/your-faces/spec.md); nothing without that Expression. */
function YourFacePicture({ step }: { step: Extract<NovelStep, { kind: 'user' }> }) {
    const face = useYourFace(step.personaId ?? null, step.face ?? null);
    if (!face) return null;
    const cut = face.cutoutPath !== null;
    const src = stageSrc(referenceImageUrl(cut ? face.cutoutPath! : face.imagePath), cut);
    return cut ? (
        <StageFigure src={src} alt={step.identityName} data-your-face={face.emotion} />
    ) : (
        // eslint-disable-next-line @next/next/no-img-element -- served by the API from the image folder
        <img className="relative block h-full max-w-full object-contain object-top motion-safe:animate-fade-in" src={src} alt={step.identityName} data-stage-picture="" data-your-face={face.emotion} draggable={false} />
    );
}

/** The box's words: the speaker's name in their colour (the worn name for the user's line, none for narration), then the text. */
function StepText({ step, cast, epilogue = false }: { step: Exclude<NovelStep, { kind: 'snapshot' }>; cast: Cast; epilogue?: boolean }) {
    // A Character's name opens their profile; the picture above steps on, as the rest of the stage does.
    const openProfile = useCharacterProfile(step.kind === 'speech' ? step.characterId : null);
    // The thread marks an Epilogue's reply; so does each of its steps here (docs/ui-audit-2026-11-16.md L6).
    const label = epilogue ? (
        <p className="mt-0 mb-1 text-xs font-bold tracking-widest text-muted uppercase" data-epilogue-label>
            Epilogue
        </p>
    ) : null;
    if (step.kind === 'narration') {
        return (
            <>
                {label}
                <p className={`${STEP_TEXT} italic`} data-line="">
                    {step.text}
                </p>
            </>
        );
    }
    const colour = step.kind === 'user' ? 'var(--accent)' : characterColour(step.characterId, cast);
    const name = step.kind === 'user' ? step.identityName : step.speakerName;
    return (
        <>
            {label}
            <p className="mt-0 mb-1 text-md font-bold" style={{ color: colour }} data-speaker="">
                {openProfile ? (
                    // A 44px hit area round the name: a near miss fell on the stage and moved the story on (docs/ui-audit-2026-11-21.md, H4).
                    <button type="button" className="bare-button hit-area cursor-pointer font-bold underline decoration-dotted underline-offset-4 focus-ring" aria-label={`Profile of ${name}`} onClick={openProfile}>
                        {name}
                    </button>
                ) : (
                    name
                )}
            </p>
            <p className={STEP_TEXT} data-line="">
                {withActions(step.text)}
            </p>
            {step.kind === 'user' && step.roll && <RollLine roll={step.roll} />}
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
    // The row fades at an end that hides more tools: cut off with no sign, Read aloud and Edit were lost (docs/ui-audit-2026-11-21.md, M1).
    const toolRow = useRef<HTMLDivElement>(null);
    const toolFade = useScrollFade(toolRow);
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
                    className={BOX_TOOL}
                    aria-label="Read aloud"
                    title="Read aloud"
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
                    <PlayIcon size={18} />
                </button>
            );
    }
    if (!withRow || !newestAi || newestAi.kind !== 'ai') {
        return read ? <div className="flex flex-wrap items-center gap-2">{read}</div> : null;
    }
    const versions = isLast ? newestAi.versions : null;
    const again = isLast && !isOpening(newestAi) && !blocked;
    return (
        // One row that scrolls sideways (.scratch/novel-reading/spec.md): wrapped, the newest reply's tools took three rows of the box.
        <div
            ref={toolRow}
            className={`flex min-w-0 flex-nowrap items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&>*]:shrink-0 [&::-webkit-scrollbar]:hidden ${SCROLL_FADES[toolFade]}`}
            role="group"
            aria-label="Message actions"
        >
            {versions && <VersionSwitch versions={versions} onVersion={(version) => onVersion(newestAi.id, version)} />}
            {again && (
                <button type="button" className={BOX_TOOL} aria-label="Again" title="Again" onClick={() => onAgain(newestAi.id)}>
                    <UndoIcon size={18} />
                </button>
            )}
            <button type="button" className={BOX_TOOL} aria-label="Snapshot" title="Snapshot" onClick={onSnapshot}>
                <CameraIcon size={18} />
            </button>
            {read}
            <button type="button" className={BOX_TOOL} aria-label="Edit in thread" title="Edit in thread" onClick={() => onEditInThread(newestAi.id)}>
                <ThreadIcon size={18} />
            </button>
        </div>
    );
}

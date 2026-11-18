'use client';

import { ComponentType, useState } from 'react';

import { COLUMN, SHORTEST_HIDDEN } from '@/components/chat/chat-classes';
import {
    AfternoonIcon,
    ChevronRightIcon,
    ChaptersIcon,
    CloseIcon,
    DawnIcon,
    EveningIcon,
    IconProps,
    MorningIcon,
    NightIcon,
    NoonIcon,
    OutfitIcon,
    PinIcon,
    PlaceIcon,
    TargetIcon,
    WeatherIcon,
} from '@/components/icons';
import { bondGateInWords } from '@/lib/bonds';
import { Chat, TimeOfDay } from '@/lib/chat';
import { Scene } from '@/lib/story';

interface SceneStripProps {
    /** The Chat's current Scene; null in free play. */
    current: Chat['currentScene'];
    /** The Chat's Time of day; null while the story has not made one clear. */
    timeOfDay: TimeOfDay | null;
    /** Where the story is now (CONTEXT.md, "Place"); null until the story makes it clear. */
    place?: string | null;
    /** The weather in the story now; null until the story shows it. */
    weather?: string | null;
    /** What the Characters are wearing now (CONTEXT.md, "Outfit"), for those the story has shown. */
    outfits?: Chat['outfits'];
    /** The Story's Scenes, which hold each one's goal; empty while the Story can't be read. */
    scenes: Scene[];
    /** The Story's Characters, to name a Scene's Bond gates; empty while the Story can't be read. */
    characters?: readonly { id: number; name: string }[];
    /** How many Established facts the Chat holds (.scratch/facts-panel/spec.md). */
    factCount?: number;
    /** Opens the Facts panel; without it, the strip has no Facts row. */
    onOpenFacts?(): void;
    /** Opens the Chapters, with Move on (.scratch/scene-chapters/spec.md); left out where the Story has no Scenes. */
    onOpenChapters?(): void;
    onHide(): void;
}

const TIME_OF_DAY: Record<TimeOfDay, { Icon: ComponentType<IconProps>; label: string }> = {
    dawn: { Icon: DawnIcon, label: 'Dawn' },
    morning: { Icon: MorningIcon, label: 'Morning' },
    noon: { Icon: NoonIcon, label: 'Noon' },
    afternoon: { Icon: AfternoonIcon, label: 'Afternoon' },
    evening: { Icon: EveningIcon, label: 'Evening' },
    night: { Icon: NightIcon, label: 'Night' },
};

/** A small icon before a word in the strip, on its first line. */
const STRIP_ICON = 'mr-1 inline-block shrink-0 align-[-0.2em]';

/**
 * A thin strip under the top bar (spec: "Scene strip"): the current Scene's name, the Time of day
 * once there is one (spec: "Story clock"), the Place once the story has one (.scratch/info-box/spec.md),
 * and the Scene's goal (its situation), or "Free play", then what its Bond gates wait for. Opened,
 * it also shows the Weather and what each Character is wearing.
 * The Chat re-reads until each turn's background calls settle, so a Scene or time the judge moved
 * on to shows then. A tap opens it to read the goal whole and closes it again; its own ✕ hides it,
 * and ⋯ brings it back (audit M30: a tap used to hide it, with the goal cut off and no way to read it).
 * Opened, its last row opens the Chat's Established facts (.scratch/facts-panel/spec.md).
 */
export function SceneStrip({
    current,
    timeOfDay,
    place = null,
    weather = null,
    outfits = [],
    scenes,
    characters = [],
    factCount = 0,
    onOpenFacts,
    onOpenChapters,
    onHide,
}: SceneStripProps) {
    const [open, setOpen] = useState(false);
    const scene = current ? scenes.find((candidate) => candidate.id === current.id) : undefined;
    const goal = scene?.situation ?? '';
    // Its Bond gates in plain words (.scratch/bond-axes/spec.md): what the Scene waits for, toward "you".
    const nameOf = (characterId: number | null) =>
        characterId === null ? 'you' : (characters.find((character) => character.id === characterId)?.name ?? 'someone');
    const waiting = (scene?.gates ?? []).map((gate) => bondGateInWords(nameOf(gate.fromCharacterId), nameOf(gate.toCharacterId), gate.axis, gate.atLeast));
    const time = timeOfDay ? TIME_OF_DAY[timeOfDay] : null;
    // Only the Characters the Story still has, under their names.
    const wearing = outfits.flatMap((entry) => {
        const name = characters.find((character) => character.id === entry.characterId)?.name;
        return name ? [{ ...entry, name }] : [];
    });
    return (
        // Half-way into the page's side padding, like the top bar.
        <div className={`-mx-2 flex shrink-0 flex-wrap items-start border-b border-line bg-surface ${COLUMN} ${SHORTEST_HIDDEN}`}>
            <button
                type="button"
                className="bare-button flex min-h-11 min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-1 px-2 py-1.5 text-left text-sm text-muted cursor-pointer focus-ring-inset"
                aria-expanded={open}
                onClick={() => setOpen((was) => !was)}
            >
                {/*
                  * Closed, beside a Place: the name, the Time and the Place are one line of their own, and where they
                  * don't all fit the name and the Place give way together, each by its own length. The Place used to get
                  * only what the name left it, 86px of its 169 (docs/ui-audit-2026-11-16.md L9), though it is what changes
                  * as the story moves. Otherwise this wrapper is not there for layout at all.
                  */}
                <span className={!open && place ? 'flex min-w-0 flex-[1_0_100%] items-center gap-x-2.5' : 'contents'} data-strip-line>
                <span className={`font-semibold text-text ${open ? 'shrink-0' : place ? 'min-w-0 shrink truncate' : 'shrink-0 max-w-[50%] truncate'}`}>
                    <span className="sr-only">Scene: </span>
                    <PinIcon size={14} className={STRIP_ICON} />
                    {current ? current.name : 'Free play'}
                </span>
                {time && (
                    // Short, so it never gives way to the goal.
                    <span className="shrink-0 text-text">
                        <span className="sr-only">Time: </span>
                        <time.Icon size={14} className={STRIP_ICON} />
                        {time.label}
                    </span>
                )}
                {place && (
                    // Where the story is: one line while closed, whole once opened.
                    <span className={`min-w-0 text-text [overflow-wrap:anywhere] ${open ? '' : 'shrink truncate'}`}>
                        <span className="sr-only">Place: </span>
                        <PlaceIcon size={14} className={STRIP_ICON} />
                        {place}
                    </span>
                )}
                </span>
                {open && weather && (
                    <span className="min-w-0 text-text [overflow-wrap:anywhere]">
                        <span className="sr-only">Weather: </span>
                        <WeatherIcon size={14} className={STRIP_ICON} />
                        {weather}
                    </span>
                )}
                {goal !== '' && (
                    // Two lines at most while closed; whole once opened. Beside a Place it takes a row of its own, one line while closed,
                    // so the two never squeeze each other into a sliver.
                    <span className={`min-w-0 [overflow-wrap:anywhere] ${place ? 'flex-[1_0_100%]' : 'flex-1'} ${open ? '' : place ? 'line-clamp-1' : 'line-clamp-2'}`}>
                        <span className="sr-only">Goal: </span>
                        <TargetIcon size={14} className={STRIP_ICON} />
                        {goal}
                    </span>
                )}
                {/* What the Scene's Bond gates wait for (.scratch/bond-axes/spec.md): a line of its own, wrapping, never cut off. */}
                {waiting.length > 0 && <span className="min-w-0 flex-[1_0_100%] [overflow-wrap:anywhere]">Waiting for: {waiting.join('; ')}</span>}
                {/* What each Character is wearing now (.scratch/info-box/spec.md), once opened: a line each. */}
                {open &&
                    wearing.map((entry) => (
                        <span key={entry.characterId} className="min-w-0 flex-[1_0_100%] [overflow-wrap:anywhere]" data-outfit>
                            <OutfitIcon size={14} className={STRIP_ICON} />
                            <span className="font-semibold text-text">{entry.name}</span> <span className="sr-only">is wearing </span>
                            {entry.outfit}
                        </span>
                    ))}
            </button>
            {onOpenChapters && (
                <button
                    type="button"
                    className="bare-button grid size-11 shrink-0 cursor-pointer place-items-center text-muted press focus-ring-inset"
                    aria-label="Chapters"
                    title="Chapters, and Move on"
                    aria-haspopup="dialog"
                    onClick={onOpenChapters}
                >
                    <ChaptersIcon size={20} />
                </button>
            )}
            <button
                type="button"
                className="bare-button grid size-11 shrink-0 cursor-pointer place-items-center text-muted press focus-ring-inset"
                aria-label="Hide Scene strip"
                title="Hide the Scene strip (the Chat menu brings it back)"
                onClick={onHide}
            >
                <CloseIcon size={18} />
            </button>
            {/* Opened, a row of its own under the rest: the Chat's Established facts, in a sheet (.scratch/facts-panel/spec.md). */}
            {open && onOpenFacts && (
                <button
                    type="button"
                    className="bare-button flex min-h-11 basis-full items-center justify-between gap-2 border-t border-line px-2 text-left text-sm text-muted cursor-pointer focus-ring-inset"
                    aria-haspopup="dialog"
                    onClick={onOpenFacts}
                    data-open-facts
                >
                    <span>
                        <span className="font-semibold text-text">Established facts</span> · {factCount === 0 ? 'none yet' : factCount}
                    </span>
                    <ChevronRightIcon size={16} className="shrink-0" />
                </button>
            )}
        </div>
    );
}

'use client';

import { ComponentType, useState } from 'react';

import { COLUMN } from '@/components/chat/chat-classes';
import {
    AfternoonIcon,
    CloseIcon,
    DawnIcon,
    EveningIcon,
    IconProps,
    MorningIcon,
    NightIcon,
    NoonIcon,
    PinIcon,
    TargetIcon,
} from '@/components/icons';
import { bondGateInWords } from '@/lib/bonds';
import { Chat, TimeOfDay } from '@/lib/chat';
import { Scene } from '@/lib/story';

interface SceneStripProps {
    /** The Chat's current Scene; null in free play. */
    current: Chat['currentScene'];
    /** The Chat's Time of day; null while the story has not made one clear. */
    timeOfDay: TimeOfDay | null;
    /** The Story's Scenes, which hold each one's goal; empty while the Story can't be read. */
    scenes: Scene[];
    /** The Story's Characters, to name a Scene's Bond gates; empty while the Story can't be read. */
    characters?: readonly { id: number; name: string }[];
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
 * once there is one (spec: "Story clock"), and the Scene's goal (its situation), or "Free play",
 * then what its Bond gates wait for.
 * The Chat re-reads until each turn's background calls settle, so a Scene or time the judge moved
 * on to shows then. A tap opens it to read the goal whole and closes it again; its own ✕ hides it,
 * and ⋯ brings it back (audit M30: a tap used to hide it, with the goal cut off and no way to read it).
 */
export function SceneStrip({ current, timeOfDay, scenes, characters = [], onHide }: SceneStripProps) {
    const [open, setOpen] = useState(false);
    const scene = current ? scenes.find((candidate) => candidate.id === current.id) : undefined;
    const goal = scene?.situation ?? '';
    // Its Bond gates in plain words (.scratch/bond-axes/spec.md): what the Scene waits for, toward "you".
    const nameOf = (characterId: number | null) =>
        characterId === null ? 'you' : (characters.find((character) => character.id === characterId)?.name ?? 'someone');
    const waiting = (scene?.gates ?? []).map((gate) => bondGateInWords(nameOf(gate.fromCharacterId), nameOf(gate.toCharacterId), gate.axis, gate.atLeast));
    const time = timeOfDay ? TIME_OF_DAY[timeOfDay] : null;
    return (
        // Half-way into the page's side padding, like the top bar.
        <div className={`-mx-2 flex shrink-0 items-start border-b border-line bg-surface ${COLUMN}`}>
            <button
                type="button"
                className="bare-button flex min-h-11 min-w-0 flex-1 flex-wrap items-center gap-x-3.5 gap-y-1 px-2 py-1.5 text-left text-sm text-muted cursor-pointer focus-ring-inset"
                aria-expanded={open}
                onClick={() => setOpen((was) => !was)}
            >
                <span className={`shrink-0 font-semibold text-text ${open ? '' : 'max-w-[50%] truncate'}`}>
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
                {goal !== '' && (
                    // Two lines at most while closed; whole once opened.
                    <span className={`min-w-0 flex-1 [overflow-wrap:anywhere] ${open ? '' : 'line-clamp-2'}`}>
                        <span className="sr-only">Goal: </span>
                        <TargetIcon size={14} className={STRIP_ICON} />
                        {goal}
                    </span>
                )}
                {/* What the Scene's Bond gates wait for (.scratch/bond-axes/spec.md): a line of its own, wrapping, never cut off. */}
                {waiting.length > 0 && <span className="min-w-0 flex-[1_0_100%] [overflow-wrap:anywhere]">Waiting for: {waiting.join('; ')}</span>}
            </button>
            <button
                type="button"
                className="bare-button grid size-11 shrink-0 cursor-pointer place-items-center text-muted press focus-ring-inset"
                aria-label="Hide Scene strip"
                title="Hide the Scene strip (the Chat menu brings it back)"
                onClick={onHide}
            >
                <CloseIcon size={18} />
            </button>
        </div>
    );
}

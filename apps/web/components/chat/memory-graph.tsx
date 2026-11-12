'use client';

import { CSSProperties, KeyboardEvent, MouseEvent, RefObject, useEffect, useId, useMemo, useRef, useState } from 'react';

import { initialOf } from '@/components/portrait/character-portrait';
import { DEFAULT_PORTRAIT_CROP } from '@/components/portrait/portrait-image';
import { characterColour, Portrait, Portraits } from '@/lib/character-colour';
import { BOND_AXES, BOND_AXIS_DASHES, BOND_AXIS_NAMES, BondAxis, BondLevels, bondLine, bondLineDash, UNMEASURED_DASH } from '@/lib/bonds';
import { Memory, MemoryList, renderUser } from '@/lib/memory';
import {
    bondCurvePath,
    HIT_RADIUS_PX,
    HitTarget,
    layoutMemoryGraph,
    MEMORY_RADIUS,
    memoryAbout,
    nearestTarget,
    Person,
    PERSON_RADIUS,
} from '@/lib/memory-graph';

/** What is picked in the graph: a person, whose Memories show under it, one Memory, or one Bond's line. */
export type GraphSelection =
    | { kind: 'person'; person: Person }
    | { kind: 'memory'; id: number }
    | { kind: 'bond'; from: Person; to: Person }
    | null;

/** A current Bond drawn between two people (.scratch/bond-axes/spec.md, "The Memory graph"). */
export interface GraphBond {
    from: Person;
    to: Person;
    label: string;
    /** null while it has no levels yet. */
    levels: BondLevels | null;
}

/** How a Memory dot reads against what is picked. */
type DotState = 'idle' | 'selected' | 'about' | 'other' | 'unknown';

/** The Memories about a person, oldest first. */
export function memoriesAbout(memories: readonly Memory[], list: MemoryList, person: Person): Memory[] {
    return memories.filter((memory) => memoryAbout(memory, list).includes(person));
}

export function personName(list: MemoryList, person: Person): string {
    if (person === 'user') return list.identityName;
    return list.cast.find((character) => character.id === person)?.name ?? 'a removed Character';
}

/** "Nara toward Ash (you)": a Bond's direction in words. */
export function bondDirection(list: MemoryList, bond: Pick<GraphBond, 'from' | 'to'>): string {
    const named = (person: Person) => (person === 'user' ? `${list.identityName} (you)` : personName(list, person));
    return `${named(bond.from)} toward ${named(bond.to)}`;
}

/** A dot's name says this much of its Memory, so a screen reader doesn't read a whole paragraph per dot (audit M52). */
const DOT_LABEL_CHARS = 60;

function shortened(text: string): string {
    return text.length <= DOT_LABEL_CHARS ? text : `${text.slice(0, DOT_LABEL_CHARS).trimEnd()}…`;
}

interface MemoryGraphProps {
    list: MemoryList;
    /** The active Memories; archived ones stay in the list view. */
    memories: readonly Memory[];
    selected: GraphSelection;
    onSelect(selection: GraphSelection): void;
    /** The Characters' Portraits; one without shows their initial. */
    portraits?: Portraits;
    /** The Bonds to draw between the people, when "Show Bonds" is on; none draws none. */
    bonds?: readonly GraphBond[];
}

/**
 * A Character's Portrait inside their node's ring: the chosen square of the Reference image, as
 * PortraitImage places it, clipped to a circle just inside the ring.
 */
function PortraitInNode({ portrait, clipId }: { portrait: Portrait; clipId: string }) {
    const crop = portrait.crop ?? DEFAULT_PORTRAIT_CROP;
    const radius = PERSON_RADIUS - 1;
    const frame = radius * 2;
    // The crop is in fractions of the image's width, so the image is frame / size wide. Its height
    // is unknown here: a box four widths tall with "meet" keeps it exactly that wide, from the top.
    const width = frame / crop.size;
    return (
        <g className="memory-graph-portrait">
            <clipPath id={clipId}>
                <circle r={radius} />
            </clipPath>
            <image
                href={portrait.src}
                x={-radius - (crop.x / crop.size) * frame}
                y={-radius - (crop.y / crop.size) * frame}
                width={width}
                height={width * 4}
                preserveAspectRatio="xMinYMin meet"
                clipPath={`url(#${clipId})`}
            />
        </g>
    );
}

/** The focus ring of a round node (audit H20): its own two-colour ring, clear of the node and never faded with it. */
function FocusRing({ radius }: { radius: number }) {
    return (
        <g className="memory-graph-focus">
            <circle r={radius + 4} className="memory-graph-focus-under" />
            <circle r={radius + 4} className="memory-graph-focus-ring" />
        </g>
    );
}

/** The key of each node: in Tab order, people, then Bonds, then Memories (audit M52). */
const personKey = (person: Person) => `p:${person}`;
const bondKey = (bond: Pick<GraphBond, 'from' | 'to'>) => `b:${bond.from}>${bond.to}`;
const memoryKey = (id: number) => `m:${id}`;

/** How wide the graph is drawn against its own units, kept up to date as the drawer resizes. */
function useRenderedScale(svg: RefObject<SVGSVGElement | null>, width: number): number {
    const [scale, setScale] = useState(1);
    useEffect(() => {
        const node = svg.current;
        if (!node) return;
        const measure = () => {
            const rendered = node.getBoundingClientRect().width;
            if (rendered > 0) setScale(rendered / width);
        };
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(node);
        return () => observer.disconnect();
    }, [svg, width]);
    return scale;
}

/** The legend of the Bond lines (audit M51): each strongest feeling's colour and pattern, and the grey ones. */
function BondLegend() {
    const sample = (stroke: string, dash: string | undefined, key: string, label: string) => (
        <li key={key} className="flex items-center gap-1.5">
            <svg width="28" height="8" viewBox="0 0 28 8" aria-hidden="true" className="flex-none">
                <line x1="2" y1="4" x2="26" y2="4" className={stroke} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={dash} />
            </svg>
            {label}
        </li>
    );
    const STROKES: Record<BondAxis, string> = {
        trust: 'stroke-bond-trust',
        affection: 'stroke-bond-affection',
        desire: 'stroke-bond-desire',
        tension: 'stroke-bond-tension',
    };
    return (
        <div className="mb-3">
            <p className="mt-0 mb-1 text-xs text-muted">Each Bond&apos;s line shows its strongest feeling:</p>
            <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-xs text-text" aria-label="Bond lines">
                {BOND_AXES.map((axis) => sample(STROKES[axis], BOND_AXIS_DASHES[axis], axis, BOND_AXIS_NAMES[axis]))}
                {sample('stroke-bond-neutral', undefined, 'none', 'None stands out')}
                {sample('stroke-bond-neutral', UNMEASURED_DASH, 'unmeasured', 'Not measured yet')}
            </ul>
        </div>
    );
}

const GRAPH = [
    'my-2 mb-3 block h-auto w-full rounded-md border border-line bg-surface',
    'cursor-pointer touch-manipulation select-none [-webkit-tap-highlight-color:transparent]',
].join(' ');

/**
 * The Memory graph (CONTEXT.md: "Memory graph"): the worn identity in the middle, the Characters round
 * it in their colours, and each Memory a dot linked to the people it is about. A person is
 * picked to light up the Memories about them and fade the ones a Character does not know; a dot
 * is picked to open that Memory under the graph. A tap on empty space clears the pick.
 *
 * A tap picks the nearest node within 22px of the finger (audit H19), so a 14px dot takes a 44px
 * tap and of two close dots the nearer wins. The graph is one Tab stop: arrow keys move between
 * the people, then the Bonds, then the Memories (audit M52).
 */
export function MemoryGraph({ list, memories, selected, onSelect, portraits = {}, bonds = [] }: MemoryGraphProps) {
    const clipPrefix = `memory-graph-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
    const hintId = useId();
    const svg = useRef<SVGSVGElement>(null);
    const castIds = list.cast.map((character) => character.id);
    const people: Person[] = ['user', ...castIds];
    const about = new Map(memories.map((memory) => [memory.id, memoryAbout(memory, list)]));

    // Laid out again only when a person or a link changes, so typing in a Memory moves nothing.
    const shape = JSON.stringify([people, memories.map((memory) => [memory.id, about.get(memory.id)])]);
    const layout = useMemo(
        () => {
            const [shapePeople, shapeMemories] = JSON.parse(shape) as [Person[], [number, Person[]][]];
            return layoutMemoryGraph(
                shapePeople,
                shapeMemories.map(([id, linked]) => ({ id, about: linked })),
            );
        },
        [shape],
    );
    const scale = useRenderedScale(svg, layout.width);

    const colourOf = (person: Person) => (person === 'user' ? 'var(--accent)' : characterColour(person, castIds));
    const counts = new Map(people.map((person) => [person, 0]));
    for (const linked of about.values()) for (const person of linked) counts.set(person, (counts.get(person) ?? 0) + 1);

    const selectedMemory = selected?.kind === 'memory' ? memories.find((memory) => memory.id === selected.id) : undefined;
    const dotState = (memory: Memory): DotState => {
        if (!selected || selected.kind === 'bond') return 'idle';
        if (selected.kind === 'memory') return memory.id === selected.id ? 'selected' : 'other';
        if (about.get(memory.id)?.includes(selected.person)) return 'about';
        if (selected.person !== 'user' && !memory.knownBy.includes(selected.person)) return 'unknown';
        return 'other';
    };
    const personLit = (person: Person) =>
        !selected ||
        (selected.kind === 'bond' && (selected.from === person || selected.to === person)) ||
        (selected.kind === 'person' ? selected.person === person : !!selectedMemory && about.get(selectedMemory.id)!.includes(person));

    // What each node does when pressed, and where a tap reaches it, by its key.
    const presses = new Map<string, () => void>();
    const targets: HitTarget<string>[] = [];
    const order: string[] = [];

    const drawnBonds = bonds.flatMap((bond) => {
        const from = layout.people.get(bond.from);
        const to = layout.people.get(bond.to);
        if (!from || !to) return [];
        const pressed = selected?.kind === 'bond' && selected.from === bond.from && selected.to === bond.to;
        return [{ bond, from, to, pressed, key: bondKey(bond) }];
    });
    const drawnMemories = memories.flatMap((memory) => {
        const at = layout.memories.get(memory.id);
        return at ? [{ memory, at, key: memoryKey(memory.id), state: dotState(memory) }] : [];
    });
    const drawnPeople = people.flatMap((person) => {
        const at = layout.people.get(person);
        if (!at) return [];
        const pressed = selected?.kind === 'person' && selected.person === person;
        return [{ person, at, pressed, key: personKey(person) }];
    });

    for (const { memory, at, key, state } of drawnMemories) {
        presses.set(key, () => onSelect(state === 'selected' ? null : { kind: 'memory', id: memory.id }));
        targets.push({ key, kind: 'circle', at, radius: MEMORY_RADIUS });
    }
    for (const { person, at, pressed, key } of drawnPeople) {
        presses.set(key, () => onSelect(pressed ? null : { kind: 'person', person }));
        targets.push({ key, kind: 'circle', at, radius: PERSON_RADIUS });
        order.push(key);
    }
    for (const { bond, from, to, pressed, key } of drawnBonds) {
        presses.set(key, () => onSelect(pressed ? null : { kind: 'bond', from: bond.from, to: bond.to }));
        targets.push({ key, kind: 'curve', from, to });
        order.push(key);
    }
    for (const { key } of drawnMemories) order.push(key);

    // Roving tabindex: one node takes Tab, the first person until another is focused.
    const [active, setActive] = useState<string | null>(null);
    const current = active && order.includes(active) ? active : order[0];

    const focusNode = (key: string) => {
        setActive(key);
        svg.current?.querySelector<SVGElement>(`[data-node="${CSS.escape(key)}"]`)?.focus();
    };

    const onKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
        const node = (event.target as Element).closest<SVGElement>('[data-node]');
        if (!node) return;
        const key = node.dataset.node!;
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            presses.get(key)?.();
            return;
        }
        const at = order.indexOf(key);
        const next =
            event.key === 'ArrowRight' || event.key === 'ArrowDown'
                ? order[(at + 1) % order.length]
                : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
                  ? order[(at - 1 + order.length) % order.length]
                  : event.key === 'Home'
                    ? order[0]
                    : event.key === 'End'
                      ? order[order.length - 1]
                      : null;
        if (!next) return;
        event.preventDefault();
        focusNode(next);
    };

    /** A tap or click picks the nearest node within reach, or clears the pick on empty space. */
    const onClick = (event: MouseEvent<SVGSVGElement>) => {
        const node = (event.target as Element).closest<SVGElement>('[data-node]');
        // A click with no pointer (a screen reader's, or a key's) presses the node it was sent to.
        if (event.detail === 0) {
            if (node) presses.get(node.dataset.node!)?.();
            return;
        }
        const matrix = svg.current?.getScreenCTM();
        if (!matrix) return;
        const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
        const key = nearestTarget(targets, point, HIT_RADIUS_PX / scale);
        if (key) {
            setActive(key);
            presses.get(key)?.();
        } else onSelect(null);
    };

    const nodeProps = (key: string, pressed: boolean, label: string) => ({
        'data-node': key,
        role: 'button',
        tabIndex: key === current ? 0 : -1,
        'aria-pressed': pressed,
        'aria-label': label,
        onFocus: () => setActive(key),
    });

    // Text in the graph is sized against the drawn scale, so a name reads 13px on any screen (audit M53).
    const style = { '--graph-unit': String(1 / scale) } as CSSProperties;

    return (
        <>
            <svg
                ref={svg}
                className={GRAPH}
                style={style}
                viewBox={`0 0 ${layout.width} ${layout.height}`}
                role="group"
                aria-label="Memory graph"
                aria-describedby={hintId}
                onClick={onClick}
                onKeyDown={onKeyDown}
            >
                <desc id={hintId}>Arrow keys move between the people, the Bonds and the Memories; Enter picks one.</desc>
                <g aria-hidden="true">
                    {drawnMemories.flatMap(({ memory, at: from, state }) =>
                        (about.get(memory.id) ?? []).map((person) => {
                            const to = layout.people.get(person);
                            if (!to) return null;
                            const lit = state === 'selected' || (state === 'about' && selected?.kind === 'person' && selected.person === person);
                            return (
                                <line
                                    key={`${memory.id}-${person}`}
                                    x1={from.x}
                                    y1={from.y}
                                    x2={to.x}
                                    y2={to.y}
                                    stroke={colourOf(person)}
                                    className={lit ? 'memory-graph-link memory-graph-link-lit' : 'memory-graph-link'}
                                    data-dim={selected && !lit ? 'true' : undefined}
                                />
                            );
                        }),
                    )}
                </g>
                {drawnBonds.map(({ bond, from, to, pressed, key }) => {
                    const look = bondLine(bond.levels);
                    const path = bondCurvePath(from, to);
                    return (
                        <g
                            key={key}
                            className="memory-graph-bond"
                            data-axis={look.axis ?? 'none'}
                            {...nodeProps(key, pressed, `${bondDirection(list, bond)}: ${bond.label}`)}
                        >
                            {/* A wide, unseen stroke under the line: where the pointer shows it can be tapped. */}
                            <path d={path} className="memory-graph-bond-hit" />
                            <path d={path} className="memory-graph-bond-focus" />
                            <path d={path} className="memory-graph-bond-line" stroke={look.colour} strokeDasharray={bondLineDash(look)} />
                        </g>
                    );
                })}
                {drawnMemories.map(({ memory, at, key, state }) => {
                    const names = (about.get(memory.id) ?? []).map((person) => personName(list, person));
                    const text = shortened(renderUser(memory.text, list.identityName));
                    return (
                        <g
                            key={key}
                            className="memory-graph-dot"
                            data-state={state}
                            data-memory-id={memory.id}
                            transform={`translate(${at.x} ${at.y})`}
                            // Its words and who it is about; never the internal id (audit M52, L36).
                            {...nodeProps(key, state === 'selected', `${text}${names.length ? ` About ${names.join(', ')}.` : ''}`)}
                        >
                            <circle r={MEMORY_RADIUS + 6} className="memory-graph-hit" />
                            <circle r={MEMORY_RADIUS} className={memory.writtenBy === 'user' ? 'memory-graph-dot-own' : undefined} />
                            <FocusRing radius={MEMORY_RADIUS} />
                        </g>
                    );
                })}
                {drawnPeople.map(({ person, at, pressed, key }) => {
                    const name = personName(list, person);
                    const count = counts.get(person) ?? 0;
                    const shown = person === 'user' ? `${name} (you)` : name;
                    return (
                        <g
                            key={key}
                            className="memory-graph-person"
                            data-lit={personLit(person) ? 'true' : 'false'}
                            transform={`translate(${at.x} ${at.y})`}
                            {...nodeProps(key, pressed, `${shown}, ${count} ${count === 1 ? 'Memory' : 'Memories'}`)}
                        >
                            <circle r={PERSON_RADIUS} stroke={colourOf(person)} fill="var(--surface-raised)" className="memory-graph-person-ring" />
                            {person !== 'user' && portraits[person] ? (
                                <PortraitInNode portrait={portraits[person]} clipId={`${clipPrefix}-${person}`} />
                            ) : (
                                <text className="memory-graph-initial" fill={colourOf(person)} dy="0.35em">
                                    {initialOf(name)}
                                </text>
                            )}
                            <text className="memory-graph-name" y={PERSON_RADIUS + 2} dy="0.95em">
                                {shown}
                            </text>
                            <FocusRing radius={PERSON_RADIUS} />
                        </g>
                    );
                })}
            </svg>
            {drawnBonds.length > 0 && <BondLegend />}
        </>
    );
}

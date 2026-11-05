'use client';

import { KeyboardEvent, MouseEvent, useMemo } from 'react';

import { characterColour } from '@/lib/character-colour';
import { Memory, MemoryList, renderUser } from '@/lib/memory';
import { layoutMemoryGraph, MEMORY_RADIUS, memoryAbout, Person, PERSON_RADIUS } from '@/lib/memory-graph';

/** What is picked in the graph: a person, whose Memories show under it, or one Memory. */
export type GraphSelection = { kind: 'person'; person: Person } | { kind: 'memory'; id: number } | null;

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

interface MemoryGraphProps {
    list: MemoryList;
    /** The active Memories; archived ones stay in the list view. */
    memories: readonly Memory[];
    selected: GraphSelection;
    onSelect(selection: GraphSelection): void;
}

/** Enter and Space press a node, as on a button. */
function pressOnKey(event: KeyboardEvent, press: () => void) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    press();
}

/**
 * The Memory graph (CONTEXT.md: "Memory graph"): the worn identity in the middle, the Characters round
 * it in their colours, and each Memory a dot linked to the people it is about. A person is
 * picked to light up the Memories about them and fade the ones a Character does not know; a dot
 * is picked to open that Memory under the graph. A tap on empty space clears the pick.
 */
export function MemoryGraph({ list, memories, selected, onSelect }: MemoryGraphProps) {
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

    const colourOf = (person: Person) => (person === 'user' ? 'var(--accent)' : characterColour(person, castIds));
    const counts = new Map(people.map((person) => [person, 0]));
    for (const linked of about.values()) for (const person of linked) counts.set(person, (counts.get(person) ?? 0) + 1);

    const selectedMemory = selected?.kind === 'memory' ? memories.find((memory) => memory.id === selected.id) : undefined;
    const dotState = (memory: Memory): DotState => {
        if (!selected) return 'idle';
        if (selected.kind === 'memory') return memory.id === selected.id ? 'selected' : 'other';
        if (about.get(memory.id)?.includes(selected.person)) return 'about';
        if (selected.person !== 'user' && !memory.knownBy.includes(selected.person)) return 'unknown';
        return 'other';
    };
    const personLit = (person: Person) =>
        !selected ||
        (selected.kind === 'person' ? selected.person === person : !!selectedMemory && about.get(selectedMemory.id)!.includes(person));

    /** A tap on a node presses it, without reaching the picture's own tap, which clears the pick. */
    const tap = (press: () => void) => (event: MouseEvent) => {
        event.stopPropagation();
        press();
    };

    return (
        <svg
            className="memory-graph"
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            role="group"
            aria-label="Memory graph"
            onClick={() => onSelect(null)}
        >
            <g aria-hidden="true">
                {memories.flatMap((memory) => {
                    const from = layout.memories.get(memory.id);
                    const state = dotState(memory);
                    return (about.get(memory.id) ?? []).map((person) => {
                        const to = layout.people.get(person);
                        if (!from || !to) return null;
                        const lit =
                            state === 'selected' ||
                            (state === 'about' && selected?.kind === 'person' && selected.person === person);
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
                    });
                })}
            </g>
            {memories.map((memory) => {
                const at = layout.memories.get(memory.id);
                if (!at) return null;
                const state = dotState(memory);
                const names = (about.get(memory.id) ?? []).map((person) => personName(list, person));
                const pressed = state === 'selected';
                const press = () => onSelect(pressed ? null : { kind: 'memory', id: memory.id });
                return (
                    <g
                        key={memory.id}
                        className="memory-graph-dot"
                        data-state={state}
                        role="button"
                        tabIndex={0}
                        aria-pressed={pressed}
                        aria-label={`Memory ${memory.id}: ${renderUser(memory.text, list.identityName)}${
                            names.length ? ` About ${names.join(', ')}.` : ''
                        }`}
                        transform={`translate(${at.x} ${at.y})`}
                        onClick={tap(press)}
                        onKeyDown={(event) => pressOnKey(event, press)}
                    >
                        {/* A larger, unseen circle makes the dot easy to hit with a finger. */}
                        <circle r={MEMORY_RADIUS + 6} className="memory-graph-hit" />
                        <circle r={MEMORY_RADIUS} className={memory.writtenBy === 'user' ? 'memory-graph-dot-own' : undefined} />
                    </g>
                );
            })}
            {people.map((person) => {
                const at = layout.people.get(person);
                if (!at) return null;
                const name = personName(list, person);
                const pressed = selected?.kind === 'person' && selected.person === person;
                const press = () => onSelect(pressed ? null : { kind: 'person', person });
                const count = counts.get(person) ?? 0;
                return (
                    <g
                        key={String(person)}
                        className="memory-graph-person"
                        data-lit={personLit(person) ? 'true' : 'false'}
                        role="button"
                        tabIndex={0}
                        aria-pressed={pressed}
                        aria-label={`${person === 'user' ? `${name} (you)` : name}, ${count} ${count === 1 ? 'Memory' : 'Memories'}`}
                        transform={`translate(${at.x} ${at.y})`}
                        onClick={tap(press)}
                        onKeyDown={(event) => pressOnKey(event, press)}
                    >
                        <circle r={PERSON_RADIUS} stroke={colourOf(person)} fill="var(--surface-raised)" className="memory-graph-person-ring" />
                        <text className="memory-graph-initial" fill={colourOf(person)} dy="0.35em">
                            {Array.from(name)[0]?.toUpperCase()}
                        </text>
                        <text className="memory-graph-name" y={PERSON_RADIUS + 13}>
                            {person === 'user' ? `${name} (you)` : name}
                        </text>
                    </g>
                );
            })}
        </svg>
    );
}

import { NewBeliefChange, NewMemoryChange } from '../../../model/ledger/ledger.service.js';
import { Extraction } from './memory-prompt.js';
import { placeholderUser } from './render-user.js';

/**
 * The backend rules for applying an extraction (spec: "Memory extraction", backend rules):
 * locked Memories take no update, delete, merge or archive but do take Known-by additions;
 * names are never removed from Known by; unknown Memory ids and unknown names are dropped;
 * a merge becomes its deletes plus one add under one cause, and is dropped whole when any
 * of its sources is locked. A Character sitting out learns nothing new. Pure logic.
 */

export interface ApplyCastMember {
    id: number;
    name: string;
}

export interface ApplyMemory {
    id: number;
    text: string;
    knownBy: number[];
    locked: boolean;
    archived: boolean;
}

/** A Belief of the Chat as apply reads it; `active` until given up. */
export interface ApplyBelief {
    id: number;
    characterId: number;
    text: string;
    active: boolean;
}

export interface ApplyExtractionInput {
    cast: ApplyCastMember[];
    /** The worn identity's name: the extraction may write it instead of `{user}`. */
    identityName: string;
    /** Every Memory of the Chat, archived ones included. */
    memories: ApplyMemory[];
    /** Every Belief of the Chat, given-up ones included (.scratch/memory-by-meaning/spec.md, "Beliefs"). */
    beliefs?: ApplyBelief[];
    /**
     * The ids of the Characters sitting out (.scratch/speaker-controls/spec.md): added to no new
     * Memory's Known by and to no Known by of an existing one. A merge keeps its sources' Known by.
     */
    sittingOut?: number[];
}

export interface AppliedExtraction {
    changes: NewMemoryChange[];
    /** The Beliefs made and given up, in order. */
    beliefChanges: NewBeliefChange[];
    /** Why each dropped item was dropped, for the log. */
    rejected: string[];
}

const same = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();
/** Two Belief texts say the same when they match ignoring case, spacing and a closing full stop. */
const sameBelief = (a: string, b: string): boolean => {
    const plain = (text: string) => text.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.!]+$/, '');
    return plain(a) === plain(b);
};

export function applyExtraction(input: ApplyExtractionInput, extraction: Extraction): AppliedExtraction {
    const rejected: string[] = [];
    const changes: NewMemoryChange[] = [];
    const beliefChanges: NewBeliefChange[] = [];
    // The Beliefs held as the operations go: those already active, then each one made here.
    const held = (input.beliefs ?? []).filter((belief) => belief.active).map((belief) => ({ id: belief.id as number | null, characterId: belief.characterId, text: belief.text }));
    const memories = new Map(input.memories.map((memory) => [memory.id, memory]));
    const gone = new Set<number>();
    const text = (raw: string): string => placeholderUser(raw, input.identityName);
    const sittingOut = new Set(input.sittingOut ?? []);

    /** Cast ids for the names given; the user is not a Character and is skipped quietly. */
    const resolve = (names: string[], what: string): number[] => {
        const found: number[] = [];
        for (const name of names) {
            if (same(name, 'user') || same(name, '{user}') || same(name, input.identityName)) continue;
            const member = input.cast.find((candidate) => same(candidate.name, name));
            if (!member) rejected.push(`${what}: unknown name "${name}" in known by`);
            else if (sittingOut.has(member.id)) rejected.push(`${what}: ${member.name} is sitting out; left off known by`);
            else if (!found.includes(member.id)) found.push(member.id);
        }
        return found;
    };

    /** The Memory an operation targets, if it may be changed at all; otherwise the reason it may not. */
    const target = (id: number, what: string, mutating: boolean): ApplyMemory | null => {
        const memory = memories.get(id);
        if (!memory || gone.has(id)) {
            rejected.push(`${what} ${id}: unknown Memory`);
            return null;
        }
        if (memory.archived) {
            rejected.push(`${what} ${id}: archived`);
            return null;
        }
        if (mutating && memory.locked) {
            rejected.push(`${what} ${id}: locked`);
            return null;
        }
        return memory;
    };

    for (const operation of extraction.operations) {
        switch (operation.op) {
            case 'add':
                changes.push({ kind: 'add', text: text(operation.text), knownBy: resolve(operation.knownBy, 'add'), event: operation.cause });
                break;
            case 'update': {
                const memory = target(operation.id, 'update', true);
                if (!memory) break;
                const updated = text(operation.text);
                if (updated === memory.text) {
                    rejected.push(`update ${memory.id}: same text`);
                    break;
                }
                changes.push({ kind: 'update', memoryId: memory.id, text: updated, event: operation.cause });
                memories.set(memory.id, { ...memory, text: updated });
                break;
            }
            case 'known_by': {
                const memory = target(operation.id, 'known_by', false);
                if (!memory) break;
                const add = resolve(operation.names, `known_by ${memory.id}`).filter((id) => !memory.knownBy.includes(id));
                if (add.length === 0) {
                    rejected.push(`known_by ${memory.id}: nobody new`);
                    break;
                }
                changes.push({ kind: 'known_by', memoryId: memory.id, add, event: operation.cause });
                memories.set(memory.id, { ...memory, knownBy: [...memory.knownBy, ...add] });
                break;
            }
            case 'merge': {
                // A merge that touches a locked Memory is dropped whole: the merged text would
                // restate what the user wrote, and the locked one must stay as it is.
                const locked = operation.ids.find((id) => memories.get(id)?.locked && !gone.has(id));
                if (locked !== undefined) {
                    rejected.push(`merge: Memory ${locked} is locked`);
                    break;
                }
                const sources = operation.ids.flatMap((id) => {
                    const memory = target(id, 'merge', true);
                    return memory ? [memory] : [];
                });
                if (sources.length === 0) {
                    rejected.push('merge: no Memory left to merge');
                    break;
                }
                const knownBy = [...new Set([...sources.flatMap((memory) => memory.knownBy), ...resolve(operation.knownBy, 'merge')])];
                for (const source of sources) {
                    changes.push({ kind: 'delete', memoryId: source.id, event: operation.cause });
                    gone.add(source.id);
                }
                changes.push({ kind: 'add', text: text(operation.text), knownBy, event: operation.cause });
                break;
            }
            case 'archive': {
                const memory = target(operation.id, 'archive', true);
                if (!memory) break;
                changes.push({ kind: 'archive', memoryId: memory.id, event: operation.cause });
                memories.set(memory.id, { ...memory, archived: true });
                break;
            }
            case 'delete': {
                const memory = target(operation.id, 'delete', true);
                if (!memory) break;
                changes.push({ kind: 'delete', memoryId: memory.id, event: operation.cause });
                gone.add(memory.id);
                break;
            }
            case 'believe': {
                // Spec: "Apply drops a Belief about an unknown or sitting-out Character, a duplicate of an active Belief".
                const member = input.cast.find((candidate) => same(candidate.name, operation.character));
                if (!member) {
                    rejected.push(`believe: unknown Character "${operation.character}"`);
                    break;
                }
                if (sittingOut.has(member.id)) {
                    rejected.push(`believe: ${member.name} is sitting out`);
                    break;
                }
                const believed = text(operation.text);
                if (held.some((belief) => belief.characterId === member.id && sameBelief(belief.text, believed))) {
                    rejected.push(`believe: ${member.name} already believes that`);
                    break;
                }
                let contradicts = operation.contradicts;
                if (contradicts !== null && (!memories.has(contradicts) || gone.has(contradicts))) {
                    rejected.push(`believe: no Memory ${contradicts} to contradict`);
                    contradicts = null;
                }
                beliefChanges.push({ kind: 'add', characterId: member.id, text: believed, contradictsMemoryId: contradicts, event: operation.cause });
                held.push({ id: null, characterId: member.id, text: believed });
                break;
            }
            case 'give_up': {
                // Spec: "... and a give-up of a Belief that isn't active."
                const at = held.findIndex((belief) => belief.id === operation.belief);
                if (at < 0) {
                    rejected.push(`give_up ${operation.belief}: not an active Belief`);
                    break;
                }
                beliefChanges.push({ kind: 'give_up', beliefId: operation.belief, event: operation.because });
                held.splice(at, 1);
                break;
            }
        }
    }
    return { changes, beliefChanges, rejected };
}

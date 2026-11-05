'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import { rewriteKey } from '@/components/story-editor/rewrite';
import { RewriteRequest, Story, storyApi } from '@/lib/story';
import { AppliedChange, assistantApi, AssistantResponse, changedField, PendingChangeSet } from '@/lib/story-assistant';

/** What one applied change is in, as the panel shows it beside its Undo. */
export type UndoState = { kind: 'applied' } | { kind: 'undoing' } | { kind: 'undone' } | { kind: 'error'; message: string };

export interface TrackedChange {
    change: AppliedChange;
    undo: UndoState;
}

/** The conversation, newest last. It lives in this hook only; closing the panel drops it. */
export type AssistantEntry =
    | { id: number; kind: 'instruction'; text: string }
    | { id: number; kind: 'busy'; what: 'thinking' | 'applying' }
    | { id: number; kind: 'error'; message: string; retry: () => void }
    | { id: number; kind: 'answer'; reply: string; changes: TrackedChange[] }
    | { id: number; kind: 'pending'; reply: string; pending: PendingChangeSet; cancelled: boolean };

/** The autosave's `commit`: runs after pending field edits, on the one save chain. */
type Commit = <T>(
    run: () => Promise<T>,
    apply: (value: T) => void,
    onError?: (message: string) => void,
) => Promise<T | undefined>;

interface Options {
    storyId: number;
    commit: Commit;
    /** The API's Story becomes the editor's, as after any structural change. */
    applyWhole(story: Story): void;
    /** An answer's changes have landed and are rendered: the editor shows the first one. */
    onApplied?(changes: AppliedChange[]): void;
}

/** The fields each kind of addition brings, the first one being where a link to it lands. */
const ADDED_FIELDS: Record<Extract<AppliedChange, { kind: 'add' }>['target'], string[]> = {
    character: ['name', 'appearance', 'personality', 'voice', 'background', 'secrets', 'arcDirections'],
    scene: ['name', 'situation', 'moveOnCondition'],
    startingBond: ['label', 'description'],
};

/** The field a change is shown at, as the editor's Rewrite buttons name it; none for a removal. */
export function fieldOf(change: AppliedChange): RewriteRequest | null {
    switch (change.kind) {
        case 'set':
            return changedField(change);
        case 'add':
            return { target: change.target, id: change.id, field: ADDED_FIELDS[change.target][0] };
        case 'remove':
            return null;
    }
}

/** The field keys (as the editor's Rewrite buttons name them) a change lights up. */
function keysOf(change: AppliedChange): string[] {
    switch (change.kind) {
        case 'set':
            return [rewriteKey(changedField(change))];
        case 'add':
            return ADDED_FIELDS[change.target].map((field) => rewriteKey({ target: change.target, id: change.id, field }));
        case 'remove':
            return [];
    }
}

/** The one call that puts a set change's old value back. */
function restore(storyId: number, change: Extract<AppliedChange, { kind: 'set' }>): Promise<Story> {
    const fields = { [change.field]: change.before };
    switch (change.target) {
        case 'story':
            return storyApi.update(storyId, fields);
        case 'role':
            return storyApi.updateRole(storyId, fields);
        case 'character':
            return storyApi.updateCharacter(storyId, change.id!, fields);
        case 'scene':
            return storyApi.updateScene(storyId, change.id!, fields);
        case 'startingBond':
            return storyApi.updateStartingBond(storyId, change.id!, fields);
    }
}

/** Undo of an addition removes what was added. */
function removeAdded(storyId: number, change: Extract<AppliedChange, { kind: 'add' }>): Promise<Story> {
    switch (change.target) {
        case 'character':
            return storyApi.removeCharacter(storyId, change.id);
        case 'scene':
            return storyApi.removeScene(storyId, change.id);
        case 'startingBond':
            return storyApi.removeStartingBond(storyId, change.id);
    }
}

/**
 * The Story assistant's state (spec: "Story assistant", "Undo"). Each instruction is one
 * stateless call; the answer's changes are already applied when it lands, so the hook only
 * records them, lights their fields up, and offers Undo from the old values the API answered.
 * Nothing here is persisted: closing the panel forgets the conversation and the Undos.
 */
export function useStoryAssistant({ storyId, commit, applyWhole, onApplied }: Options) {
    const [open, setOpen] = useState(false);
    const applied = useRef(onApplied);
    useEffect(() => {
        applied.current = onApplied;
    }, [onApplied]);
    const [entries, setEntries] = useState<AssistantEntry[]>([]);
    const nextId = useRef(1);
    const newId = () => nextId.current++;

    const replace = useCallback((id: number, next: AssistantEntry | null) => {
        setEntries((current) => current.flatMap((entry) => (entry.id === id ? (next ? [next] : []) : [entry])));
    }, []);

    /** What an answer does when it lands: the Story is already changed, show the changes. */
    const land = useCallback(
        (busyId: number, result: AssistantResponse) => {
            // Rendered at once, so the editor can scroll to a field the answer has just added.
            flushSync(() => {
                applyWhole(result.story);
                if (result.pending) {
                    replace(busyId, { id: busyId, kind: 'pending', reply: result.reply, pending: result.pending, cancelled: false });
                } else {
                    replace(busyId, {
                        id: busyId,
                        kind: 'answer',
                        reply: result.reply,
                        changes: result.changes.map((change) => ({ change, undo: { kind: 'applied' } })),
                    });
                }
            });
            if (!result.pending && result.changes.length > 0) applied.current?.(result.changes);
        },
        [applyWhole, replace],
    );

    const run = useCallback(
        (busyId: number, call: () => Promise<AssistantResponse>, retry: () => void) => {
            void commit(call, (result) => land(busyId, result), (message) =>
                replace(busyId, { id: busyId, kind: 'error', message, retry }),
            ).then((result) => {
                // Unreachable API: the connection boundary takes over; drop the waiting entry.
                if (result === undefined) setEntries((current) => current.filter((e) => e.id !== busyId || e.kind !== 'busy'));
            });
        },
        [commit, land, replace],
    );

    const send = useCallback(
        (instruction: string) => {
            const text = instruction.trim();
            if (text === '') return;
            const busyId = newId();
            setEntries((current) => [...current, { id: newId(), kind: 'instruction', text }, { id: busyId, kind: 'busy', what: 'thinking' }]);
            const attempt = () => {
                replace(busyId, { id: busyId, kind: 'busy', what: 'thinking' });
                run(busyId, () => assistantApi.instruct(storyId, text), attempt);
            };
            run(busyId, () => assistantApi.instruct(storyId, text), attempt);
        },
        [replace, run, storyId],
    );

    /** The author confirmed the removals: apply the pending set, without another model call. */
    const confirmPending = useCallback(
        (entryId: number, pending: PendingChangeSet) => {
            const attempt = () => {
                replace(entryId, { id: entryId, kind: 'busy', what: 'applying' });
                run(entryId, () => assistantApi.apply(storyId, pending.changes), attempt);
            };
            attempt();
        },
        [replace, run, storyId],
    );

    const cancelPending = useCallback((entryId: number) => {
        setEntries((current) =>
            current.map((entry) => (entry.id === entryId && entry.kind === 'pending' ? { ...entry, cancelled: true } : entry)),
        );
    }, []);

    const setUndo = useCallback((entryId: number, index: number, undo: UndoState) => {
        setEntries((current) =>
            current.map((entry) =>
                entry.id === entryId && entry.kind === 'answer'
                    ? { ...entry, changes: entry.changes.map((item, i) => (i === index ? { ...item, undo } : item)) }
                    : entry,
            ),
        );
    }, []);

    /** Undo one change: a set gets its old value back; an addition is removed again. */
    const undo = useCallback(
        (entryId: number, index: number, change: AppliedChange) => {
            if (change.kind === 'remove') return;
            setUndo(entryId, index, { kind: 'undoing' });
            void commit(
                () => (change.kind === 'set' ? restore(storyId, change) : removeAdded(storyId, change)),
                (story) => {
                    applyWhole(story);
                    setUndo(entryId, index, { kind: 'undone' });
                },
                (message) => setUndo(entryId, index, { kind: 'error', message }),
            );
        },
        [applyWhole, commit, setUndo, storyId],
    );

    const openPanel = useCallback(() => {
        setEntries([]);
        setOpen(true);
    }, []);
    const closePanel = useCallback(() => {
        setEntries([]);
        setOpen(false);
    }, []);

    /** Every field changed by an answer and not undone. */
    const highlights = useMemo(() => {
        const keys = new Set<string>();
        for (const entry of entries) {
            if (entry.kind !== 'answer') continue;
            for (const item of entry.changes) {
                if (item.undo.kind === 'undone') continue;
                for (const key of keysOf(item.change)) keys.add(key);
            }
        }
        return keys as ReadonlySet<string>;
    }, [entries]);

    const busy = entries.some((entry) => entry.kind === 'busy');

    return { open, openPanel, closePanel, entries, busy, send, confirmPending, cancelPending, undo, highlights };
}

export type StoryAssistant = ReturnType<typeof useStoryAssistant>;

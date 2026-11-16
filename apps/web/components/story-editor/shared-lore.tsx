'use client';

import { useEffect, useRef, useState } from 'react';

import { useConnection } from '@/components/connection';
import { Sheet } from '@/components/sheet/sheet';
import { ApiUnreachableError } from '@/lib/api';
import { LoreEntry, LoreSet, LoreSetSummary, MAX_LORE_SETS_PER_STORY, Story, storyApi } from '@/lib/story';
import { ADD_BUTTON } from './add-button';
import { Autosave } from './autosave';
import { ConfirmButton, TextField } from './fields';
import { NOTE, openAdded } from './folding-card';
import { LoreCard, LoreTriggerKey } from './lore-card';
import { FieldRewrites } from './rewrite';
import { UndoNotice, useUndo } from './undo-notice';

/** What a Lore set is called where its name is blank (mirrors the API's `loreSetName`). */
export function loreSetLabel(set: Pick<LoreSet, 'name'>): string {
    return set.name.trim() || 'Lore set';
}

const stories = (count: number) => (count === 1 ? '1 Story' : `${count} Stories`);
const entriesOf = (count: number) => (count === 1 ? '1 entry' : `${count} entries`);

interface SharedLoreProps {
    storyId: number;
    sets: LoreSet[];
    /** How many Lore entries the Story has of its own: with any, they can be moved into a new set. */
    ownEntries: number;
    rewrites: FieldRewrites;
    commit: Autosave['commit'];
    applyWhole(story: Story): void;
    /** A set's name: shown at once, autosaved. */
    onName(setId: number, name: string): void;
    /** One field of a set's entry: shown at once, autosaved. */
    onEntry<K extends keyof LoreEntry>(setId: number, entryId: number, field: K, value: LoreEntry[K]): void;
    /** A set entry's patterns, which the API may refuse. */
    onEntryPatterns(setId: number, entryId: number, patterns: string[], onSaved: () => void, onError: (message: string) => void): void;
    /** A number typed out of range in a set's entry: its waiting save is dropped. */
    onInvalidNumber(entryId: number, field: LoreTriggerKey): void;
}

/**
 * Shared Lore on the Lore tab (.scratch/shared-lore/spec.md): the Lore sets this Story links. A set
 * is kept apart from any one Story, so a change made here reaches every Story that links it; each
 * set says how many do. A set is made here, linked from the picker, unlinked (it stays for the
 * others) or deleted for good, and its entries are edited with the same card as the Story's own.
 *
 * Unlink acts at once and offers an Undo; Delete asks first and stands at the other end of the row
 * (docs/ui-audit-2026-11-16.md M5: the two were 8px apart, and a slip on Unlink went unsaid).
 */
export function SharedLore({ storyId, sets, ownEntries, rewrites, commit, applyWhole, onName, onEntry, onEntryPatterns, onInvalidNumber }: SharedLoreProps) {
    const [picking, setPicking] = useState(false);
    const full = sets.length >= MAX_LORE_SETS_PER_STORY;
    const linkButton = useRef<HTMLButtonElement>(null);
    const linkedIds = sets.map((set) => set.id);
    // What the Story links now, for an Undo pressed after the list has changed again.
    const linkedNow = useRef(linkedIds);
    linkedNow.current = linkedIds;
    const undo = useUndo();
    /** Unlinks at once; Undo links it again where it was. The set itself is untouched either way. */
    const unlink = (set: LoreSet, at: number) =>
        void commit(() => storyApi.linkLoreSets(storyId, linkedIds.filter((id) => id !== set.id)), applyWhole).then((saved) => {
            if (!saved) return;
            undo.offer({
                message: `Unlinked ${loreSetLabel(set)}. It is still in your Lore sets.`,
                undo: () => {
                    const now = linkedNow.current.filter((id) => id !== set.id);
                    void commit(() => storyApi.linkLoreSets(storyId, [...now.slice(0, at), set.id, ...now.slice(at)]), applyWhole);
                },
                focusAfterUndo: () => linkButton.current,
            });
        });
    /** "Its 2 entries go with it, from all 3 Stories that link it. " for the set about to be deleted; empty for an empty set only this Story links. */
    const whatGoes = (set: LoreSet) => {
        const count = set.entries.length;
        const fromAll = set.usedBy > 1 ? `from all ${stories(set.usedBy)} that link it` : '';
        if (count === 0) return fromAll === '' ? '' : `It goes ${fromAll}. `;
        return `Its ${entriesOf(count)} ${count === 1 ? 'goes' : 'go'} with it${fromAll === '' ? '' : `, ${fromAll}`}. `;
    };

    return (
        // A group, not a region: the tab it sits in is the one landmark named "Lore".
        <div role="group" aria-labelledby="shared-lore-heading" className="mt-6">
            <h2 id="shared-lore-heading" className="mt-0 mb-1 text-lg font-semibold">
                Shared Lore
            </h2>
            <p className={NOTE}>
                Optional. A Lore set is Lore kept apart from any one Story, for worlds you tell more than one Story in. Link a set to each Story
                that needs it: a change to the set reaches them all. Up to {MAX_LORE_SETS_PER_STORY} sets a Story.
            </p>
            {/*
              * Right under the Story's own Lore, which is what it moves, and named for what it does
              * (docs/ui-audit-2026-11-16.md M3: "Share this Story's Lore" read as sharing with other people).
              */}
            {ownEntries > 0 && !full && (
                <div className="mt-3">
                    <ConfirmButton
                        label="Move this Story’s Lore into a set"
                        question={`Move this Story’s ${entriesOf(ownEntries)} into a new Lore set?`}
                        warning="This Story reads them as before, through the set, and your other Stories can then link the set too."
                        confirmLabel="Move"
                        onConfirm={() => commit(() => storyApi.createLoreSet(storyId, { moveLore: true }), applyWhole)}
                        focusAfter={() => linkButton.current}
                    />
                </div>
            )}

            {sets.map((set, at) => {
                const label = loreSetLabel(set);
                return (
                    <div key={set.id} role="group" className="mt-4 border-l-3 border-accent pl-3" aria-label={`Lore set: ${label}`} data-lore-set={set.id}>
                        <TextField
                            label="Lore set name"
                            value={set.name}
                            placeholder="The Salt Coast"
                            hint={set.usedBy > 1 ? `Used by ${stories(set.usedBy)}: a change here reaches them all.` : 'Used by this Story only, until you link it to another.'}
                            domId={`field-loreSet.${set.id}.name`}
                            onChange={(value) => onName(set.id, value)}
                        />
                        {set.entries.map((entry, index) => (
                            <LoreCard
                                key={entry.id}
                                entry={entry}
                                index={index}
                                labelPrefix={`${label} entry`}
                                removeWarning={
                                    set.usedBy > 1
                                        ? `It goes from all ${stories(set.usedBy)} that link this set; their Chats stop getting it from their next turn.`
                                        : undefined
                                }
                                rewrites={rewrites}
                                onText={(field, value) => onEntry(set.id, entry.id, field, value)}
                                onKeywords={(keywords) => onEntry(set.id, entry.id, 'keywords', keywords)}
                                onAlwaysOn={(alwaysOn) => onEntry(set.id, entry.id, 'alwaysOn', alwaysOn)}
                                onTrigger={(field, value) => onEntry(set.id, entry.id, field, value)}
                                onInvalidNumber={(field) => onInvalidNumber(entry.id, field)}
                                onPatterns={(patterns, onSaved, onError) => onEntryPatterns(set.id, entry.id, patterns, onSaved, onError)}
                                onRemove={() => commit(() => storyApi.removeLoreSetEntry(storyId, set.id, entry.id), applyWhole)}
                            />
                        ))}
                        <button
                            type="button"
                            className={ADD_BUTTON}
                            onClick={() =>
                                void commit(
                                    () => storyApi.addLoreSetEntry(storyId, set.id),
                                    (saved) => {
                                        openAdded('lore', set.entries, saved.loreSets.find((other) => other.id === set.id)?.entries ?? []);
                                        applyWhole(saved);
                                    },
                                )
                            }
                            // The set's name is in the field above; the whole of it made the button two lines (audit M4).
                            aria-label={`+ Add entry to ${label}`}
                        >
                            + Add entry
                        </button>
                        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
                            <button type="button" className="button button-quiet button-small" aria-label={`Unlink ${label} from this Story`} onClick={() => unlink(set, at)}>
                                Unlink
                            </button>
                            <ConfirmButton
                                label="Delete set"
                                ariaLabel={`Delete set ${label}`}
                                danger
                                small
                                question={`Delete ${label} for good?`}
                                warning={`${whatGoes(set)}To keep the set and only take it off this Story, use Unlink.`}
                                confirmLabel="Delete"
                                onConfirm={() => commit(() => storyApi.deleteLoreSet(storyId, set.id), applyWhole)}
                                focusAfter={() => linkButton.current}
                            />
                        </div>
                    </div>
                );
            })}

            <UndoNotice undo={undo} />
            {/* Making a set and linking one, as a pair on one row: apart from "+ Add entry", which belongs to a set (audit M4). */}
            <div className="mt-4 grid grid-cols-2 gap-2">
                <button type="button" className={ADD_BUTTON} disabled={full} onClick={() => void commit(() => storyApi.createLoreSet(storyId), applyWhole)}>
                    + New Lore set
                </button>
                <button ref={linkButton} type="button" className={ADD_BUTTON} disabled={full} onClick={() => setPicking(true)}>
                    Link a Lore set
                </button>
            </div>
            {full && <p className={NOTE}>This Story links the most sets it can. Unlink one to link another.</p>}

            {picking && (
                <LinkSheet
                    linkedIds={linkedIds}
                    onClose={() => setPicking(false)}
                    onLink={(setId) => {
                        setPicking(false);
                        void commit(() => storyApi.linkLoreSets(storyId, [...linkedIds, setId]), applyWhole);
                    }}
                />
            )}
        </div>
    );
}

type Listed = { status: 'loading' } | { status: 'failed' } | { status: 'ready'; sets: LoreSetSummary[] };

/** The Account's Lore sets this Story does not link yet, to pick one from. Read each time it opens. */
function LinkSheet({ linkedIds, onClose, onLink }: { linkedIds: number[]; onClose(): void; onLink(setId: number): void }) {
    const { reportUnreachable } = useConnection();
    const [listed, setListed] = useState<Listed>({ status: 'loading' });
    // The ids as text, so the list is read once per opening whatever array the parent hands down.
    const linkedKey = linkedIds.join(',');

    useEffect(() => {
        let gone = false;
        const linked = new Set(linkedKey === '' ? [] : linkedKey.split(',').map(Number));
        storyApi.listLoreSets().then(
            ({ loreSets }) => {
                if (!gone) setListed({ status: 'ready', sets: loreSets.filter((set) => !linked.has(set.id)) });
            },
            (caught: unknown) => {
                if (caught instanceof ApiUnreachableError) reportUnreachable();
                if (!gone) setListed({ status: 'failed' });
            },
        );
        return () => {
            gone = true;
        };
    }, [linkedKey, reportUnreachable]);

    return (
        <Sheet label="Link a Lore set" title="Link a Lore set" onClose={onClose}>
            <div className="grid gap-3 pb-2">
                {listed.status === 'loading' && (
                    <p role="status" className="m-0 text-md text-muted">
                        Reading your Lore sets…
                    </p>
                )}
                {listed.status === 'failed' && (
                    <p role="alert" className="field-error">
                        Couldn&apos;t read your Lore sets. Close this and try again.
                    </p>
                )}
                {listed.status === 'ready' && listed.sets.length === 0 && (
                    <p className="m-0 text-md text-muted">No other Lore sets yet. A set you make in one Story shows here in the others.</p>
                )}
                {listed.status === 'ready' && listed.sets.length > 0 && (
                    <ul className="m-0 grid list-none gap-2 p-0" aria-label="Your Lore sets">
                        {listed.sets.map((set) => (
                            <li key={set.id} className="flex items-center justify-between gap-3 rounded-lg bg-surface-raised px-3.5 py-3">
                                <span className="grid min-w-0">
                                    <strong className="font-semibold [overflow-wrap:anywhere]">{set.name}</strong>
                                    <span className="text-sm text-muted [overflow-wrap:anywhere]">
                                        {entriesOf(set.entries)}
                                        {set.stories.length > 0 ? ` · used by ${set.stories.map((story) => story.title.trim() || 'Untitled').join(', ')}` : ' · linked to no Story'}
                                    </span>
                                </span>
                                <button type="button" className="button button-small shrink-0" aria-label={`Link ${set.name}`} onClick={() => onLink(set.id)}>
                                    Link
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </Sheet>
    );
}

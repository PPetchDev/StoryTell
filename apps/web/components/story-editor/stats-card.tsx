'use client';

import { useEffect, useId, useState } from 'react';

import { CloseIcon } from '@/components/icons';
import { MAX_STATS, RoleStat, STAT_MAX, STAT_MIN, STAT_NAME_MAX } from '@/lib/story';

import { ADD_BUTTON_IN_CARD } from './add-button';
import { FIELD_ERROR, FIELD_HINT, INPUT_BOX, inputEdge } from './fields';
import { EDITOR_CARD, NOTE } from './folding-card';

/** A row as typed: the number stays text until it is one, so "-" can be typed on the way to "-1". */
interface Row {
    key: number;
    name: string;
    value: string;
}

const toRows = (stats: readonly RoleStat[]): Row[] => stats.map((stat, index) => ({ key: index, name: stat.name, value: String(stat.value) }));

/** The rows as Stats, or why they can't be saved yet (mirrors the API's rules, .scratch/judge-rolls/spec.md). */
function readRows(rows: readonly Row[]): { stats: RoleStat[] } | { problem: string } {
    const seen = new Set<string>();
    const stats: RoleStat[] = [];
    for (const row of rows) {
        const name = row.name.trim();
        if (!name) return { problem: 'Give every Stat a name.' };
        if (seen.has(name.toLowerCase())) return { problem: `Two Stats are called "${name}".` };
        seen.add(name.toLowerCase());
        const value = Number(row.value);
        if (row.value.trim() === '' || !Number.isInteger(value) || value < STAT_MIN || value > STAT_MAX) {
            return { problem: `${name}: a whole number from ${STAT_MIN} to ${STAT_MAX}.` };
        }
        stats.push({ name, value });
    }
    return { stats };
}

const SWITCH_TRACK =
    'relative h-6 w-10 shrink-0 rounded-full border border-field-line bg-quiet-fill group-aria-checked:border-accent-fill group-aria-checked:bg-accent-fill motion-safe:transition-colors motion-safe:duration-base';
const SWITCH_KNOB =
    'absolute top-0.5 left-0.5 size-4 rounded-full bg-text group-aria-checked:translate-x-4 group-aria-checked:bg-accent-text motion-safe:transition-transform motion-safe:duration-base';

interface StatsCardProps {
    stats: readonly RoleStat[];
    rollOffers: boolean;
    /** The whole list, sent only when every row is fine. */
    onStats(stats: RoleStat[]): void;
    /** A row can't be saved as typed: drop the edit still waiting, so an older list doesn't land as Saved. */
    onInvalid(): void;
    onRollOffers(on: boolean): void;
}

/**
 * The Role's Stats and the switch for Roll offers (CONTEXT.md, "Stat", "Roll offer"), on the Role
 * tab: a row per Stat (name, number, remove), "Add a Stat" up to six, saved as one list like the
 * Role's other fields. A row that breaks a rule says why and is not sent until it is fixed.
 */
export function StatsCard({ stats, rollOffers, onStats, onInvalid, onRollOffers }: StatsCardProps) {
    const [rows, setRows] = useState<Row[]>(() => toRows(stats));
    const [nextKey, setNextKey] = useState(stats.length);
    const problemId = useId();
    const read = readRows(rows);
    const problem = 'problem' in read ? read.problem : null;
    // Follows the stored list when it changes from elsewhere (the Story assistant), unless the rows already say the same.
    useEffect(() => {
        setRows((current) => {
            const now = readRows(current);
            return 'stats' in now && JSON.stringify(now.stats) === JSON.stringify(stats) ? current : toRows(stats);
        });
    }, [stats]);

    const change = (next: Row[]) => {
        setRows(next);
        const result = readRows(next);
        if ('stats' in result) onStats(result.stats);
        else onInvalid();
    };

    return (
        <section className={EDITOR_CARD} aria-label="Stats and Rolls" data-stats-card>
            <h2 className="mt-0 mb-1 text-lg font-semibold">Stats</h2>
            <p className={NOTE}>
                What your part is good at, from {STAT_MIN} to +{STAT_MAX}. A Roll made for a Stat adds it to the d20. Leave it empty for none.
            </p>
            {rows.length > 0 && (
                <ul className="m-0 grid list-none gap-2 p-0" aria-describedby={problem ? problemId : undefined}>
                    {rows.map((row, index) => (
                        <li key={row.key} className="flex min-w-0 items-center gap-2" data-stat-row>
                            <input
                                type="text"
                                aria-label={`Stat ${index + 1} name`}
                                placeholder="e.g. Strength"
                                maxLength={STAT_NAME_MAX}
                                value={row.name}
                                className={`${INPUT_BOX} min-w-0 flex-1 ${inputEdge()}`}
                                onChange={(event) => change(rows.map((r) => (r.key === row.key ? { ...r, name: event.target.value } : r)))}
                            />
                            <input
                                type="number"
                                inputMode="numeric"
                                aria-label={`${row.name.trim() || `Stat ${index + 1}`} number`}
                                min={STAT_MIN}
                                max={STAT_MAX}
                                step={1}
                                value={row.value}
                                className={`${INPUT_BOX} w-18 shrink-0 ${inputEdge()}`}
                                onChange={(event) => change(rows.map((r) => (r.key === row.key ? { ...r, value: event.target.value } : r)))}
                            />
                            <button
                                type="button"
                                className="bare-button grid size-11 shrink-0 cursor-pointer place-items-center rounded-sm text-muted press focus-ring"
                                aria-label={`Remove ${row.name.trim() || `Stat ${index + 1}`}`}
                                onClick={() => change(rows.filter((r) => r.key !== row.key))}
                            >
                                <CloseIcon size={18} />
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            {problem && (
                <p id={problemId} role="alert" className={`${FIELD_ERROR} mt-2`}>
                    {problem} Not saved until it is fixed.
                </p>
            )}
            {rows.length < MAX_STATS ? (
                <button
                    type="button"
                    className={ADD_BUTTON_IN_CARD}
                    onClick={() => {
                        setRows((current) => [...current, { key: nextKey, name: '', value: '1' }]);
                        setNextKey((key) => key + 1);
                    }}
                >
                    + Add a Stat
                </button>
            ) : (
                <p className={`${FIELD_HINT} mt-2`}>A Role has at most {MAX_STATS} Stats.</p>
            )}
            <button
                type="button"
                role="switch"
                aria-checked={rollOffers}
                className="bare-button group mt-4 flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-sm text-left text-text focus-ring"
                onClick={() => onRollOffers(!rollOffers)}
            >
                <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-semibold">Offer Rolls at key moments</span>
                    <span className="text-sm text-muted">Now and then the story offers you the dice for a risky moment. You can always roll yourself.</span>
                </span>
                <span aria-hidden="true" className={SWITCH_TRACK}>
                    <span className={SWITCH_KNOB} />
                </span>
            </button>
        </section>
    );
}

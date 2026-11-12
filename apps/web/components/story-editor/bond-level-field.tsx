'use client';

import { useId } from 'react';

import { BOND_AXIS_NAMES, BondAxis, bondAxisLevels, bondLevelWord } from '@/lib/bonds';
import { FIELD, FIELD_HEAD, FIELD_INPUT, FIELD_LABEL } from './fields';

interface BondLevelFieldProps {
    axis: BondAxis;
    value: number;
    onChange(level: number): void;
    /** The picker's name; the axis's own name ("Trust") unless given. */
    label?: string;
}

/**
 * One Bond axis's level, picked by its word (.scratch/bond-axes/spec.md): the author never sees a
 * number, only "wary", "fond", "strained" and the rest.
 */
export function BondLevelField({ axis, value, onChange, label }: BondLevelFieldProps) {
    const id = useId();
    return (
        <div className={FIELD}>
            <div className={FIELD_HEAD}>
                <span className={FIELD_LABEL}>
                    <label htmlFor={id}>{label ?? BOND_AXIS_NAMES[axis]}</label>
                </span>
            </div>
            <select id={id} className={FIELD_INPUT} value={String(value)} onChange={(event) => onChange(Number(event.target.value))}>
                {bondAxisLevels(axis).map((level) => (
                    <option key={level} value={String(level)}>
                        {bondLevelWord(axis, level)}
                    </option>
                ))}
            </select>
        </div>
    );
}

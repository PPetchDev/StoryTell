'use client';

import { useId } from 'react';

import { BOND_AXIS_NAMES, BondAxis, bondAxisLevels, bondLevelWord } from '@/lib/bonds';
import styles from './fields.module.css';

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
        <div className={styles.field}>
            <div className={styles.head}>
                <span className={styles.label}>
                    <label htmlFor={id}>{label ?? BOND_AXIS_NAMES[axis]}</label>
                </span>
            </div>
            <select id={id} className={styles.input} value={String(value)} onChange={(event) => onChange(Number(event.target.value))}>
                {bondAxisLevels(axis).map((level) => (
                    <option key={level} value={String(level)}>
                        {bondLevelWord(axis, level)}
                    </option>
                ))}
            </select>
        </div>
    );
}

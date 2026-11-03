import { ColumnOptions } from 'typeorm';

/**
 * PostgreSQL `numeric` keeps money exact, but the driver returns it as a string. This column
 * shape reads it back as a number.
 */
export function decimalColumn(precision: number, scale: number): ColumnOptions {
    return {
        type: 'numeric',
        precision,
        scale,
        transformer: {
            to: (value: number) => value,
            from: (value: string | null) => (value === null ? null : Number(value)),
        },
    };
}

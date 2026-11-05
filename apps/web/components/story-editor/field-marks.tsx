'use client';

import { createContext, useContext } from 'react';

/** What the editor marks on its fields by their DOM id, without passing it through every card. */
export interface FieldMarks {
    /** Empty fields the Story needs before it can be played. */
    needed: ReadonlySet<string>;
    /** The field just jumped to, or just rewritten: it is highlighted for a moment. */
    flashed: string | null;
}

const NO_MARKS: FieldMarks = { needed: new Set(), flashed: null };

export const FieldMarksContext = createContext<FieldMarks>(NO_MARKS);

export function useFieldMarks(domId: string | undefined): { needed: boolean; flashed: boolean } {
    const marks = useContext(FieldMarksContext);
    if (!domId) return { needed: false, flashed: false };
    return { needed: marks.needed.has(domId), flashed: marks.flashed === domId };
}

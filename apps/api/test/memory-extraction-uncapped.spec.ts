import { applyExtraction } from '../src/manager/chat/memory/apply-extraction.js';
import { buildExtractionPrompt, EXTRACTION_MAX_TOKENS, ExtractionMemory, parseExtraction } from '../src/manager/chat/memory/memory-prompt.js';

/**
 * .scratch/memory-by-meaning/spec.md, "Keeping every Memory" (ticket 03): the extraction prompt no
 * longer counts Memories or tokens and never demands merges or archives, however many there are.
 * Merge and archive stay operations the model may choose. Pure functions, no database.
 */

const memories = (count: number, locked = false): ExtractionMemory[] =>
    Array.from({ length: count }, (_, at) => ({
        id: at + 1,
        text: `Mira logged the tide at the north reef on day ${at}, and the long account of it fills a line of its own.`,
        knownBy: ['Mira'],
        locked,
    }));

function prompt(list: ExtractionMemory[]) {
    return buildExtractionPrompt({
        cast: ['Mira', 'Kai'],
        identityName: 'Ash',
        present: ['Mira'],
        memories: list,
        beliefs: [],
        userText: 'I watch the tide.',
        aiText: '@Mira: Low again.',
    });
}

describe('Memory extraction without a cap', () => {
    it.each([0, 10, 60, 61, 200])('at %i Memories demands no merge or archive and asks for the usual answer length', (count) => {
        const built = prompt(memories(count));
        const system = built.messages[0].content;
        expect(system).not.toMatch(/size cap|MUST return|where about \d+ fit/);
        expect(system).not.toContain('"merge" or "archive" operations');
        expect(built.maxTokens).toBe(EXTRACTION_MAX_TOKENS);
        // Every Memory is still listed, so the model can add to who knows one, merge or archive.
        expect(built.messages[1].content.split('\n').filter((line) => /^\d+: - \[known by/.test(line))).toHaveLength(count);
    });

    it('is the same system message at 200 Memories as at none: nothing in it counts them', () => {
        expect(prompt(memories(200)).messages[0].content).toBe(prompt([]).messages[0].content);
    });

    it('still offers merge and archive, and keeps locked Memories to Known-by changes', () => {
        const system = prompt(memories(200)).messages[0].content;
        expect(system).toContain('{"op":"merge","ids":[3,7]');
        expect(system).toContain('{"op":"archive","id":4');
        expect(system).toContain('Memories marked [locked] were written or corrected by the user: never update, delete, merge or archive them.');
    });

    it('parses and applies a merge and an archive the model chose, at 200 Memories', () => {
        const list = memories(200);
        const extraction = parseExtraction(
            JSON.stringify({
                operations: [
                    { op: 'merge', ids: [3, 7], text: 'Mira logged the tide twice at the reef.', known_by: ['Mira'], cause: 'the same fact' },
                    { op: 'archive', id: 4, cause: 'long past' },
                ],
            }),
        );
        const applied = applyExtraction(
            {
                cast: [
                    { id: 1, name: 'Mira' },
                    { id: 2, name: 'Kai' },
                ],
                identityName: 'Ash',
                memories: list.map((memory) => ({ id: memory.id, text: memory.text, knownBy: [1], locked: false, archived: false })),
            },
            extraction,
        );
        expect(applied.rejected).toEqual([]);
        expect(applied.changes).toEqual([
            { kind: 'delete', memoryId: 3, event: 'the same fact' },
            { kind: 'delete', memoryId: 7, event: 'the same fact' },
            { kind: 'add', text: 'Mira logged the tide twice at the reef.', knownBy: [1], event: 'the same fact' },
            { kind: 'archive', memoryId: 4, event: 'long past' },
        ]);
    });

    it('drops a merge or an archive of a locked Memory, but takes a Known-by addition to it', () => {
        const list = memories(200, true);
        const applied = applyExtraction(
            {
                cast: [
                    { id: 1, name: 'Mira' },
                    { id: 2, name: 'Kai' },
                ],
                identityName: 'Ash',
                memories: list.map((memory) => ({ id: memory.id, text: memory.text, knownBy: [1], locked: true, archived: false })),
            },
            parseExtraction(
                JSON.stringify({
                    operations: [
                        { op: 'merge', ids: [3, 7], text: 'Merged.', known_by: ['Mira'], cause: 'x' },
                        { op: 'archive', id: 4, cause: 'x' },
                        { op: 'known_by', id: 5, names: ['Kai'], cause: 'told' },
                    ],
                }),
            ),
        );
        expect(applied.changes).toEqual([{ kind: 'known_by', memoryId: 5, add: [2], event: 'told' }]);
        expect(applied.rejected).toEqual(['merge: Memory 3 is locked', 'archive 4: locked']);
    });
});

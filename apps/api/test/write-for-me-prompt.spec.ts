import { DOCUMENTS_HEADING } from '../src/manager/document/document-search.js';
import { LORE_HEADING } from '../src/manager/chat/lore/lore-select.js';
import { buildTurnPrompt, estimateTokens, PromptHistoryMessage, TURN_PROMPT_TOKEN_BUDGET, TurnPromptInput } from '../src/manager/chat/turn/prompt.js';
import {
    buildWriteForMePrompt,
    DRAFT_CLOSE,
    DRAFT_OPEN,
    readWriteForMe,
    WriteForMePromptInput,
} from '../src/manager/chat/write-for-me/write-for-me-prompt.js';
import { Pov, ReplyLength, Tense } from '../src/model/story/entities/story.entity.js';

const HISTORY: PromptHistoryMessage[] = [
    { role: 'assistant', text: '@Mira: Boots off, keeper.' },
    { role: 'user', text: 'I shake the rain off my coat.' },
    { role: 'assistant', text: '@Mira: Took your time.' },
];

function turnInput(overrides: Partial<TurnPromptInput> = {}): TurnPromptInput {
    return {
        story: {
            setting: 'A lighthouse on a storm-cut island.',
            pov: Pov.Second,
            tense: Tense.Past,
            replyLength: ReplyLength.Long,
            characters: [{ name: 'Mira', appearance: 'Tall.', personality: 'Dry.', voice: 'Short.', exampleLines: [], background: '', secrets: '' }],
        },
        identity: { name: 'Ash', description: 'The new keeper.' },
        scene: null,
        bonds: [],
        arcs: [],
        memories: [],
        history: HISTORY,
        userText: null,
        ...overrides,
    };
}

function input(overrides: Partial<WriteForMePromptInput> = {}): WriteForMePromptInput {
    return { ...turnInput(), history: HISTORY, draft: '', ...overrides };
}

const closing = (prompt: ReturnType<typeof buildWriteForMePrompt>) => prompt.messages.at(-1)!;

describe('Write for me: the prompt (pure)', () => {
    it("opens with the turn's system message unchanged and sends the history, then one closing user message", () => {
        const prompt = buildWriteForMePrompt(input({ draft: 'ถามเรื่องกุญแจ' }));
        const turn = buildTurnPrompt(turnInput());

        expect(prompt.messages[0]).toEqual(turn.messages[0]);
        expect(prompt.messages.slice(1, -1)).toEqual([
            { role: 'assistant', content: '@Mira: Boots off, keeper.' },
            { role: 'user', content: 'I shake the rain off my coat.' },
            { role: 'assistant', content: '@Mira: Took your time.' },
        ]);
        expect(closing(prompt).role).toBe('user');
        expect(prompt.maxTokens).toBe(600);
        expect(prompt.stop).toEqual(['\n@']);
    });

    it("names the worn identity and the Story's point of view and tense, and quotes the draft inside its markers", () => {
        const draft = 'ถามเธอเรื่องกุญแจ ทำเสียงสงสัย';
        const text = closing(buildWriteForMePrompt(input({ draft: `  ${draft}\n` }))).content;

        expect(text).toContain('The user plays Ash');
        expect(text).toContain('written for them, as Ash, in second person for Ash ("you"), past tense');
        expect(text).toContain(`${DRAFT_OPEN}\n${draft}\n${DRAFT_CLOSE}`);
        expect(text).toContain('may be in Thai or another language');
        expect(text).toContain('Keep everything it says Ash does and says, in its order');
        expect(text).toContain('never what a Character says, does or feels');
        expect(text).toContain('one to four sentences, at most about 120 words; when the draft holds more, keep all of it');
        expect(text).not.toContain('written nothing');
    });

    it('asks for a reply from nothing when the draft is empty or whitespace, with no markers', () => {
        for (const draft of ['', '  \n ']) {
            const text = closing(buildWriteForMePrompt(input({ draft }))).content;
            expect(text).toContain('The user has written nothing for it. Decide what Ash does and says next');
            expect(text).not.toContain(DRAFT_OPEN);
            expect(text).toContain('never what a Character says, does or feels');
        }
    });

    it('names a Persona and the Story’s own point of view and tense when the Chat wears one', () => {
        const text = closing(
            buildWriteForMePrompt(
                input({
                    identity: { name: 'Rin', description: 'A drifter.' },
                    story: { ...turnInput().story, pov: Pov.First, tense: Tense.Present },
                }),
            ),
        ).content;

        expect(text).toContain('as Rin, in first person as Rin ("I"), present tense');
        expect(text).not.toContain('Ash');
    });

    it('is the instruction alone with no Lore and no Documents', () => {
        const text = closing(buildWriteForMePrompt(input())).content;
        expect(text.startsWith('Step outside the story')).toBe(true);
    });

    it('carries the chosen Lore, then the Documents, then the instruction', () => {
        const text = closing(
            buildWriteForMePrompt(
                input({
                    chosenLore: [{ id: 1, name: 'Fog bells', keywords: [], text: 'Bells ring in fog.', alwaysOn: true }],
                    documentPassages: [{ documentTitle: 'Gull Point light', text: 'The keeper trims the wick at dusk.' }],
                }),
            ),
        ).content;

        const lore = text.indexOf(LORE_HEADING);
        const documents = text.indexOf(DOCUMENTS_HEADING);
        expect(lore).toBe(0);
        expect(documents).toBeGreaterThan(lore);
        expect(text.indexOf('Step outside the story')).toBeGreaterThan(documents);
        expect(text).toContain('## Fog bells\nBells ring in fog.');
        expect(text).toContain('## Gull Point light\nThe keeper trims the wick at dusk.');
    });

    it('reserves the closing message in the history budget: a long draft or a Documents block keeps fewer Messages, never going over', () => {
        const history = Array.from({ length: 200 }, (_, i) => ({
            role: (i % 2 === 0 ? 'assistant' : 'user') as 'user' | 'assistant',
            text: `M${i} ${'word '.repeat(80)}`,
        }));
        const plain = buildWriteForMePrompt(input({ history }));
        const longDraft = buildWriteForMePrompt(input({ history, draft: 'ก'.repeat(4_000) }));
        const withDocuments = buildWriteForMePrompt(input({ history, documentPassages: [{ documentTitle: 'Light', text: 'wick '.repeat(780) }] }));

        expect(longDraft.messages.length).toBeLessThan(plain.messages.length);
        expect(withDocuments.messages.length).toBeLessThan(plain.messages.length);
        for (const prompt of [plain, longDraft, withDocuments]) {
            const total = prompt.messages.reduce((sum, message) => sum + estimateTokens(message.content), 0);
            expect(total).toBeLessThanOrEqual(TURN_PROMPT_TOKEN_BUDGET);
        }
    });
});

describe('Write for me: reading the answer (pure)', () => {
    it('trims the answer and keeps it whole', () => {
        expect(readWriteForMe('  *I hold out my hand.* "The key, Mira."  \n', 'Ash')).toBe('*I hold out my hand.* "The key, Mira."');
    });

    it('takes the answer out of a code fence', () => {
        expect(readWriteForMe('```\n"Where is the key?"\n```', 'Ash')).toBe('"Where is the key?"');
        expect(readWriteForMe('```text\n"Where is the key?"\n```', 'Ash')).toBe('"Where is the key?"');
    });

    it("drops a leading label for the worn identity, with or without @, and keeps another name's mention", () => {
        expect(readWriteForMe('Ash: "Where is the key?"', 'Ash')).toBe('"Where is the key?"');
        expect(readWriteForMe('@Ash: "Where is the key?"', 'Ash')).toBe('"Where is the key?"');
        expect(readWriteForMe('Mira: is what I call out.', 'Ash')).toBe('Mira: is what I call out.');
    });

    it("cuts at the first line that starts with @, a Character's line", () => {
        expect(readWriteForMe('"Where is the key?"\n@Mira: In my pocket.\nAsh grins.', 'Ash')).toBe('"Where is the key?"');
        expect(readWriteForMe('"Where is the key?"\n\n  @Mira: Hm.', 'Ash')).toBe('"Where is the key?"');
    });

    it('refuses an answer with nothing left', () => {
        for (const empty of ['', '   ', '```\n\n```', 'Ash:', '@Mira: I answer for him.']) {
            expect(() => readWriteForMe(empty, 'Ash')).toThrow(expect.objectContaining({ code: '502.004.019' }));
        }
    });
});

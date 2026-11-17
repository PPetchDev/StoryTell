import { buildSuggestionsPrompt } from '../src/manager/chat/suggestions/suggestions-prompt.js';
import { buildTurnPrompt, NARRATOR_NOTES, PROMPT_LAYERS, PromptHistoryMessage, PromptLayersInput, TurnPromptInput } from '../src/manager/chat/turn/prompt.js';
import { buildWriteForMePrompt } from '../src/manager/chat/write-for-me/write-for-me-prompt.js';
import { Pov, ReplyLength, Tense } from '../src/model/story/entities/story.entity.js';
import { closingParts } from './harness/prompt-layers.js';

/**
 * The host's prompt cache (.scratch/prompt-cache/spec.md) keeps a prompt's opening as long as it
 * is the same, word for word, as an earlier one's, and DeepInfra kept nothing at all for a prompt
 * with a system message after the first. So a prompt is one system message of the standing layers,
 * the history, and one closing user message with all that changes each turn; and each turn's
 * prompt opens with the one before it, up to that one's history.
 */

function layers(overrides: Partial<PromptLayersInput> = {}): PromptLayersInput {
    return {
        story: {
            setting: 'A lighthouse.',
            pov: Pov.Second,
            tense: Tense.Present,
            replyLength: ReplyLength.Medium,
            characters: [{ name: 'Mira', appearance: 'Tall.', personality: 'Dry.', voice: 'Short.', exampleLines: [], background: '', secrets: '' }],
        },
        identity: { name: 'Ash', description: 'The keeper.' },
        scene: { name: 'Arrival', situation: 'Reach the lamp.', moveOnCondition: 'Mira lets Ash up.' },
        bonds: [{ fromName: 'Mira', toName: null, label: 'Wary', description: 'She expects Ash to leave.' }],
        arcs: [],
        memories: [],
        storySoFar: { text: 'Ash arrived in the storm.', coveredMessages: 0 },
        ...overrides,
    };
}

const opening: PromptHistoryMessage[] = [
    { role: 'assistant', text: '@Mira: *(without looking up)* The lamp is out.' },
    { role: 'user', text: 'I climb to the lamp.' },
    { role: 'assistant', text: 'The stairs creak.\n\n@Mira: Mind the third step.' },
];

function turn(history: PromptHistoryMessage[], userText: string | null, overrides: Partial<PromptLayersInput> = {}): TurnPromptInput {
    return { ...layers(overrides), history, userText };
}

describe('Prompt cache: what each prompt opens with (pure)', () => {
    it('sends one system message of standing layers, the history, then one user message with all that changes', () => {
        const prompt = buildTurnPrompt(turn(opening, 'I wait.'));
        const [standing, ...rest] = prompt.messages;
        expect(standing.role).toBe('system');
        expect(standing.content.startsWith(PROMPT_LAYERS.rules)).toBe(true);
        expect(standing.content).toContain(PROMPT_LAYERS.cast);
        expect(standing.content).toContain('Ash arrived in the storm.');
        for (const heading of [PROMPT_LAYERS.scene, PROMPT_LAYERS.feelings, PROMPT_LAYERS.arcs, PROMPT_LAYERS.memory]) expect(standing.content).not.toContain(heading);
        // No system message after the first.
        expect(rest.map((message) => message.role)).toEqual(['assistant', 'user', 'assistant', 'user']);
        const closing = rest.at(-1)!.content;
        expect(closing.startsWith(`I wait.\n\n${NARRATOR_NOTES}\n\n${PROMPT_LAYERS.scene}: Arrival`)).toBe(true);
        expect(closing).toContain('She expects Ash to leave.');
        expect(closing.indexOf(PROMPT_LAYERS.memory)).toBeLessThan(closing.indexOf('Where things stand:'));
        expect(closing.trimEnd().endsWith('the body carries the moment, not speeches about it.')).toBe(true);
    });

    it("opens the next turn's prompt with this one's, up to the end of its history, while the Scene, Feelings and Memory change", () => {
        const first = buildTurnPrompt(turn(opening, 'I wait.'));
        const after: PromptHistoryMessage[] = [...opening, { role: 'user', text: 'I wait.' }, { role: 'assistant', text: '@Mira: Fine. Come up.' }];
        const next = buildTurnPrompt(
            turn(after, 'I climb.', {
                scene: { name: 'The lamp', situation: 'Light it.', moveOnCondition: 'The lamp is lit.' },
                bonds: [{ fromName: 'Mira', toName: null, label: 'Curious', description: 'The new keeper stayed.' }],
            }),
        );
        const shared = 1 + opening.length;
        expect(next.messages.slice(0, shared)).toEqual(first.messages.slice(0, shared));
        expect(next.messages[shared]).toEqual({ role: 'user', content: 'I wait.' });
        // What changed is still sent, in the closing message.
        expect(closingParts(next).moment).toContain('# Current Scene: The lamp');
        expect(closingParts(next).moment).toContain('The new keeper stayed.');
    });

    it('keeps the same opening on a Continue, whose closing message starts with its instruction', () => {
        const prompt = buildTurnPrompt(turn(opening, null));
        expect(prompt.messages.slice(0, -1)).toEqual(buildTurnPrompt(turn(opening, 'I wait.')).messages.slice(0, -1));
        expect(closingParts(prompt).userText).toContain('Continue the story from exactly where it stands');
    });

    it('gives Suggested replies and Write for me the same opening as the turn, history included', () => {
        const history: PromptHistoryMessage[] = [...opening, { role: 'user', text: 'I wait.' }, { role: 'assistant', text: '@Mira: Fine. Come up.' }];
        const next = buildTurnPrompt(turn(history, 'I climb.'));
        const shared = 1 + history.length;
        const suggestions = buildSuggestionsPrompt({ ...layers(), history });
        const writeForMe = buildWriteForMePrompt({ ...layers(), history, draft: '' });
        expect(suggestions.messages.slice(0, shared)).toEqual(next.messages.slice(0, shared));
        expect(writeForMe.messages.slice(0, shared)).toEqual(next.messages.slice(0, shared));
        for (const prompt of [suggestions, writeForMe]) {
            expect(prompt.messages.map((message) => message.role).filter((role) => role === 'system')).toHaveLength(1);
            expect(prompt.messages.at(-1)!.content.startsWith(PROMPT_LAYERS.scene)).toBe(true);
        }
        // The Narrator's past lines without stage directions, as the turn sends them.
        expect(suggestions.messages[1].content).toBe('@Mira: The lamp is out.');
    });
});

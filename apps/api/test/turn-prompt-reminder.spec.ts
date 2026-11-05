import { buildTurnPrompt, TurnPromptInput } from '../src/manager/chat/turn/prompt.js';
import { Pov, ReplyLength, Tense } from '../src/model/story/entities/story.entity.js';

function input(overrides: Partial<TurnPromptInput> = {}): TurnPromptInput {
    return {
        story: {
            setting: 'A grassland market.',
            pov: Pov.First,
            tense: Tense.Present,
            replyLength: ReplyLength.Medium,
            characters: [
                { name: 'Nara', appearance: 'Tall.', personality: 'Calm.', voice: 'Measured.', exampleLines: [], background: '', secrets: '' },
                { name: 'Dulcie', appearance: 'Blond.', personality: 'Sly.', voice: 'Teasing.', exampleLines: [], background: '', secrets: '' },
            ],
        },
        identity: { name: 'Petch', description: 'A traveller.' },
        scene: { name: 'The milk stall', situation: 'Morning at the stall.', moveOnCondition: '' },
        bonds: [],
        arcs: [],
        memories: [],
        history: [{ role: 'assistant', text: '@Nara: Taste it.' }],
        userText: 'I drink.',
        ...overrides,
    };
}

describe('Turn prompt: the gender rule and the reminder near the end', () => {
    it("tells the Narrator never to guess the worn identity's gender", () => {
        const system = buildTurnPrompt(input()).messages[0].content;
        expect(system).toContain("Never guess Petch's gender.");
        expect(system).toContain("earlier narration and Characters' lines do not count, even where they guessed");
        expect(system).toContain('never "he", "she", "boy", "girl", "man", "woman", "sir" or "miss"');
    });

    it('ends on a reminder of the Scene, who is in the latest exchange and the point of view, then the final instruction', () => {
        const last = buildTurnPrompt(input({ present: ['Nara', 'Dulcie'] })).messages.at(-1)!;
        expect(last).toEqual({
            role: 'system',
            content:
                'Where things stand: Scene: The milk stall. In the latest exchange: Nara, Dulcie. Narrate in first person as Petch ("I"), present tense, and keep each Character as their card describes. ' +
                "Gender Petch only as their description or the user's own messages do, whatever earlier turns said.\n" +
                'Write the next turn now. Do not write anything Petch says, thinks or does. Use @Name: lines for Character speech.',
        });
    });

    it('says free play with no Scene, and names nobody when nobody is known to be present', () => {
        const last = buildTurnPrompt(input({ scene: null })).messages.at(-1)!.content;
        expect(last.startsWith('Where things stand: No Scene: the story unfolds freely. Narrate in first person as Petch')).toBe(true);
        expect(last).not.toContain('In the latest exchange');
    });
});

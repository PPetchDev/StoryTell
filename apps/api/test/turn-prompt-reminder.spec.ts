import { buildTurnPrompt, TurnPromptInput } from '../src/manager/chat/turn/prompt.js';
import { layersOf, trailingOf } from './harness/prompt-layers.js';
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
    it('lets Characters act on their desires unasked and writes sexual moments out in full', () => {
        const system = buildTurnPrompt(input()).messages[0].content;
        expect(system).toContain('Characters act on their desires as their personality and feelings would, without waiting to be asked');
        expect(system).toContain("makes advances when the moment allows, and takes Petch's response as the answer");
        expect(system).toContain('write it out explicitly and in sensory detail, at the pace of the scene; never summarise it, skip ahead or cut away');
    });

    it('tells the Narrator not to hurry a Scene toward its move-on condition', () => {
        const system = layersOf(
            buildTurnPrompt(input({ scene: { name: 'The milk stall', situation: 'Morning at the stall.', moveOnCondition: 'Nara sells ten jugs.' } })),
        );
        expect(system).toContain('This Scene moves on once: Nara sells ten jugs. Let that happen naturally; never force it.');
        expect(system).toContain("Don't hurry toward it: give the Scene room for many exchanges");
    });

    it("tells the Narrator never to guess the worn identity's gender", () => {
        const system = buildTurnPrompt(input()).messages[0].content;
        expect(system).toContain("Never guess Petch's gender.");
        expect(system).toContain("earlier narration and Characters' lines do not count, even where they guessed");
        expect(system).toContain('never "he", "she", "boy", "girl", "man", "woman", "sir" or "miss"');
    });

    it('keeps speech to spoken words, actions in narration, and asks for fresh, natural dialogue from one or two speakers', () => {
        const system = buildTurnPrompt(input()).messages[0].content;
        expect(system).toContain('# Dialogue');
        expect(system).toContain("Each Character's speech on lines starting with \"@Name:\"");
        expect(system).not.toContain('speech and small actions');
        expect(system).toContain('Never put stage directions, parentheses, *asterisk actions* or narration ("She leans on the fence.") inside it');
        expect(system).toContain('goes in a short narration line before or after the speech');
        expect(system).toContain("never copy the card's descriptive words into the story as labels");
        expect(system).toContain("Don't repeat the same details turn after turn");
        expect(system).toContain('stammering only for a Character whose Voice calls for them');
        expect(system).toContain('Most turns, one or two Characters speak');
    });

    it('sends earlier replies without stage directions in their speech lines, and leaves narration and the user alone', () => {
        const history = [
            { role: 'user' as const, text: '*(I wave)* Hello?' },
            {
                role: 'assistant' as const,
                text:
                    'The stall is busy *(as ever)*.\n\n' +
                    '@Nara: *(setting down a jug, unhurried)* Morning. *(a sly grin)* Two jugs or three?\n\n' +
                    '@Tavri: *(whispering)* Um. Hi.',
            },
        ];
        const messages = buildTurnPrompt(input({ history })).messages;
        expect(messages[1]).toEqual({ role: 'user', content: '*(I wave)* Hello?' });
        expect(messages[2]).toEqual({
            role: 'assistant',
            content: 'The stall is busy *(as ever)*.\n\n@Nara: Morning. Two jugs or three?\n\n@Tavri: Um. Hi.',
        });
    });

    it('ends on a reminder of the Scene, who is in the latest exchange and the point of view, then the final instruction', () => {
        const last = { content: trailingOf(buildTurnPrompt(input({ present: ['Nara', 'Dulcie'] }))) };
        expect(last).toEqual({
            content:
                'Where things stand: Scene: The milk stall. In the latest exchange: Nara, Dulcie. Narrate in first person as Petch ("I"), present tense, and keep each Character as their card describes. ' +
                "Gender Petch only as their description or the user's own messages do, whatever earlier turns said.\n" +
                // How each Character present talks (.scratch/cache-and-voices/spec.md).
                'How each of them talks, whatever the others or earlier replies sound like:\n' +
                '- Nara: Measured.\n' +
                '- Dulcie: Teasing.\n' +
                "Each Character's comparisons and turns of phrase come from their own life: don't lend one Character's trade or images to another, or to the narration about them.\n" +
                'As they change and grow in the story, what they say changes, not how they talk: keep each one sounding like this in every line.\n' +
                'Write the next turn now. Do not write anything Petch says, thinks or does. Use @Name: lines for Character speech, spoken words only, with no quotation marks: no parentheses, *(stage directions)* or narration inside them, even where earlier turns had them. Actions go in narration. Keep the speech plain and natural, the way people actually talk. Say each thing once: no run of sentences that open with the same words, as in "I had a plan. I had stages. I had a sequence.", and no lists of three. When a moment turns sexual, stay in it and write it out explicitly: touch, skin, breath and sound, and how each Character\'s body answers what Petch does, at the pace of the scene; never summarise it, skip ahead or cut away. In such moments a Character says only a few words at a time, broken off by what they feel; the body carries the moment, not speeches about it.',
        });
    });

    it('says free play with no Scene, and names nobody when nobody is known to be present', () => {
        const last = trailingOf(buildTurnPrompt(input({ scene: null })));
        expect(last.startsWith('Where things stand: No Scene: the story unfolds freely. Narrate in first person as Petch')).toBe(true);
        expect(last).not.toContain('In the latest exchange');
    });
});

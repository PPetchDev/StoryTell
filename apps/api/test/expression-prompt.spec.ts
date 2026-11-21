import { EXPRESSION_LOOKS, expressionPrompt } from '../src/manager/expression/prompt.js';
import { EXPRESSION_EMOTIONS } from '../src/model/story/emotion.js';

const MIRA = { name: 'Mira', appearance: 'Tall, grey-green eyes, black hair tied back, a faint scar through one eyebrow.' };

// .scratch/expressions/spec.md, "The drawing prompt", as .scratch/stage-pictures/spec.md changed it.
describe('Expression drawing prompt', () => {
    it.each(EXPRESSION_EMOTIONS)('for %s, holds its description and the Character, keeps the figure upright, and changes only the face and the arms and hands', (emotion) => {
        const prompt = expressionPrompt(MIRA, emotion);

        expect(prompt).toContain(EXPRESSION_LOOKS[emotion]);
        expect(prompt).toContain('Mira');
        expect(prompt).toContain(MIRA.appearance);
        expect(prompt).toContain('adult');
        expect(prompt).toContain('Keep the same person, face shape, hair, body, every feature of the character, outfit, art style and full-body framing');
        expect(prompt).toContain('standing upright in a natural, relaxed, well-balanced pose, with the legs and feet as in the picture');
        expect(prompt).toContain('Change only the facial expression and the arms and hands');
        // A plain background, for the cut-out to take away.
        expect(prompt).toContain('Plain flat background');
    });

    it('gives every emotion a description of its own', () => {
        const looks = EXPRESSION_EMOTIONS.map((emotion) => EXPRESSION_LOOKS[emotion]);
        expect(new Set(looks).size).toBe(EXPRESSION_EMOTIONS.length);
        // Each names one gesture of the arms and hands, after the face.
        for (const look of looks) expect(look).toMatch(/; .*(hand|arms|finger)/);
        // No vague whole-body bending, which drew odd poses.
        for (const look of looks) expect(look).not.toMatch(/leaning|shoulders hunched|slumped/);
    });

    it('puts the edit before the Appearance, so a prompt cut to the model\'s limit keeps the edit', () => {
        const prompt = expressionPrompt({ name: 'Mira', appearance: 'x'.repeat(5_000) }, 'joy');
        expect(prompt.indexOf(EXPRESSION_LOOKS.joy)).toBeLessThan(prompt.indexOf('x'.repeat(100)));
        expect(prompt.indexOf(EXPRESSION_LOOKS.joy)).toBeLessThan(1_000);
    });

    it('still names an adult when the Character has no name', () => {
        expect(expressionPrompt({ name: ' ', appearance: 'Short.' }, 'fear')).toContain('this adult character');
    });
});

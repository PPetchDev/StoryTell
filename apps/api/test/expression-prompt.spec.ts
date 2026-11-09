import { EXPRESSION_LOOKS, expressionPrompt } from '../src/manager/expression/prompt.js';
import { EXPRESSION_EMOTIONS } from '../src/model/story/emotion.js';

const MIRA = { name: 'Mira', appearance: 'Tall, grey-green eyes, black hair tied back, a faint scar through one eyebrow.' };

// .scratch/expressions/spec.md, "The drawing prompt".
describe('Expression drawing prompt', () => {
    it.each(EXPRESSION_EMOTIONS)('for %s, holds its description and the Character, and keeps everything but the face and pose', (emotion) => {
        const prompt = expressionPrompt(MIRA, emotion);

        expect(prompt).toContain(EXPRESSION_LOOKS[emotion]);
        expect(prompt).toContain('Mira');
        expect(prompt).toContain(MIRA.appearance);
        expect(prompt).toContain('adult');
        expect(prompt).toContain('Keep the same person, face, hair, body, outfit, framing, background and art style');
        expect(prompt).toContain('Change only the facial expression and body language');
    });

    it('gives every emotion a description of its own', () => {
        const looks = EXPRESSION_EMOTIONS.map((emotion) => EXPRESSION_LOOKS[emotion]);
        expect(new Set(looks).size).toBe(7);
        expect(EXPRESSION_LOOKS.embarrassment).toBe('blushing deeply, eyes glancing away, a shy, awkward smile, shoulders drawn in');
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

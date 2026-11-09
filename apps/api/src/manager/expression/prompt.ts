import { ExpressionEmotion } from '../../model/story/emotion.js';

/**
 * How each emotion shows on a face and in a body (.scratch/expressions/spec.md, "The drawing
 * prompt"). The Judge's meanings are broader; these are what one picture can show.
 */
export const EXPRESSION_LOOKS: Record<ExpressionEmotion, string> = {
    joy: 'a wide, bright smile, eyes creased with laughter, head tipped up a little, shoulders loose and open',
    love: 'a soft, tender smile, a warm, lingering gaze, a faint flush on the cheeks, leaning slightly toward the viewer',
    embarrassment: 'blushing deeply, eyes glancing away, a shy, awkward smile, shoulders drawn in',
    sadness: 'eyes downcast and glistening, brows drawn up in the middle, the mouth turned down, shoulders slumped',
    anger: 'brows drawn hard together, eyes narrowed in a glare, jaw clenched, shoulders squared and tense',
    fear: 'eyes wide, brows raised and pinched, lips parted, shoulders hunched and tense, leaning back',
    surprise: 'eyes wide open, brows raised high, mouth open in a small gasp, head drawn back a little',
};

/**
 * The prompt that edits the Reference image (sent as the one input image) into one Expression:
 * the same adult person, framing and style, with only the face and body language changed. The
 * edit comes first and the Appearance last, so a prompt cut to the model's limit keeps the edit.
 */
export function expressionPrompt(character: { name: string; appearance: string }, emotion: ExpressionEmotion): string {
    const name = character.name.trim();
    const who = name === '' ? 'this adult character' : `${name}, an adult`;
    return [
        `Edit this picture of ${who}. Keep the same person, face, hair, body, outfit, framing, background and art style, ` +
            'exactly as in the picture. Change only the facial expression and body language, to show: ' +
            `${EXPRESSION_LOOKS[emotion]}. No text, no watermark, no other people.`,
        `Appearance to keep: ${character.appearance.trim()}`,
    ].join('\n');
}

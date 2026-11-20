import { FaceEmotion } from '../../model/story/emotion.js';

/**
 * How each emotion shows: the face, then one clear gesture of the arms and hands
 * (.scratch/stage-pictures/spec.md, "The drawing prompt"). The body stays upright and the legs stay
 * as drawn: a vague "shoulders hunched, leaning back" bent whole figures into odd poses, while one
 * named gesture reads at a glance, as a visual novel's sprites do. Checked on seedream-v5-pro-edit on
 * 2026-11-18 (fear). The Judge's meanings are broader; these are what one picture can show.
 */
export const EXPRESSION_LOOKS: Record<FaceEmotion, string> = {
    joy: 'a wide, bright smile with the eyes creased in laughter; both hands clasped together in front of the chest',
    love: 'a soft, tender smile and a warm, lingering gaze, a faint flush on the cheeks; one hand resting over the heart, head tilted a little',
    embarrassment: 'blushing deeply, eyes glancing away to one side, a shy small smile; one hand touching the cheek, the other arm relaxed at the side',
    sadness: 'eyes downcast and glistening, brows drawn up in the middle, the mouth turned down; arms wrapped loosely around the body, head bowed a little',
    anger: 'brows drawn hard together, eyes narrowed in a glare, jaw clenched; arms folded firmly across the chest',
    fear: 'eyes wide with fear, brows raised and pinched together, lips parted; both hands raised close to the chest with the fingers curled, shoulders lifted a little',
    surprise: 'eyes wide open, brows raised high, mouth open in a small gasp; one hand raised to cover the mouth',
    // Your faces only (.scratch/more-faces/spec.md).
    annoyed: 'an unimpressed, irritated look, brows lowered, eyes half-lidded, lips pressed flat in a small pout; both hands on the hips',
    thinking: 'a thoughtful look, eyes turned up and to one side, lips pursed a little; one hand under the chin, the other arm folded across the waist supporting the elbow',
    teasing: 'a sly half-smile, eyes narrowed playfully, one eyebrow raised; one fingertip resting on the lower lip, head tilted slightly',
    desire: 'heavy-lidded eyes looking straight at the viewer, deeply flushed cheeks, lips slightly parted; the fingertips of one hand tracing the collarbone, hips shifted a little to one side',
    flustered: 'flushed bright red, breathing quickly, eyes glancing away; both hands gripping the hem of the clothing, arms drawn in close to the body',
    longing: 'pleading, yearning eyes looking up at the viewer, lips trembling slightly; one hand reaching halfway out toward the viewer',
    passion: 'eyes closed or hazy, the whole face flushed, lips parted as if breathing hard; head tipped back a little, both hands clenched close to the chest',
    afterglow: 'a contented, satisfied smile, relaxed heavy-lidded eyes, hair a little tousled; shoulders loose and easy, one hand brushing the hair back',
};

/**
 * The prompt that edits the Reference image (sent as the one input image) into one Expression:
 * the same adult person, outfit, style and full-body framing, standing upright, with the face and
 * the arms and hands changed. The edit comes first and the Appearance last, so a prompt cut to the
 * model's limit keeps the edit.
 */
export function expressionPrompt(character: { name: string; appearance: string }, emotion: FaceEmotion): string {
    const name = character.name.trim();
    const who = name === '' ? 'this adult character' : `${name}, an adult`;
    return [
        `Edit this picture of ${who}. Keep the same person, face shape, hair, body, every feature of the character, outfit, art style and full-body framing. ` +
            'Keep the figure standing upright in a natural, relaxed, well-balanced pose, with the legs and feet as in the picture. ' +
            `Change only the facial expression and the arms and hands, to show: ${EXPRESSION_LOOKS[emotion]}. Natural, anatomically correct hands. ` +
            'Plain flat background in the same colour. No text, no watermark, no other people.',
        // The Role and a Persona have no Appearance (.scratch/your-faces/spec.md): their picture alone shows it.
        ...(character.appearance.trim() ? [`Appearance to keep: ${character.appearance.trim()}`] : []),
    ].join('\n');
}

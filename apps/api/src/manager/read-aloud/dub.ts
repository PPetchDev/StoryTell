import type { PromptMessage } from '../../service/model-gateway/model-gateway.js';
import type { Emotion } from '../../model/story/emotion.js';

/**
 * A Japanese dub (.scratch/japanese-dub/spec.md). The Message's text stays English on screen;
 * its queue is translated into spoken Japanese in one background call (`dub_translation`), kept
 * beside its audio, and read:
 * - a Character's words in Qwen 3, in their Japanese voice, with a style prompt from the emotion
 *   the Judge tagged the line with;
 * - narration and actions in a Japanese Kokoro voice, plainly.
 */

/** How each emotion is said, as Qwen 3's style prompt. Neutral and untagged lines are said warmly and naturally. */
export const EMOTION_DELIVERY: Record<Emotion, string> = {
    neutral: 'Natural and warm, conversational.',
    joy: 'Happy and bright, smiling as she speaks.',
    love: 'Tender and affectionate, soft and warm.',
    embarrassment: 'Shy and embarrassed, a little hesitant, quieter.',
    sadness: 'Sad and quiet, slow, the voice close to breaking.',
    anger: 'Angry and sharp, clipped and forceful.',
    fear: 'Frightened and tense, quick, a little shaky.',
    surprise: 'Surprised, the voice rising, a quick gasp.',
    annoyed: 'Annoyed and exasperated, flat and clipped, a little huffy.',
    thinking: 'Thoughtful and musing, slow, pausing as she thinks.',
    smug: 'Smug and sly, a knowing smile in the voice, unhurried.',
    determined: 'Determined and firm, steady and resolute.',
    worried: 'Worried and uneasy, soft, a little tense.',
    hurt: 'In pain, strained and breathless, through gritted teeth.',
    tired: 'Tired and sleepy, slow and drowsy, trailing off.',
    proud: 'Proud and confident, bright and assured.',
    teasing: 'Playful and teasing, a soft warm smile in the voice, a little breathy and affectionate.',
    desire: 'Low and sultry, slow and breathy, intimate.',
    flustered: 'Flustered and breathless, shy, the words tumbling out.',
    longing: 'Yearning and pleading, soft and aching.',
    passion: 'Breathless and overwhelmed, trembling, intimate.',
    afterglow: 'Relaxed and content, slow, a sleepy, satisfied warmth.',
};

/** The Qwen 3 style prompt for a line's emotion. */
export function deliveryFor(emotion: Emotion | null): string {
    return EMOTION_DELIVERY[emotion ?? 'neutral'];
}

/** One queue item to translate: what it says, and who says it (null for narration or an action). */
export interface DubSource {
    text: string;
    speaker: string | null;
}

export const DUB_TRANSLATION_MAX_TOKENS = 4000;

/**
 * The translation call: every item of a Message in one numbered list, so each line keeps its
 * speaker's voice and the whole stays one scene. Outside the story: the play layers are not sent.
 */
export function buildDubTranslationPrompt(items: readonly DubSource[]): { messages: PromptMessage[]; maxTokens: number } {
    const system = `You dub an interactive story into Japanese, as for an anime. Translate each numbered item into natural, spoken Japanese, faithful to its meaning, tone and explicitness: no softening, no notes, nothing added or left out.
- An item with a speaker is that character's spoken line: make it sound like them, in natural spoken Japanese (casual or polite as fits who they are and who they speak to). Every character is an adult.
- An item without a speaker is narration or an action: plain, natural literary Japanese, in the third person.
- Keep names as they are, in katakana. No romaji, no furigana, no quotation marks around a spoken line.
Answer with JSON only: {"lines": ["...", "..."]}, one string per item, in order, exactly as many as there are items.`;
    const user = items.map((item, index) => `${index + 1}. ${item.speaker ? `[${item.speaker}] ` : ''}${item.text}`).join('\n');
    return {
        messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
        ],
        maxTokens: DUB_TRANSLATION_MAX_TOKENS,
    };
}

/** The translated lines, or null when the answer is not one string per item. */
export function readDubTranslation(text: string, count: number): string[] | null {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
        const lines = (JSON.parse(text.slice(start, end + 1)) as { lines?: unknown }).lines;
        if (!Array.isArray(lines) || lines.length !== count) return null;
        const out = lines.map((line) => (typeof line === 'string' ? line.trim() : ''));
        return out.every((line) => line !== '') ? out : null;
    } catch {
        return null;
    }
}

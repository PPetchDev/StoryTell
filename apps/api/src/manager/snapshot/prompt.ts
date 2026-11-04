import { UnparseableOutputError } from '../../errors/model-gateway.errors.js';
import { MAX_REFERENCE_IMAGES, PromptMessage } from '../../service/model-gateway/model-gateway.js';
import { DEFAULT_IMAGE_STYLE } from '../reference-image/prompt.js';

/**
 * The Snapshot's two prompts (spec: "Snapshot flow"). Pure logic over plain inputs: the
 * manager gathers them. A V4 Flash call writes the scene and picks who is in frame; the
 * image prompt is then put together here, so the rules that must always hold (first person,
 * at most 3 Characters, fictional adults, every in-frame Character's Appearance restated)
 * never depend on the small model remembering them.
 */

/** Spec: "showing at most 3 Characters", one Reference image each. */
export const MAX_IN_FRAME = MAX_REFERENCE_IMAGES;
/** How many of the latest Messages, up to the one the camera acts on, the scene is written from. */
export const SNAPSHOT_RECENT_MESSAGES = 6;
export const SNAPSHOT_PROMPT_MAX_TOKENS = 600;

export interface SnapshotCastMember {
    name: string;
    appearance: string;
}

export interface SnapshotPromptInput {
    /** The worn identity: whose eyes the camera is. Its description is the only user detail there is. */
    identity: { name: string; description: string };
    setting: string;
    cast: SnapshotCastMember[];
    /** Non-archived Memories with `{user}` already rendered. */
    memories: string[];
    /** Oldest first, ending with the Message the camera acts on. */
    messages: Array<{ speaker: string; text: string }>;
    hint: string;
    /** The Characters the hint names; when there are any, exactly they are in frame. */
    hintNames: string[];
}

export function snapshotPromptMessages(input: SnapshotPromptInput): PromptMessage[] {
    const name = input.identity.name;
    const system = `You write the scene for one image of the latest moment of an interactive story. The image is seen through the eyes of ${name}, the character the user plays.

Rules:
- First person: the camera is ${name}'s eyes. Never show ${name}: at most a glimpse at the edge of the frame, such as hands, forearms or sleeves.
- Pick who is in frame: at most ${MAX_IN_FRAME} of the listed Characters, only ones present at this moment, by their exact names. An empty list is fine for a place with nobody in it.
- Everyone shown is a fictional adult.
- Describe the moment concretely: the place, the light, each Character's pose, expression and action, and what each one is wearing right now. Always name the clothing; take it from the story so far, else from the Appearance.
- Lasting changes from the story (a new scar, a haircut) override the Appearance: mention them.
- Do not describe the art style or quote dialogue; the style is added separately, and the image has no text or captions.

Reply with JSON only:
{"in_frame":["Name"],"scene":"one paragraph of at most 120 words"}`;

    const sections = [
        `Setting:\n${input.setting.trim() || '(none)'}`,
        `Characters:\n${input.cast.map((member) => `- ${member.name}: ${member.appearance.trim() || '(no Appearance written)'}`).join('\n')}`,
        `${name} (never shown beyond glimpses): ${input.identity.description.trim() || '(no description)'}`,
        `Memory:\n${input.memories.length > 0 ? input.memories.map((text) => `- ${text}`).join('\n') : '(none)'}`,
        `The latest Messages, oldest first; the image shows the end of the last one:\n${input.messages.map((message) => `[${message.speaker}]\n${message.text}`).join('\n\n')}`,
    ];
    if (input.hint.trim() !== '') {
        sections.push(`The user's hint for this image, which you follow: ${input.hint.trim()}`);
    }
    if (input.hintNames.length > 0) {
        sections.push(`The hint names who is in frame: "in_frame" must be exactly ${JSON.stringify(input.hintNames)}.`);
    }
    return [
        { role: 'system', content: system },
        { role: 'user', content: sections.join('\n\n') },
    ];
}

export interface SnapshotScene {
    inFrame: string[];
    scene: string;
}

/** Reads the prompt writer's JSON. Throws `UnparseableOutputError` when there is no scene to draw. */
export function parseSnapshotScene(text: string): SnapshotScene {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new UnparseableOutputError('The Snapshot prompt writer wrote no JSON object.');
    let json: unknown;
    try {
        json = JSON.parse(match[0]);
    } catch (error) {
        throw new UnparseableOutputError(`The Snapshot prompt's JSON could not be read: ${(error as Error).message}`);
    }
    const record = typeof json === 'object' && json !== null ? (json as Record<string, unknown>) : {};
    const scene = typeof record.scene === 'string' ? record.scene.trim() : '';
    if (scene === '') throw new UnparseableOutputError('The Snapshot prompt writer wrote no scene.');
    const inFrame = Array.isArray(record.in_frame)
        ? record.in_frame.filter((name): name is string => typeof name === 'string' && name.trim() !== '').map((name) => name.trim())
        : [];
    return { inFrame, scene };
}

const fold = (name: string) => name.trim().toLocaleLowerCase();

/** The cast's names the hint mentions as whole words, in the order the hint mentions them. */
export function namesInHint(hint: string, cast: SnapshotCastMember[]): string[] {
    const found: Array<{ name: string; at: number }> = [];
    for (const member of cast) {
        const name = member.name.trim();
        if (name === '') continue;
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const at = hint.search(new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'iu'));
        if (at >= 0) found.push({ name, at });
    }
    return found.sort((a, b) => a.at - b.at).map((entry) => entry.name);
}

/**
 * Who is drawn: the hint's names when it gives any (spec: "using the hint's names if it gives
 * any"), else the writer's pick. Names outside the cast are dropped, and at most MAX_IN_FRAME stay.
 */
export function pickInFrame<T extends SnapshotCastMember>(cast: T[], written: string[], hintNames: string[]): T[] {
    const picked: T[] = [];
    for (const name of hintNames.length > 0 ? hintNames : written) {
        const member = cast.find((candidate) => fold(candidate.name) === fold(name));
        if (member && !picked.includes(member)) picked.push(member);
    }
    return picked.slice(0, MAX_IN_FRAME);
}

export interface InFrameCharacter extends SnapshotCastMember {
    /** 1-based position among the reference images sent; null for a Character drawn from text alone. */
    referenceImage: number | null;
}

/**
 * The image model's prompt. Ticket 18 found that traits left out of the prompt drift (eye
 * colour, in the anime style), so every in-frame Character's Appearance is restated here.
 */
export function snapshotImagePrompt(input: {
    identityName: string;
    scene: string;
    imageStyle: string;
    inFrame: InFrameCharacter[];
}): string {
    const style = input.imageStyle.trim() === '' ? DEFAULT_IMAGE_STYLE : input.imageStyle.trim();
    const lines = [
        `First-person view through the eyes of ${input.identityName}, who is never shown: at most a glimpse of hands or sleeves at the edge of the frame. ` +
            `The camera is at ${input.identityName}'s eyes, so no head, hair, back or shoulder of ${input.identityName} is in the foreground.`,
        input.scene,
    ];
    if (input.inFrame.length === 0) {
        lines.push('Nobody else is in frame.');
    } else {
        lines.push(
            `In frame, and nobody else (fictional adults, each drawn exactly as described; where the scene above names a lasting change or clothing, the scene wins):`,
            ...input.inFrame.map((character) => {
                const source =
                    character.referenceImage === null
                        ? ''
                        : `, the same person as in reference image ${character.referenceImage}, with the same face, build and art style`;
                return `- ${character.name}${source}. Appearance: ${character.appearance.trim()}`;
            }),
        );
    }
    lines.push(`Art style: ${style}.`, 'Only fictional adults. No text, no captions, no watermark.');
    return lines.join('\n');
}

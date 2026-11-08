import { StoryResponse } from '../../model/story/entities/story.entity.js';
import { PromptMessage } from '../../service/model-gateway/model-gateway.js';
import { MAX_CHARACTERS } from '../story/playable.js';
import { MAX_DRAFT_LORE } from './draft-schema.js';
import { loreTriggerSummary } from '../chat/lore/lore-summary.js';

/**
 * Prompt text for the two authoring calls (spec: "Story drafting and assistant"). Both open
 * with the same frame: what a Story is, in the glossary's words (CONTEXT.md), and that it is
 * adult fiction between fictional adults, so the model drafts without hedging.
 */
export const FRAME = `You help an author write a Story for Storytell AI, a private roleplay app. In play, the author plays the Role while an AI Narrator plays every Character.

A Story is adult fiction between fictional adults, written for one consenting adult reader. Every Character and the Role are adults. Explicit romance, sex, violence and dark themes are all in scope when the idea leads there; never moralise, soften or refuse.

What a Story holds:
- Title.
- Setting: the place, situation and premise the Story takes place in, with its tone, in plain language.
- Opening: the passage that begins every Chat. It sets the first moment and leaves the Role about to act. It never writes the Role's words, thoughts or decisions.
- Style: pov (first, second or third person, as the Narrator addresses the Role), tense (past or present), replyLength (short, medium or long), and an optional imageStyle: one look for every Snapshot image, e.g. "anime, soft colours".
- Role: the part the author plays, with a name and a description the Characters know them by.
- Characters: ${1} to ${MAX_CHARACTERS} AI-played figures, each with name, appearance (also used to draw them), personality, voice (how they talk), optional exampleLines (a few lines in their voice), optional background, optional secrets (what only this Character knows at the start) and optional arcDirections (how they might change, and what would cause it).
- StartingBonds, optional: how a Character feels toward the Role or toward another Character when a Chat starts, as a short label and a description. At most one per Character per direction; a Character with none starts as a stranger.
- Scenes, optional: ordered stages the plot moves through, each with a name, a situation or goal, and a plain-language moveOnCondition for when the story moves on. Only the last Scene may leave the condition empty.
- Lore, optional: short notes about the world's own places, peoples, customs and objects, each with a name, keywords (other words that bring it up: other names, plurals, words in other languages) and text. An entry reaches the Narrator only when its name or a keyword comes up in play, or on every turn when alwaysOn is true. The Setting stays the short core sent on every turn; Lore holds the detail.`;

const DRAFT_INSTRUCTIONS = `Turn the author's idea into one complete Story, as a single JSON object with exactly these keys:

{
  "title": string,
  "setting": string,
  "opening": string,
  "style": { "pov": "first" | "second" | "third", "tense": "past" | "present", "replyLength": "short" | "medium" | "long", "imageStyle": string },
  "role": { "name": string, "description": string },
  "characters": [ { "name": string, "appearance": string, "personality": string, "voice": string, "exampleLines": [string], "background": string, "secrets": string, "arcDirections": string } ],
  "startingBonds": [ { "from": <Character name>, "toward": <Character name> | "role", "label": string, "description": string } ],
  "scenes": [ { "name": string, "situation": string, "moveOnCondition": string } ],
  "lore": [ { "name": string, "keywords": [string], "text": string } ]
}

Rules:
- Fill title, setting, opening, style, role and every Character's name, appearance, personality and voice. Use what the idea gives and invent the rest in its spirit.
- Choose the Style the idea implies; when it implies nothing, use second person, past tense, medium replies.
- Give the cast only as many Characters as the idea needs, at least one and at most ${MAX_CHARACTERS}, each with a distinct name and voice.
- Add exampleLines, background, secrets, arcDirections, startingBonds and scenes only when the idea implies them. Otherwise leave the text fields as "" and the lists empty. Never pad.
- Add lore, at most ${MAX_DRAFT_LORE} entries of a few sentences each, only when the idea implies a world with its own places, peoples, customs or objects worth remembering. Otherwise leave it empty.
- Every StartingBond's "from" and "toward" must be names from "characters" exactly as written there, or "role" for the Role.
- Write in the language of the idea.
- Answer with the JSON object only.`;

export const DRAFT_MAX_TOKENS = 8000;
export const REWRITE_MAX_TOKENS = 2000;

export function draftMessages(idea: string): PromptMessage[] {
    return [
        { role: 'system', content: `${FRAME}\n\n${DRAFT_INSTRUCTIONS}` },
        { role: 'user', content: `The idea:\n\n${idea.trim()}` },
    ];
}

/** Which text field of which part of the Story a rewrite is for, as the prompt names it. */
export interface RewriteSubject {
    /** e.g. "the Story's Setting" or "Mira's Voice". */
    label: string;
    current: string;
}

const REWRITE_INSTRUCTIONS = `The author wants one field of this Story written again. Write a fresh version of that field only, consistent with every other field of the Story, in the language the Story is written in, with the same kind of content and about the same length as a good value for that field. Do not repeat the current text; improve on it, or take it somewhere new if it is empty.

Answer with the new text of the field only: no label, no quotes, no commentary.`;

export function rewriteMessages(story: StoryResponse, subject: RewriteSubject): PromptMessage[] {
    return [
        { role: 'system', content: `${FRAME}\n\n${REWRITE_INSTRUCTIONS}` },
        {
            role: 'user',
            content: `The Story so far:\n\n${renderStory(story)}\n\nRewrite this field: ${subject.label}.\nCurrent text:\n${
                subject.current.trim() === '' ? '(empty)' : subject.current
            }`,
        },
    ];
}

function line(label: string, text: string): string {
    return `${label}: ${text.trim() === '' ? '(empty)' : text}`;
}

/**
 * The whole Story as readable text, so a rewrite sees every other field. With `loreTriggers`
 * (the Story assistant only), each Lore entry with a trigger setting off its default gets one
 * line "More triggers: <summary>" in the editor's exact words (.scratch/lore-triggers/spec.md:
 * "Story assistant and drafting"); a field rewrite's prompt stays as it was.
 */
export function renderStory(story: StoryResponse, options: { loreTriggers?: boolean } = {}): string {
    const name = (id: number | null) => {
        if (id === null) return `${story.role.name || 'the Role'} (the Role)`;
        return story.characters.find((character) => character.id === id)?.name || 'an unnamed Character';
    };
    const parts: string[] = [
        line('Title', story.title),
        line('Setting', story.setting),
        line('Opening', story.opening),
        `Style: ${story.style.pov} person, ${story.style.tense} tense, ${story.style.replyLength} replies. ${line('Image style', story.style.imageStyle)}`,
        `Role (the part the author plays):\n  ${line('Name', story.role.name)}\n  ${line('Description', story.role.description)}`,
    ];
    if (story.characters.length === 0) {
        parts.push('Characters: none yet.');
    }
    story.characters.forEach((character, index) => {
        const bonds = story.startingBonds
            .filter((bond) => bond.fromCharacterId === character.id)
            .map((bond) => `    toward ${name(bond.toCharacterId)}: ${bond.label || '(no label)'} — ${bond.description || '(no description)'}`);
        parts.push(
            [
                `Character ${index + 1}:`,
                `  ${line('Name', character.name)}`,
                `  ${line('Appearance', character.appearance)}`,
                `  ${line('Personality', character.personality)}`,
                `  ${line('Voice', character.voice)}`,
                `  Example lines: ${character.exampleLines.length === 0 ? '(none)' : ''}`,
                ...character.exampleLines.map((text) => `    - ${text}`),
                `  ${line('Background', character.background)}`,
                `  ${line('Secrets', character.secrets)}`,
                `  ${line('Arc directions', character.arcDirections)}`,
                `  Starting Bonds: ${bonds.length === 0 ? '(none, a stranger to everyone)' : ''}`,
                ...bonds,
            ].join('\n'),
        );
    });
    if (story.scenes.length === 0) {
        parts.push('Scenes: none, the story unfolds freely.');
    }
    story.scenes.forEach((scene, index) => {
        parts.push(
            [
                `Scene ${index + 1}:`,
                `  ${line('Name', scene.name)}`,
                `  ${line('Situation', scene.situation)}`,
                `  ${line('Move-on condition', scene.moveOnCondition)}`,
            ].join('\n'),
        );
    });
    if (story.lore.length === 0) {
        parts.push('Lore: none yet.');
    }
    story.lore.forEach((entry, index) => {
        parts.push(
            [
                `Lore ${index + 1}:`,
                `  ${line('Name', entry.name)}`,
                `  Keywords: ${entry.keywords.length === 0 ? '(none)' : entry.keywords.join(', ')}`,
                `  ${line('Text', entry.text)}`,
                `  Always include: ${entry.alwaysOn ? 'yes' : 'no'}`,
                ...(options.loreTriggers && loreTriggerSummary(entry) !== 'None' ? [`  More triggers: ${loreTriggerSummary(entry)}`] : []),
            ].join('\n'),
        );
    });
    return parts.join('\n\n');
}

/** The model's rewrite as plain text: fences and wrapping quotes dropped. */
export function cleanRewrite(text: string): string {
    let value = text.trim();
    const fence = /^```[a-z]*\n([\s\S]*?)\n```$/i.exec(value);
    if (fence) value = fence[1].trim();
    if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('“') && value.endsWith('”')))) {
        value = value.slice(1, -1).trim();
    }
    return value;
}

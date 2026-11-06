import { StoryResponse } from '../../model/story/entities/story.entity.js';
import { PromptMessage } from '../../service/model-gateway/model-gateway.js';
import { FRAME, renderStory } from '../story-drafting/prompts.js';
import { MAX_CHARACTERS } from '../story/playable.js';

/**
 * Prompt text for the `story_assistant` call (spec: "Story assistant"). It shares the
 * drafting frame (what a Story is, in the glossary's words, and that it is adult fiction
 * between fictional adults) and the same rendering of the whole Story; the call is stateless,
 * so the Story and the one instruction are all the model ever sees.
 */
const ASSISTANT_INSTRUCTIONS = `The author gives you one instruction about this Story. Carry it out as a set of field changes, answered as a single JSON object:

{
  "reply": string,
  "changes": [ <change>, ... ]
}

"reply" is one or two sentences to the author: what you changed, or why there was nothing to change.

Each <change> is one of:
- { "op": "set", "target": "story", "field": "title" | "setting" | "opening" | "imageStyle" | "pov" | "tense" | "replyLength", "value": string }
  pov is "first", "second" or "third"; tense "past" or "present"; replyLength "short", "medium" or "long".
- { "op": "set", "target": "role", "field": "name" | "description", "value": string }
- { "op": "set", "target": "character", "name": <Character name>, "field": "name" | "appearance" | "personality" | "voice" | "background" | "secrets" | "arcDirections", "value": string }
- { "op": "set", "target": "character", "name": <Character name>, "field": "exampleLines", "value": [string] } (the whole list)
- { "op": "set", "target": "scene", "name": <Scene name>, "field": "name" | "situation" | "moveOnCondition", "value": string }
- { "op": "set", "target": "startingBond", "from": <Character name>, "toward": <Character name> | "role", "field": "label" | "description", "value": string }
- { "op": "add", "target": "character", "value": { "name": string, "appearance": string, "personality": string, "voice": string, "exampleLines": [string], "background": string, "secrets": string, "arcDirections": string } }
- { "op": "add", "target": "scene", "value": { "name": string, "situation": string, "moveOnCondition": string } }
- { "op": "add", "target": "startingBond", "value": { "from": <Character name>, "toward": <Character name> | "role", "label": string, "description": string } }
- { "op": "set", "target": "lore", "name": <Lore name>, "field": "name" | "text", "value": string }
- { "op": "set", "target": "lore", "name": <Lore name>, "field": "keywords", "value": [string] } (the whole list)
- { "op": "set", "target": "lore", "name": <Lore name>, "field": "alwaysOn", "value": true | false }
- { "op": "add", "target": "lore", "value": { "name": string, "keywords": [string], "text": string, "alwaysOn": boolean } }
- { "op": "remove", "target": "character" | "scene" | "lore", "name": <name> }
- { "op": "remove", "target": "startingBond", "from": <Character name>, "toward": <Character name> | "role" }

Rules:
- Change only what the instruction asks for, plus what it makes necessary: a new sister needs a new Character, and "add Scenes" needs Scenes that fit the Setting. Leave every other field alone and never restate an unchanged field.
- A set replaces the whole field: write the complete new text, in the language the Story is written in, in keeping with the rest of the Story.
- Name Characters and Scenes exactly as the Story writes them. An unnamed one is "Character 2" or "Scene 3", by its number in the Story.
- A new Character needs name, appearance, personality and voice; leave its optional fields as "" or [] unless the instruction implies them. A new Character may have StartingBonds, added as separate changes that name it.
- The cast holds at most ${MAX_CHARACTERS} Characters. When there is no room, say so in the reply instead of adding one.
- Only the last Scene may leave moveOnCondition empty. When you add Scenes after the last one, also set the former last Scene's moveOnCondition if it is empty.
- Lore holds the world's detail; the Setting stays its short core. A Lore entry needs a name and text. Give it keywords for the other ways the story may mention it (other names, plurals, Thai or other-language words); its name already counts. Set alwaysOn only for what matters on every turn. To move detail from the Setting into Lore, set the Setting to its short core and add an entry for each place, people, custom or object taken out.
- Name Lore entries exactly as the Story writes them, or "Lore 2" by number.
- Remove a Character, Scene or Lore entry only when the instruction asks for it.
- When the instruction is a question, or asks for nothing you can change, answer it in "reply" with an empty "changes" list.
- Answer with the JSON object only.`;

export const ASSISTANT_MAX_TOKENS = 8000;

export function assistantMessages(story: StoryResponse, instruction: string): PromptMessage[] {
    return [
        { role: 'system', content: `${FRAME}\n\n${ASSISTANT_INSTRUCTIONS}` },
        {
            role: 'user',
            content: `The Story now:\n\n${renderStory(story)}\n\nThe author's instruction:\n${instruction.trim()}`,
        },
    ];
}

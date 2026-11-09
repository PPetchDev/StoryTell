import { Backdrop, StoryResponse } from '../../model/story/entities/story.entity.js';
import { SELECTIVE_LOGIC } from './card-mapping.js';

/**
 * The card writer (spec: "Exporting a card"): a Story and one of its Characters to the V2 and
 * V3 card JSON. Pure. Every text has the Role's name, as a whole word, written as `{{user}}`,
 * so another app's user sees their own name. Never written: ids, Chats, Memories, Bonds,
 * Scenes, Starting Bonds, Snapshots, Documents, Expressions, Saved replies, Replace rules. Storytell's
 * own block carries the voices and the Backdrop choice, each only when it isn't the default.
 */

type Character = StoryResponse['characters'][number];

export const EXPORT_CREATOR_NOTES = 'Exported from Storytell AI.';

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The Role's name, as a whole word, written as `{{user}}`; a name inside a longer word is left. */
export function userMacro(text: string, roleName: string): string {
    const name = roleName.trim();
    if (name === '') return text;
    return text.replace(new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegExp(name)}(?![\\p{L}\\p{N}_])`, 'gu'), '{{user}}');
}

/** Appearance, Voice, Background and Secrets as labelled paragraphs, blanks left out. */
export function labelledDescription(character: Pick<Character, 'appearance' | 'voice' | 'background' | 'secrets'>): string {
    return (
        [
            ['Appearance', character.appearance],
            ['Voice', character.voice],
            ['Background', character.background],
            ['Secrets', character.secrets],
        ] as const
    )
        .filter(([, text]) => text.trim() !== '')
        .map(([label, text]) => `${label}: ${text.trim()}`)
        .join('\n\n');
}

/**
 * Each Example line as its own `<START>` block. Lines labelled with the Character's or the
 * Role's name keep those labels as `{{char}}:` / `{{user}}:`; an Example line with no labels
 * is the Character's, `{{char}}: <line>`.
 */
export function exampleBlocks(lines: string[], characterName: string, roleName: string): string {
    const label = (name: string) => (name.trim() === '' ? null : new RegExp(`^${escapeRegExp(name.trim())}\\s*:\\s*`, 'i'));
    const own = label(characterName);
    const user = label(roleName);
    return lines
        .map((line) => line.trim())
        .filter((line) => line !== '')
        .map((line) => {
            const rows = line.split('\n');
            const labelled = rows.some((row) => own?.test(row) || user?.test(row));
            const body = labelled
                ? rows
                      .map((row) => {
                          if (own?.test(row)) return `{{char}}: ${row.replace(own, '')}`;
                          if (user?.test(row)) return `{{user}}: ${row.replace(user, '')}`;
                          return row;
                      })
                      .join('\n')
                : `{{char}}: ${line}`;
            return `<START>\n${userMacro(body, roleName)}`;
        })
        .join('\n');
}

export interface CardDefinitions {
    v2: Record<string, unknown>;
    v3: Record<string, unknown>;
}

const unixSeconds = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);

export function writeCard(story: StoryResponse, character: Character): CardDefinitions {
    const role = story.role.name;
    const u = (text: string) => userMacro(text.trim(), role);
    const lore = story.lore.filter((entry) => entry.text.trim() !== '');
    // The Lore trigger settings go where SillyTavern reads them (card-mapping.ts reads them back):
    // Patterns as `/source/i` keys, second keywords as selective second keys, the rest in extensions.
    const entries = lore.map((entry, index) => ({
        keys: [
            ...[entry.name, ...entry.keywords].map((key) => key.trim()).filter((key) => key !== '').map(u),
            ...entry.patterns.map((source) => `/${source}/i`),
        ],
        secondary_keys: entry.secondaryKeywords.map(u),
        content: u(entry.text),
        extensions: {
            selectiveLogic: entry.secondaryMode === 'unless' ? SELECTIVE_LOGIC.notAny : SELECTIVE_LOGIC.andAny,
            sticky: entry.sticky,
            cooldown: entry.cooldown,
            delay: entry.delay,
            probability: entry.chance,
            useProbability: true,
            group: entry.group,
            exclude_recursion: !entry.recursable,
        },
        enabled: true,
        insertion_order: index,
        constant: entry.alwaysOn,
        selective: entry.secondaryKeywords.length > 0,
        name: u(entry.name),
        comment: u(entry.name),
    }));

    const data = {
        name: character.name,
        description: u(labelledDescription(character)),
        personality: u(character.personality),
        scenario: u(story.setting),
        first_mes: u(story.opening),
        mes_example: exampleBlocks(character.exampleLines, character.name, role),
        creator_notes: EXPORT_CREATOR_NOTES,
        system_prompt: '',
        post_history_instructions: '',
        alternate_greetings: [] as string[],
        tags: [] as string[],
        creator: '',
        character_version: '',
        ...(entries.length > 0 && { character_book: { name: story.title, entries, extensions: {} } }),
        extensions: {
            storytell: {
                version: 1,
                character: {
                    appearance: u(character.appearance),
                    personality: u(character.personality),
                    voice: u(character.voice),
                    exampleLines: character.exampleLines.map(u),
                    background: u(character.background),
                    secrets: u(character.secrets),
                    arcDirections: u(character.arcDirections),
                    // Ticket 06: written only when set, so another app's block stays as before.
                    ...(character.speakingVoice !== null && { speakingVoice: character.speakingVoice }),
                },
                role: { name: role, description: u(story.role.description) },
                style: {
                    pov: story.style.pov,
                    tense: story.style.tense,
                    replyLength: story.style.replyLength,
                    imageStyle: u(story.style.imageStyle),
                    ...(story.narrationVoice !== null && { narrationVoice: story.narrationVoice }),
                    ...(story.backdrop !== Backdrop.None && { backdrop: story.backdrop }),
                },
            },
        },
    };

    const v3Data = {
        ...data,
        nickname: '',
        group_only_greetings: [] as string[],
        creation_date: unixSeconds(story.createdAt),
        modification_date: unixSeconds(story.updatedAt),
        assets: [{ type: 'icon', uri: 'ccdefault:', name: 'main', ext: 'png' }],
        ...(entries.length > 0 && {
            character_book: { name: story.title, entries: entries.map((entry) => ({ ...entry, use_regex: false })), extensions: {} },
        }),
    };

    return {
        v2: { spec: 'chara_card_v2', spec_version: '2.0', data },
        v3: { spec: 'chara_card_v3', spec_version: '3.0', data: v3Data },
    };
}

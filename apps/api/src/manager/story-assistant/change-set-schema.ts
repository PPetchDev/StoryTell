import { InvalidChangeSetError, UnreadableChangeSetError } from '../../errors/story-drafting.errors.js';
import { CastFullError } from '../../errors/story.errors.js';
import { Pov, ReplyLength, StoryResponse, Tense } from '../../model/story/entities/story.entity.js';
import {
    DraftCharacter,
    DraftLore,
    DraftScene,
    isObject,
    Json,
    readJsonObject,
    validateDraftCharacter,
    validateDraftLore,
    validateDraftScene,
    MAX_LORE_KEYWORD_LENGTH,
    MAX_LORE_KEYWORDS,
} from '../story-drafting/draft-schema.js';
import { MAX_CHARACTERS } from '../story/playable.js';

/**
 * The structured set of field changes a `story_assistant` call answers (spec: "Story
 * assistant"), after validation against the Story it is for. The model names Characters,
 * Scenes and StartingBonds; the validated set holds their ids, so the client can echo it
 * back unchanged to confirm removals, and `apply` never has to resolve a name again. The one
 * exception is a StartingBond toward or from a Character added in the same set, which has no
 * id yet and keeps that Character's name.
 */
export interface ChangeSet {
    /** One or two sentences to the author. */
    reply: string;
    changes: Change[];
}

export const STORY_SET_FIELDS = ['title', 'setting', 'opening', 'pov', 'tense', 'replyLength', 'imageStyle'] as const;
export const ROLE_SET_FIELDS = ['name', 'description'] as const;
export const CHARACTER_SET_FIELDS = [
    'name',
    'appearance',
    'personality',
    'voice',
    'exampleLines',
    'background',
    'secrets',
    'arcDirections',
] as const;
export const SCENE_SET_FIELDS = ['name', 'situation', 'moveOnCondition'] as const;
export const BOND_SET_FIELDS = ['label', 'description'] as const;
export const LORE_SET_FIELDS = ['name', 'keywords', 'text', 'alwaysOn'] as const;

export type StorySetField = (typeof STORY_SET_FIELDS)[number];
export type RoleSetField = (typeof ROLE_SET_FIELDS)[number];
export type CharacterSetField = (typeof CHARACTER_SET_FIELDS)[number];
export type SceneSetField = (typeof SCENE_SET_FIELDS)[number];
export type BondSetField = (typeof BOND_SET_FIELDS)[number];
export type LoreSetField = (typeof LORE_SET_FIELDS)[number];

/** A Character of the cast by id, or one added in this set by its name. */
export type CharacterRef = number | string;

export interface NewStartingBond {
    from: CharacterRef;
    /** null is toward the Role. */
    toward: CharacterRef | null;
    label: string;
    description: string;
}

export type Change =
    | { op: 'set'; target: 'story'; field: StorySetField; value: string }
    | { op: 'set'; target: 'role'; field: RoleSetField; value: string }
    | { op: 'set'; target: 'character'; id: number; field: CharacterSetField; value: string | string[] }
    | { op: 'set'; target: 'scene'; id: number; field: SceneSetField; value: string }
    | { op: 'set'; target: 'startingBond'; id: number; field: BondSetField; value: string }
    | { op: 'set'; target: 'lore'; id: number; field: LoreSetField; value: string | string[] | boolean }
    | { op: 'add'; target: 'character'; value: DraftCharacter }
    | { op: 'add'; target: 'scene'; value: DraftScene }
    | { op: 'add'; target: 'startingBond'; value: NewStartingBond }
    | { op: 'add'; target: 'lore'; value: DraftLore }
    | { op: 'remove'; target: 'character' | 'scene' | 'startingBond' | 'lore'; id: number };

export type ChangeSource = 'model' | 'client';

/** The model's text as a change set: one JSON object, with one wrapping key dropped. */
export function parseChangeSetJson(text: string): Json {
    const json = readJsonObject(text, () => new UnreadableChangeSetError());
    const keys = Object.keys(json);
    if ('changes' in json || keys.length !== 1) return json;
    const inner = json[keys[0]];
    return isObject(inner) && 'changes' in inner ? inner : json;
}

/** A Character, Scene or StartingBond as the Story answers it; enough to be found by. */
type Named = { id: number; name: string };

/**
 * Checks a change set against the Story it is for, before anything is written. Every
 * referenced Character, Scene and StartingBond must exist, every field must be one of that
 * part's fields, Style values must be in their sets, added Characters and Scenes must have
 * their required fields, the cast may not grow past MAX_CHARACTERS, and StartingBonds follow
 * the authoring rules (no self-bond, at most one per direction).
 */
export function validateChangeSet(json: Json, story: StoryResponse, source: ChangeSource): ChangeSet {
    const invalid = (reason: string) => new InvalidChangeSetError(reason, source);
    const reply = json.reply === undefined || json.reply === null ? '' : json.reply;
    if (typeof reply !== 'string') throw invalid('reply must be text.');
    const list = json.changes === undefined || json.changes === null ? [] : json.changes;
    if (!Array.isArray(list)) throw invalid('changes must be a list.');

    const items = list.map((item, index) => {
        if (!isObject(item)) throw invalid(`change ${index + 1} is not an object.`);
        return item;
    });

    // Removals first: a set or a bond may not use what this set removes, and the cast count
    // takes them into account.
    const removedCharacters = new Set<number>();
    const removedScenes = new Set<number>();
    const removedBonds = new Set<number>();
    const removedLore = new Set<number>();
    items.forEach((item, index) => {
        if (item.op !== 'remove') return;
        const where = `change ${index + 1}`;
        switch (item.target) {
            case 'character':
                removedCharacters.add(findCharacter(story, item, where, invalid).id);
                break;
            case 'scene':
                removedScenes.add(findScene(story, item, where, invalid).id);
                break;
            case 'startingBond':
                removedBonds.add(findBond(story, item, where, invalid).id);
                break;
            case 'lore':
                removedLore.add(findLore(story, item, where, invalid).id);
                break;
            default:
                throw invalid(`${where}: a remove targets a character, scene, startingBond or lore.`);
        }
    });
    for (const bond of story.startingBonds) {
        if (removedCharacters.has(bond.fromCharacterId) || (bond.toCharacterId !== null && removedCharacters.has(bond.toCharacterId))) {
            removedBonds.add(bond.id);
        }
    }

    const addedNames = new Map<string, string>(); // lowercased -> as written
    const castNames = new Set(
        story.characters.filter((c) => !removedCharacters.has(c.id)).map((c) => c.name.trim().toLowerCase()),
    );
    const directions = new Set(
        story.startingBonds
            .filter((bond) => !removedBonds.has(bond.id))
            .map((bond) => direction(bond.fromCharacterId, bond.toCharacterId)),
    );
    let castCount = story.characters.length - removedCharacters.size;

    const changes: Change[] = [];
    const bondAdds: Array<{ item: Json; index: number }> = [];
    items.forEach((item, index) => {
        const where = `change ${index + 1}`;
        switch (item.op) {
            case 'remove':
                switch (item.target) {
                    case 'character':
                        changes.push({ op: 'remove', target: 'character', id: findCharacter(story, item, where, invalid).id });
                        break;
                    case 'scene':
                        changes.push({ op: 'remove', target: 'scene', id: findScene(story, item, where, invalid).id });
                        break;
                    case 'lore':
                        changes.push({ op: 'remove', target: 'lore', id: findLore(story, item, where, invalid).id });
                        break;
                    default:
                        changes.push({ op: 'remove', target: 'startingBond', id: findBond(story, item, where, invalid).id });
                }
                break;
            case 'set':
                changes.push(validateSet(story, item, where, invalid, removedCharacters, removedScenes, removedBonds, removedLore));
                break;
            case 'add':
                switch (item.target) {
                    case 'character': {
                        const character = validateCharacter(item.value, where, source);
                        const key = character.name.toLowerCase();
                        if (castNames.has(key) || addedNames.has(key)) {
                            throw invalid(`${where}: the cast already has a Character named ${character.name}.`);
                        }
                        castCount += 1;
                        if (castCount > MAX_CHARACTERS) throw new CastFullError(MAX_CHARACTERS);
                        addedNames.set(key, character.name);
                        changes.push({ op: 'add', target: 'character', value: character });
                        break;
                    }
                    case 'scene':
                        changes.push({ op: 'add', target: 'scene', value: validateScene(item.value, where, source) });
                        break;
                    case 'lore':
                        changes.push({ op: 'add', target: 'lore', value: validateLore(item.value, where, source) });
                        break;
                    case 'startingBond':
                        // After every Character add, so a Bond may name one added later in the list.
                        bondAdds.push({ item, index });
                        break;
                    default:
                        throw invalid(`${where}: an add targets a character, scene, startingBond or lore.`);
                }
                break;
            default:
                throw invalid(`${where}: op must be set, add or remove.`);
        }
    });

    for (const { item, index } of bondAdds) {
        const where = `change ${index + 1}`;
        if (!isObject(item.value)) throw invalid(`${where}: a startingBond add needs a value object.`);
        const live = story.characters.filter((c) => !removedCharacters.has(c.id));
        const end = (raw: unknown, what: string): CharacterRef => {
            if (typeof raw === 'string') {
                const added = addedNames.get(raw.trim().toLowerCase());
                if (added !== undefined) return added;
            }
            return resolveCharacter(live, raw, `${where}: ${what}`, invalid).id;
        };
        const from = end(item.value.from, 'from');
        const towardRole =
            item.value.toward === null ||
            item.value.toward === undefined ||
            (typeof item.value.toward === 'string' && item.value.toward.trim().toLowerCase() === 'role');
        const toward = towardRole ? null : end(item.value.toward, 'toward');
        if (from === toward) throw invalid(`${where}: a starting Bond from a Character toward themself.`);
        const key = direction(from, toward);
        if (directions.has(key)) {
            throw invalid(`${where}: that Character already has a starting Bond in that direction.`);
        }
        directions.add(key);
        changes.push({
            op: 'add',
            target: 'startingBond',
            value: {
                from,
                toward,
                label: optionalText(item.value, 'label', where, invalid),
                description: optionalText(item.value, 'description', where, invalid),
            },
        });
    }

    return { reply: reply.trim(), changes };
}

function direction(from: CharacterRef, toward: CharacterRef | null): string {
    const key = (ref: CharacterRef) => (typeof ref === 'number' ? `#${ref}` : ref.toLowerCase());
    return `${key(from)}->${toward === null ? 'role' : key(toward)}`;
}

type Invalid = (reason: string) => Error;

function validateSet(
    story: StoryResponse,
    item: Json,
    where: string,
    invalid: Invalid,
    removedCharacters: Set<number>,
    removedScenes: Set<number>,
    removedBonds: Set<number>,
    removedLore: Set<number>,
): Change {
    const field = item.field;
    if (typeof field !== 'string') throw invalid(`${where}: a set needs a field.`);
    const text = (): string => {
        if (item.value === undefined || item.value === null) return '';
        if (typeof item.value !== 'string') throw invalid(`${where}: ${field} must be text.`);
        return item.value.trim();
    };
    const oneOf = <T extends string>(allowed: readonly T[]): T => {
        if (!allowed.includes(field as T)) {
            throw invalid(`${where}: ${field} is not a field of the ${item.target}.`);
        }
        return field as T;
    };
    switch (item.target) {
        case 'story':
        case 'style': {
            const which = oneOf(STORY_SET_FIELDS);
            const value = text();
            const sets: Partial<Record<StorySetField, readonly string[]>> = {
                pov: Object.values(Pov),
                tense: Object.values(Tense),
                replyLength: Object.values(ReplyLength),
            };
            const allowed = sets[which];
            if (allowed && !allowed.includes(value)) {
                throw invalid(`${where}: Style ${which} must be one of ${allowed.join(', ')}.`);
            }
            return { op: 'set', target: 'story', field: which, value };
        }
        case 'role':
            return { op: 'set', target: 'role', field: oneOf(ROLE_SET_FIELDS), value: text() };
        case 'character': {
            const character = findCharacter(story, item, where, invalid);
            if (removedCharacters.has(character.id)) {
                throw invalid(`${where}: ${character.name || 'that Character'} is removed in the same change set.`);
            }
            const which = oneOf(CHARACTER_SET_FIELDS);
            if (which === 'exampleLines') {
                const lines = item.value === undefined || item.value === null ? [] : item.value;
                if (!Array.isArray(lines) || !lines.every((line) => typeof line === 'string')) {
                    throw invalid(`${where}: exampleLines must be a list of text.`);
                }
                const value = (lines as string[]).map((line) => line.trim()).filter((line) => line !== '');
                return { op: 'set', target: 'character', id: character.id, field: which, value };
            }
            return { op: 'set', target: 'character', id: character.id, field: which, value: text() };
        }
        case 'scene': {
            const scene = findScene(story, item, where, invalid);
            if (removedScenes.has(scene.id)) {
                throw invalid(`${where}: ${scene.name || 'that Scene'} is removed in the same change set.`);
            }
            return { op: 'set', target: 'scene', id: scene.id, field: oneOf(SCENE_SET_FIELDS), value: text() };
        }
        case 'startingBond': {
            const bond = findBond(story, item, where, invalid);
            if (removedBonds.has(bond.id)) throw invalid(`${where}: that starting Bond is removed in the same change set.`);
            return { op: 'set', target: 'startingBond', id: bond.id, field: oneOf(BOND_SET_FIELDS), value: text() };
        }
        case 'lore': {
            const entry = findLore(story, item, where, invalid);
            if (removedLore.has(entry.id)) throw invalid(`${where}: ${entry.name || 'that Lore entry'} is removed in the same change set.`);
            const which = oneOf(LORE_SET_FIELDS);
            if (which === 'keywords') {
                const list = item.value === undefined || item.value === null ? [] : item.value;
                if (!Array.isArray(list) || !list.every((keyword) => typeof keyword === 'string')) {
                    throw invalid(`${where}: keywords must be a list of text.`);
                }
                const value = (list as string[]).map((keyword) => keyword.trim()).filter((keyword) => keyword !== '');
                if (value.length > MAX_LORE_KEYWORDS || value.some((keyword) => keyword.length > MAX_LORE_KEYWORD_LENGTH)) {
                    throw invalid(`${where}: at most ${MAX_LORE_KEYWORDS} keywords of at most ${MAX_LORE_KEYWORD_LENGTH} characters.`);
                }
                return { op: 'set', target: 'lore', id: entry.id, field: which, value };
            }
            if (which === 'alwaysOn') {
                const value = item.value === 'true' ? true : item.value === 'false' ? false : item.value;
                if (typeof value !== 'boolean') throw invalid(`${where}: alwaysOn must be true or false.`);
                return { op: 'set', target: 'lore', id: entry.id, field: which, value };
            }
            return { op: 'set', target: 'lore', id: entry.id, field: which, value: text() };
        }
        default:
            throw invalid(`${where}: a set targets the story, role, a character, scene, startingBond or lore.`);
    }
}

/**
 * Finds a Character or Scene by `id`, or by `name` (case-insensitive), or by its number as
 * the prompt writes it ("Character 2", "Scene 3"), which is how an unnamed one is addressed.
 */
function resolveNamed<T extends Named>(items: T[], ref: unknown, what: string, where: string, invalid: Invalid): T {
    if (typeof ref === 'number') {
        const found = items.find((item) => item.id === ref);
        if (!found) throw invalid(`${where} names ${what} #${ref}, which is not in the Story.`);
        return found;
    }
    if (typeof ref !== 'string' || ref.trim() === '') throw invalid(`${where} must name a ${what}.`);
    const wanted = ref.trim().toLowerCase();
    const byName = items.find((item) => item.name.trim().toLowerCase() === wanted);
    if (byName) return byName;
    const numbered = new RegExp(`^${what}\\s+(\\d+)$`, 'i').exec(ref.trim());
    const byNumber = numbered ? items[Number(numbered[1]) - 1] : undefined;
    if (byNumber) return byNumber;
    throw invalid(`${where} names "${ref}", who is not a ${what} of this Story.`);
}

function resolveCharacter(
    characters: StoryResponse['characters'],
    ref: unknown,
    where: string,
    invalid: Invalid,
): Named {
    return resolveNamed(characters, ref, 'Character', where, invalid);
}

function findCharacter(story: StoryResponse, item: Json, where: string, invalid: Invalid): Named {
    return resolveCharacter(story.characters, item.id ?? item.name ?? item.character, where, invalid);
}

/** A Lore entry by `id`, by `name` (case-insensitive) or as "Lore 2", by its number in the Story. */
function findLore(story: StoryResponse, item: Json, where: string, invalid: Invalid): Named {
    return resolveNamed(story.lore, item.id ?? item.name ?? item.lore, 'Lore', where, invalid);
}

function findScene(story: StoryResponse, item: Json, where: string, invalid: Invalid): Named {
    return resolveNamed(story.scenes, item.id ?? item.name ?? item.scene, 'Scene', where, invalid);
}

/** A StartingBond by `id`, or by its `from` and `toward` Characters ("role" or null for the Role). */
function findBond(story: StoryResponse, item: Json, where: string, invalid: Invalid): { id: number; name: string } {
    if (typeof item.id === 'number') {
        const found = story.startingBonds.find((bond) => bond.id === item.id);
        if (!found) throw invalid(`${where} names starting Bond #${item.id}, which is not in the Story.`);
        return { id: found.id, name: '' };
    }
    const from = resolveCharacter(story.characters, item.from, `${where}: from`, invalid).id;
    const towardRole =
        item.toward === null ||
        item.toward === undefined ||
        (typeof item.toward === 'string' && item.toward.trim().toLowerCase() === 'role');
    const toward = towardRole ? null : resolveCharacter(story.characters, item.toward, `${where}: toward`, invalid).id;
    const found = story.startingBonds.find((bond) => bond.fromCharacterId === from && bond.toCharacterId === toward);
    if (!found) throw invalid(`${where}: there is no starting Bond in that direction.`);
    return { id: found.id, name: '' };
}

function optionalText(source: Json, key: string, where: string, invalid: Invalid): string {
    const value = source[key];
    if (value === undefined || value === null) return '';
    if (typeof value !== 'string') throw invalid(`${where}: ${key} must be text.`);
    return value.trim();
}

/** The draft validators throw InvalidDraftError; here the same reason is a change-set error. */
function validateCharacter(value: unknown, where: string, source: ChangeSource): DraftCharacter {
    try {
        return validateDraftCharacter(value, `${where}: the new Character`);
    } catch (error) {
        throw new InvalidChangeSetError(error instanceof Error ? error.message : String(error), source);
    }
}

function validateLore(value: unknown, where: string, source: ChangeSource): DraftLore {
    try {
        return validateDraftLore(value, `${where}: the new Lore entry`);
    } catch (error) {
        throw new InvalidChangeSetError(error instanceof Error ? error.message : String(error), source);
    }
}

function validateScene(value: unknown, where: string, source: ChangeSource): DraftScene {
    try {
        return validateDraftScene(value, `${where}: the new Scene`);
    } catch (error) {
        throw new InvalidChangeSetError(error instanceof Error ? error.message : String(error), source);
    }
}

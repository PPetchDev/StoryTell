import { InvalidDraftError, UnreadableDraftError } from '../../errors/story-drafting.errors.js';
import { Pov, ReplyLength, Tense } from '../../model/story/entities/story.entity.js';
import { MAX_CHARACTERS } from '../story/playable.js';

/**
 * The structured Story a draft call returns, after validation. StartingBonds name their
 * Characters, because the model knows no ids; the manager maps names to the saved rows.
 */
export interface DraftStory {
    title: string;
    setting: string;
    opening: string;
    style: { pov: Pov; tense: Tense; replyLength: ReplyLength; imageStyle: string };
    role: { name: string; description: string };
    characters: DraftCharacter[];
    startingBonds: DraftStartingBond[];
    scenes: DraftScene[];
}

export interface DraftCharacter {
    name: string;
    appearance: string;
    personality: string;
    voice: string;
    exampleLines: string[];
    background: string;
    secrets: string;
    arcDirections: string;
}

export interface DraftStartingBond {
    /** Index into `characters`. */
    from: number;
    /** Index into `characters`, or null for the Role. */
    toward: number | null;
    label: string;
    description: string;
}

export interface DraftScene {
    name: string;
    situation: string;
    moveOnCondition: string;
}

type Json = Record<string, unknown>;

/**
 * Reads the model's text as one JSON object. A code fence or a sentence around the object
 * is tolerated; anything that is not an object underneath is unreadable.
 */
export function parseDraftJson(text: string): Json {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end < start) throw new UnreadableDraftError();
    let parsed: unknown;
    try {
        parsed = JSON.parse(text.slice(start, end + 1));
    } catch {
        throw new UnreadableDraftError();
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new UnreadableDraftError();
    }
    return unwrapped(parsed as Json);
}

/** A model may wrap the Story in one outer key (`{"story": {...}}`); that wrapper is dropped. */
function unwrapped(json: Json): Json {
    const keys = Object.keys(json);
    if ('title' in json || keys.length !== 1) return json;
    const inner = json[keys[0]];
    return isObject(inner) && 'title' in inner ? inner : json;
}

function isObject(value: unknown): value is Json {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredText(source: Json, key: string, where: string): string {
    const value = source[key];
    if (typeof value !== 'string' || value.trim() === '') {
        throw new InvalidDraftError(`${where} needs a ${key}.`);
    }
    return value.trim();
}

function optionalText(source: Json, key: string, where: string): string {
    const value = source[key];
    if (value === undefined || value === null) return '';
    if (typeof value !== 'string') throw new InvalidDraftError(`${where}: ${key} must be text.`);
    return value.trim();
}

function optionalList(source: Json, key: string, where: string): unknown[] {
    const value = source[key];
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) throw new InvalidDraftError(`${where}: ${key} must be a list.`);
    return value;
}

function enumValue<T extends string>(source: Json, key: string, allowed: readonly T[], fallback: T): T {
    const value = source[key];
    if (value === undefined || value === null) return fallback;
    if (typeof value !== 'string' || !allowed.includes(value as T)) {
        throw new InvalidDraftError(`Style ${key} must be one of ${allowed.join(', ')}.`);
    }
    return value as T;
}

/**
 * Checks the draft's shape before anything is saved (spec: "The backend validates the shape
 * (1–6 Characters, valid Style values) before saving"). Required fields must be present and
 * not blank; optional fields may be missing; StartingBonds must name Characters of the cast,
 * never a Character toward itself, and at most one per direction.
 */
export function validateDraft(json: Json): DraftStory {
    const title = requiredText(json, 'title', 'the Story');
    const setting = requiredText(json, 'setting', 'the Story');
    const opening = requiredText(json, 'opening', 'the Story');

    const styleJson = isObject(json.style) ? json.style : {};
    const style = {
        pov: enumValue(styleJson, 'pov', Object.values(Pov), Pov.Second),
        tense: enumValue(styleJson, 'tense', Object.values(Tense), Tense.Past),
        replyLength: enumValue(styleJson, 'replyLength', Object.values(ReplyLength), ReplyLength.Medium),
        imageStyle: optionalText(styleJson, 'imageStyle', 'Style'),
    };

    if (!isObject(json.role)) throw new InvalidDraftError('the Story needs a Role.');
    const role = {
        name: requiredText(json.role, 'name', 'the Role'),
        description: requiredText(json.role, 'description', 'the Role'),
    };

    const castJson = json.characters;
    if (!Array.isArray(castJson)) throw new InvalidDraftError('the Story needs a list of Characters.');
    if (castJson.length < 1 || castJson.length > MAX_CHARACTERS) {
        throw new InvalidDraftError(
            `a Story has 1 to ${MAX_CHARACTERS} Characters, the draft has ${castJson.length}.`,
        );
    }
    const characters = castJson.map((item, index): DraftCharacter => {
        if (!isObject(item)) throw new InvalidDraftError(`Character ${index + 1} is not an object.`);
        const name = requiredText(item, 'name', `Character ${index + 1}`);
        const lines = optionalList(item, 'exampleLines', name);
        if (!lines.every((line) => typeof line === 'string')) {
            throw new InvalidDraftError(`${name}: exampleLines must be a list of text.`);
        }
        return {
            name,
            appearance: requiredText(item, 'appearance', name),
            personality: requiredText(item, 'personality', name),
            voice: requiredText(item, 'voice', name),
            exampleLines: (lines as string[]).map((line) => line.trim()).filter((line) => line !== ''),
            background: optionalText(item, 'background', name),
            secrets: optionalText(item, 'secrets', name),
            arcDirections: optionalText(item, 'arcDirections', name),
        };
    });
    const names = characters.map((character) => character.name.toLowerCase());
    if (new Set(names).size !== names.length) {
        throw new InvalidDraftError('two Characters share a name.');
    }

    const byName = (name: unknown, where: string): number => {
        if (typeof name !== 'string') throw new InvalidDraftError(`${where} must name a Character.`);
        const index = names.indexOf(name.trim().toLowerCase());
        if (index < 0) throw new InvalidDraftError(`${where} names "${name}", who is not in the cast.`);
        return index;
    };
    const directions = new Set<string>();
    const startingBonds = optionalList(json, 'startingBonds', 'the Story').map(
        (item, index): DraftStartingBond => {
            const where = `starting Bond ${index + 1}`;
            if (!isObject(item)) throw new InvalidDraftError(`${where} is not an object.`);
            const from = byName(item.from, `${where}: from`);
            const towardRole =
                item.toward === null ||
                item.toward === undefined ||
                (typeof item.toward === 'string' && item.toward.trim().toLowerCase() === 'role');
            const toward = towardRole ? null : byName(item.toward, `${where}: toward`);
            if (toward === from) {
                throw new InvalidDraftError(`${where} points from ${characters[from].name} to themself.`);
            }
            const direction = `${from}->${toward ?? 'role'}`;
            if (directions.has(direction)) {
                throw new InvalidDraftError(
                    `${characters[from].name} has two starting Bonds in the same direction.`,
                );
            }
            directions.add(direction);
            return {
                from,
                toward,
                label: optionalText(item, 'label', where),
                description: optionalText(item, 'description', where),
            };
        },
    );

    const scenes = optionalList(json, 'scenes', 'the Story').map((item, index): DraftScene => {
        const where = `Scene ${index + 1}`;
        if (!isObject(item)) throw new InvalidDraftError(`${where} is not an object.`);
        return {
            name: requiredText(item, 'name', where),
            situation: requiredText(item, 'situation', where),
            moveOnCondition: optionalText(item, 'moveOnCondition', where),
        };
    });

    return { title, setting, opening, style, role, characters, startingBonds, scenes };
}

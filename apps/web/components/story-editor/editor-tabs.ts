import { MissingField, RewriteRequest, RewriteTarget, Story } from '@/lib/story';
import { fieldDomId } from './rewrite';

/** The editor's sections, one tab panel at a time (spec: "Story editor", Tabs). */
export const TABS = [
    { key: 'story', label: 'Story' },
    { key: 'style', label: 'Style' },
    { key: 'role', label: 'Role' },
    { key: 'characters', label: 'Characters' },
    { key: 'bonds', label: 'Bonds' },
    { key: 'scenes', label: 'Scenes' },
    { key: 'lore', label: 'Lore' },
] as const;

export type TabKey = (typeof TABS)[number]['key'];

/** The tab named by the URL's `?tab=`; anything else is the Story tab. */
export function tabFrom(value: string | null): TabKey {
    return TABS.find((tab) => tab.key === value)?.key ?? 'story';
}

/** Where "Add Character" is, the target of the "At least one Character" item. */
export const ADD_CHARACTER_ID = 'add-character';

/** Where a missing item's field lives: its tab, and the element to focus there. */
export interface FieldPlace {
    tab: TabKey;
    domId: string | null;
}

/**
 * Maps a missing item's field key (the API's `title`, `role.name`, `characters.0.voice`,
 * `scenes.1.situation`, …) to its tab and its input. Characters and Scenes are named by their
 * position in the Story; the input is named by their id, which stays put when one is moved.
 */
export function placeOf(field: string, story: Story): FieldPlace {
    const [head, position, name] = field.split('.');
    switch (head) {
        case 'title':
        case 'setting':
        case 'opening':
            return { tab: 'story', domId: fieldDomId({ target: 'story', field: head }) };
        case 'role':
            return { tab: 'role', domId: fieldDomId({ target: 'role', field: position }) };
        case 'characters': {
            if (position === undefined) return { tab: 'characters', domId: ADD_CHARACTER_ID };
            const character = story.characters[Number(position)];
            return { tab: 'characters', domId: character ? fieldDomId({ target: 'character', id: character.id, field: name }) : null };
        }
        case 'scenes': {
            const scene = story.scenes[Number(position)];
            return { tab: 'scenes', domId: scene ? fieldDomId({ target: 'scene', id: scene.id, field: name }) : null };
        }
        default:
            return { tab: 'story', domId: null };
    }
}

/** The tabs that hold at least one missing field, for their dots. */
export function tabsWithMissing(missing: MissingField[], story: Story): Set<TabKey> {
    return new Set(missing.map((item) => placeOf(item.field, story).tab));
}

/** The DOM ids of the inputs that are empty and needed to play, for their "Needed to play" marks. */
export function neededIds(missing: MissingField[], story: Story): Set<string> {
    const ids = new Set<string>();
    for (const item of missing) {
        const { domId } = placeOf(item.field, story);
        if (domId) ids.add(domId);
    }
    return ids;
}

/** The Story's fields shown on the Style tab; its other fields are on the Story tab. */
const STYLE_FIELDS: ReadonlySet<string> = new Set(['pov', 'tense', 'replyLength', 'imageStyle']);

const TAB_OF_TARGET: Record<Exclude<RewriteTarget, 'story'>, TabKey> = {
    role: 'role',
    character: 'characters',
    startingBond: 'bonds',
    scene: 'scenes',
    lore: 'lore',
};

/** Where a field named as the Rewrite buttons name it lives, e.g. one the assistant changed. */
export function placeOfField(request: RewriteRequest): FieldPlace {
    const tab = request.target === 'story' ? (STYLE_FIELDS.has(request.field) ? 'style' : 'story') : TAB_OF_TARGET[request.target];
    return { tab, domId: fieldDomId(request) };
}

import { StoryEntity } from '../../model/story/entities/story.entity.js';

/** One required field that is still empty, named for the editor and for the send check. */
export interface MissingField {
    /** A stable path for the client, e.g. `setting`, `role.name`, `characters.3.voice`. */
    field: string;
    /** What to tell the author, e.g. "Mira: Voice". */
    label: string;
}

export interface PlayableStatus {
    playable: boolean;
    missing: MissingField[];
}

export const MAX_CHARACTERS = 6;

function blank(text: string): boolean {
    return text.trim() === '';
}

/**
 * A Story is playable when every required field is filled (spec: "Playable is derived, never
 * stored"). Required: title, Setting, Opening, the Role's name and description, at least one
 * Character, each Character's name, appearance, personality and voice, each Scene's name and
 * situation, and each Scene's move-on condition except the last Scene's. Style always has a
 * value; Image style, example lines, background, secrets, Arc directions, StartingBonds and
 * Scenes themselves are optional.
 */
export function playableStatus(story: StoryEntity): PlayableStatus {
    const missing: MissingField[] = [];
    const need = (filled: boolean, field: string, label: string) => {
        if (!filled) missing.push({ field, label });
    };

    need(!blank(story.title), 'title', 'Title');
    need(!blank(story.setting), 'setting', 'Setting');
    need(!blank(story.opening), 'opening', 'Opening');
    need(!blank(story.role.name), 'role.name', 'Role: Name');
    need(!blank(story.role.description), 'role.description', 'Role: Description');

    need(story.characters.length > 0, 'characters', 'At least one Character');
    story.characters.forEach((character, index) => {
        const who = blank(character.name) ? `Character ${index + 1}` : character.name;
        const at = `characters.${index}`;
        need(!blank(character.name), `${at}.name`, `${who}: Name`);
        need(!blank(character.appearance), `${at}.appearance`, `${who}: Appearance`);
        need(!blank(character.personality), `${at}.personality`, `${who}: Personality`);
        need(!blank(character.voice), `${at}.voice`, `${who}: Voice`);
    });

    story.scenes.forEach((scene, index) => {
        const which = blank(scene.name) ? `Scene ${index + 1}` : scene.name;
        const at = `scenes.${index}`;
        need(!blank(scene.name), `${at}.name`, `${which}: Name`);
        need(!blank(scene.situation), `${at}.situation`, `${which}: Situation`);
        const last = index === story.scenes.length - 1;
        need(
            last || !blank(scene.moveOnCondition),
            `${at}.moveOnCondition`,
            `${which}: Move-on condition`,
        );
    });

    return { playable: missing.length === 0, missing };
}

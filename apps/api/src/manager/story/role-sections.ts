import { RoleSection } from '../../model/story/entities/role.entity.js';

/**
 * Role sections (.scratch/role-sections/spec.md): the author's own blocks of text on the Role,
 * each with an optional heading, beside its Description. Pure rules and the text the prompts read.
 */

/** At most this many sections on a Role. */
export const MAX_ROLE_SECTIONS = 20;
/** The longest heading, in characters (code points, so an emoji counts once), on one line. */
export const ROLE_SECTION_HEADING_MAX = 60;
/** The longest text of one section (as long as any other editor field). */
export const ROLE_SECTION_TEXT_MAX = 20000;

/** A heading made one line and cut to fit by whole characters, so no emoji is split in half. */
export function fitHeading(heading: string): string {
    return Array.from(heading.replace(/\s+/g, ' ').trim()).slice(0, ROLE_SECTION_HEADING_MAX).join('').trim();
}

/** The sections as stored: heading trimmed, text trimmed at its ends. */
export function tidyRoleSections(sections: readonly RoleSection[]): RoleSection[] {
    return sections.map((section) => ({ heading: section.heading.trim(), text: section.text.trim() }));
}

/** Why a (tidied) list can't be saved, or null. Headings may be empty or repeat; the author's order is kept. */
export function roleSectionsProblem(sections: readonly RoleSection[]): string | null {
    if (sections.length > MAX_ROLE_SECTIONS) return `A Role has at most ${MAX_ROLE_SECTIONS} sections.`;
    for (const [index, section] of sections.entries()) {
        const which = section.heading || `Section ${index + 1}`;
        if (/[\r\n]/.test(section.heading)) return `${which}: a heading is one line.`;
        if (Array.from(section.heading).length > ROLE_SECTION_HEADING_MAX) return `${which}: a heading is at most ${ROLE_SECTION_HEADING_MAX} characters.`;
        if (section.text.length > ROLE_SECTION_TEXT_MAX) return `${which}: at most ${ROLE_SECTION_TEXT_MAX} characters.`;
    }
    return null;
}

/**
 * Who the Role is, as the prompts read it: the Description, then each section with text as its own
 * paragraph, "Heading: text", or the text alone when it has no heading. A section with no text adds
 * nothing. `fill` replaces placeholders.
 */
export function roleText(description: string, sections: readonly RoleSection[] | null | undefined, fill: (text: string) => string = (t) => t): string {
    const parts = [fill(description).trim()];
    for (const section of sections ?? []) {
        const text = fill(section.text).trim();
        if (!text) continue;
        const heading = fill(section.heading).trim();
        parts.push(heading ? `${heading}: ${text}` : text);
    }
    return parts.filter(Boolean).join('\n\n');
}

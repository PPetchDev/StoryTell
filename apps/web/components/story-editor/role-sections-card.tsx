'use client';

import { useRef } from 'react';

import { MAX_ROLE_SECTIONS, ROLE_SECTION_HEADING_MAX, RoleSection } from '@/lib/story';
import { ADD_BUTTON_IN_CARD } from './add-button';
import { TextField } from './fields';
import { EDITOR_CARD, NOTE } from './folding-card';
import { UndoNotice, useUndo } from './undo-notice';

/** A heading as typed: one line, cut by whole characters so no emoji is split (mirrors fitHeading in apps/api/src/manager/story/role-sections.ts). */
const typedHeading = (text: string) => Array.from(text.replace(/[\r\n]+/g, ' ')).slice(0, ROLE_SECTION_HEADING_MAX).join('');

/** Every section as the API stores it, none left out, so nothing typed is lost when the Story is read back. */
export function savableRoleSections(sections: readonly RoleSection[]): RoleSection[] {
    return sections.map((section) => ({ heading: typedHeading(section.heading).trim(), text: section.text.trim() }));
}

/** The headings and texts a prompt reads: only sections with text (for "is this placeholder used?"). */
export function roleSectionTexts(sections: readonly RoleSection[]): string[] {
    return sections.filter((section) => section.text.trim() !== '').flatMap((section) => [section.heading, section.text]);
}

interface RoleSectionsCardProps {
    /** In the author's order, those still being written included. */
    sections: RoleSection[];
    /** The placeholder hint the Role's other fields show, or ''. */
    placeholderHint: string;
    /** The list as it now reads; the editor saves it whole. */
    onChange(sections: RoleSection[]): void;
}

/**
 * The Role's own sections, on the Role tab under its Description (.scratch/role-sections/spec.md):
 * as many headed blocks of free text as the author likes (Appearance, Powers, Outfit…), in their
 * order. Every section with text reaches the Characters with the Description, placeholders filled.
 */
export function RoleSectionsCard({ sections, placeholderHint, onChange }: RoleSectionsCardProps) {
    const list = useRef<HTMLDivElement>(null);
    const undo = useUndo();
    const change = (index: number, fields: Partial<RoleSection>) => onChange(sections.map((section, at) => (at === index ? { ...section, ...fields } : section)));
    const move = (index: number, by: -1 | 1) => {
        const next = [...sections];
        [next[index], next[index + by]] = [next[index + by], next[index]];
        onChange(next);
        // Focus follows the section to its new place.
        requestAnimationFrame(() => {
            const at = index + by + 1;
            const button = (way: string) => list.current?.querySelector<HTMLButtonElement>(`[aria-label="Move section ${at} ${way}"]`);
            const same = button(by < 0 ? 'up' : 'down');
            (same && !same.disabled ? same : button(by < 0 ? 'down' : 'up'))?.focus();
        });
    };
    /** One tap removes a section; Undo puts the list back as it was. */
    const remove = (index: number) => {
        const before = sections;
        onChange(sections.filter((_, at) => at !== index));
        undo.offer({
            message: `Removed ${sections[index].heading.trim() || `section ${index + 1}`}.`,
            undo: () => onChange(before),
            focusAfterUndo: () => list.current?.querySelector<HTMLElement>(`[aria-label="Remove section ${index + 1}"]`),
        });
    };

    return (
        <section className={EDITOR_CARD} aria-label="Your own sections" data-role-sections-card>
            <h2 className="mt-0 mb-1 text-lg font-semibold">Your own sections</h2>
            <p className={NOTE}>
                Optional. Add anything else about your part, under any heading you like: Appearance, Outfit, Powers, Personality, Past… The Characters
                read every section with the Description.
            </p>
            <div ref={list}>
                {sections.map((section, index) => (
                    <div
                        className="mt-4 border-t border-line pt-4 first:mt-0 first:border-t-0 first:pt-0"
                        key={index}
                        role="group"
                        aria-label={`Section ${index + 1}`}
                        data-role-section
                    >
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                            <span className="min-w-0 truncate text-md font-semibold text-muted">{section.heading.trim() || `Section ${index + 1}`}</span>
                            {/* 8px apart: at 4px their 44px hit areas overlapped, and a miss could land on Remove (docs/ui-audit-2026-11-21.md, M6). */}
                            <span className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    className="button button-quiet button-small"
                                    aria-label={`Move section ${index + 1} up`}
                                    disabled={index === 0}
                                    onClick={() => move(index, -1)}
                                >
                                    Up
                                </button>
                                <button
                                    type="button"
                                    className="button button-quiet button-small"
                                    aria-label={`Move section ${index + 1} down`}
                                    disabled={index === sections.length - 1}
                                    onClick={() => move(index, 1)}
                                >
                                    Down
                                </button>
                                <button
                                    type="button"
                                    className="button button-quiet button-small"
                                    aria-label={`Remove section ${index + 1}`}
                                    onClick={() => remove(index)}
                                >
                                    Remove
                                </button>
                            </span>
                        </div>
                        <TextField
                            label="Heading"
                            value={section.heading}
                            placeholder="e.g. Powers"
                            hint={section.heading.trim() === '' ? 'Optional. Without one, the text is read on its own.' : undefined}
                            onChange={(text) => change(index, { heading: typedHeading(text) })}
                        />
                        <TextField
                            label="Text"
                            value={section.text}
                            multiline
                            placeholder="Anything you like."
                            hint={placeholderHint.trim() || undefined}
                            onChange={(text) => change(index, { text })}
                        />
                    </div>
                ))}
            </div>
            <UndoNotice undo={undo} />
            {sections.length < MAX_ROLE_SECTIONS ? (
                <button type="button" className={ADD_BUTTON_IN_CARD} onClick={() => onChange([...sections, { heading: '', text: '' }])}>
                    + Add a section
                </button>
            ) : (
                <p className={NOTE}>A Role has at most {MAX_ROLE_SECTIONS} sections.</p>
            )}
        </section>
    );
}

'use client';

import { useEffect, useState } from 'react';

import { LoreEntry } from '@/lib/story';
import { ConfirmButton, SegmentedField, TextField, Toolbar } from './fields';
import { FieldRewrites, fieldDomId, rewriteKey } from './rewrite';
import styles from './story-editor.module.css';

type TextKey = 'name' | 'text';
type Include = 'mentioned' | 'always';

const INCLUDE_OPTIONS: Record<Include, string> = { mentioned: 'When it comes up', always: 'Always' };

/** Keywords as the author types them: separated by commas. */
export function parseKeywords(text: string): string[] {
    return text
        .split(/[,،、，]/)
        .map((keyword) => keyword.trim())
        .filter((keyword) => keyword !== '');
}

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((item, i) => item === b[i]);

interface LoreCardProps {
    entry: LoreEntry;
    index: number;
    rewrites: FieldRewrites;
    onText(field: TextKey, value: string): void;
    onKeywords(keywords: string[]): void;
    onAlwaysOn(alwaysOn: boolean): void;
    onRemove(): void;
}

/**
 * One Lore entry (spec: "Lore"). Lore has no ✨ Rewrite; the field ids and highlights still
 * follow the Rewrite naming, so the assistant's changes light up here and links land here.
 */
export function LoreCard({ entry, index, rewrites, onText, onKeywords, onAlwaysOn, onRemove }: LoreCardProps) {
    const heading = entry.name.trim() === '' ? `Lore ${index + 1}` : entry.name;
    const marks = (field: string) => {
        const request = { target: 'lore' as const, id: entry.id, field };
        return { domId: fieldDomId(request), highlighted: rewrites.highlights.has(rewriteKey(request)) };
    };

    // The typed text stays as typed (a trailing comma or space survives); it follows the
    // stored list only when that changes from elsewhere, such as the assistant or its Undo.
    const [keywordText, setKeywordText] = useState(entry.keywords.join(', '));
    useEffect(() => {
        setKeywordText((typed) => (sameList(parseKeywords(typed), entry.keywords) ? typed : entry.keywords.join(', ')));
    }, [entry.keywords]);

    return (
        <section className={styles.card} aria-label={`Lore ${index + 1}`}>
            <div className={styles.cardHeader}>
                <h3 className={styles.cardTitle}>{heading}</h3>
                <Toolbar>
                    <ConfirmButton
                        label="Remove"
                        danger
                        question={`Remove ${heading}?`}
                        warning="Chats stop getting this note from their next turn."
                        confirmLabel="Remove"
                        onConfirm={onRemove}
                    />
                </Toolbar>
            </div>
            <TextField
                label="Name"
                value={entry.name}
                hint="What it is about, e.g. a place, a people or a custom. The name also brings it up."
                onChange={(v) => onText('name', v)}
                {...marks('name')}
            />
            <TextField
                label="Keywords"
                value={keywordText}
                hint="Other words that bring it up, separated by commas: other names, plurals, Thai words."
                placeholder="yurt, tents, กระโจม"
                onChange={(v) => {
                    setKeywordText(v);
                    const parsed = parseKeywords(v);
                    if (!sameList(parsed, entry.keywords)) onKeywords(parsed);
                }}
                {...marks('keywords')}
            />
            <TextField
                label="Text"
                value={entry.text}
                multiline
                rows={3}
                hint="What the story should know about it. Every Character knows it, like anyone living there."
                onChange={(v) => onText('text', v)}
                {...marks('text')}
            />
            <SegmentedField
                label="Include"
                value={entry.alwaysOn ? 'always' : 'mentioned'}
                options={INCLUDE_OPTIONS}
                hint="Always: sent on every turn. Keep this for what matters all the time."
                onChange={(value) => onAlwaysOn(value === 'always')}
                {...marks('alwaysOn')}
            />
        </section>
    );
}

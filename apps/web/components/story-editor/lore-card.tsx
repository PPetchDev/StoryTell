'use client';

import { useEffect, useState } from 'react';

import { setFolded } from '@/lib/folds';
import { LoreEntry, LoreSecondaryMode } from '@/lib/story';
import { ConfirmButton, NumberField, SegmentedField, TextField, Toolbar } from './fields';
import { cardToggle, FoldingCard } from './folding-card';
import { loreMoreKey, LoreMoreTriggers } from './lore-more-triggers';
import { FieldRewrites, fieldDomId, rewriteKey } from './rewrite';

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

const SECONDARY_MODE_OPTIONS: Record<LoreSecondaryMode, string> = { alsoNeeds: 'Also needs one of', unless: 'Unless one of' };
const YES_NO: Record<'yes' | 'no', string> = { yes: 'Yes', no: 'No' };
/** Stays for, Rests for and Waits until run 0–50 Messages (.scratch/lore-triggers/spec.md). */
const LORE_TIMED_MAX = 50;

/** The trigger settings the More triggers fold edits (.scratch/lore-triggers/spec.md). */
export type LoreTriggerKey = 'secondaryKeywords' | 'secondaryMode' | 'recursable' | 'sticky' | 'cooldown' | 'delay' | 'chance' | 'group';

/** Patterns as the author types them: one per line. */
export function parsePatterns(text: string): string[] {
    return text
        .split('\n')
        .map((pattern) => pattern.trim())
        .filter((pattern) => pattern !== '');
}

const COMMAS = { parse: parseKeywords, join: ', ' };
const LINES = { parse: parsePatterns, join: '\n' };

/**
 * A list field whose typed text stays as typed (a trailing comma or space survives); it follows
 * the stored list only when that changes from elsewhere, such as the assistant or its Undo.
 */
function useListText(stored: string[], format: typeof COMMAS = COMMAS): [string, (typed: string) => void] {
    const [text, setText] = useState(stored.join(format.join));
    // Keyed by value, so a fresh copy of the same list (a structural save) keeps what is typed.
    const storedKey = JSON.stringify(stored);
    useEffect(() => {
        const list = JSON.parse(storedKey) as string[];
        setText((typed) => (sameList(format.parse(typed), list) ? typed : list.join(format.join)));
    }, [storedKey, format]);
    return [text, setText];
}

interface LoreCardProps {
    entry: LoreEntry;
    index: number;
    rewrites: FieldRewrites;
    onText(field: TextKey, value: string): void;
    onKeywords(keywords: string[]): void;
    onAlwaysOn(alwaysOn: boolean): void;
    onTrigger<K extends LoreTriggerKey>(field: K, value: LoreEntry[K]): void;
    /** Saves the patterns; the API may refuse one that doesn't compile. */
    onPatterns(patterns: string[], onSaved: () => void, onError: (message: string) => void): void;
    /** Removes the entry; focus moves to the next card once the promise it returns settles. */
    onRemove(): void | Promise<unknown>;
    /** A number typed out of range: drop the edit of that setting still waiting to be saved (audit M21). */
    onInvalidNumber?(field: LoreTriggerKey): void;
}

/**
 * One Lore entry (spec: "Lore"). Lore has no ✨ Rewrite; the field ids and highlights still
 * follow the Rewrite naming, so the assistant's changes light up here and links land here.
 */
export function LoreCard({ entry, index, rewrites, onText, onKeywords, onAlwaysOn, onTrigger, onPatterns, onRemove, onInvalidNumber }: LoreCardProps) {
    const heading = entry.name.trim() === '' ? `Lore ${index + 1}` : entry.name;
    const marks = (field: string) => {
        const request = { target: 'lore' as const, id: entry.id, field };
        return { domId: fieldDomId(request), highlighted: rewrites.highlights.has(rewriteKey(request)) };
    };

    const [keywordText, setKeywordText] = useListText(entry.keywords);
    const [secondaryText, setSecondaryText] = useListText(entry.secondaryKeywords);
    const [patternText, setPatternText] = useListText(entry.patterns, LINES);
    const [patternError, setPatternError] = useState<string | null>(null);
    const changePatterns = (typed: string) => {
        setPatternText(typed);
        const parsed = parsePatterns(typed);
        if (sameList(parsed, entry.patterns)) {
            setPatternError(null);
            return;
        }
        onPatterns(
            parsed,
            () => setPatternError(null),
            (message) => {
                setPatternError(message);
                // The fold opens on an error in it, so it is never hidden.
                setFolded(loreMoreKey(entry.id), true);
            },
        );
    };

    return (
        <FoldingCard
            foldKey={`lore:${entry.id}`}
            label={`Lore ${index + 1}`}
            fieldPrefixes={[`field-lore.${entry.id}.`]}
            title={heading}
            tools={
                <Toolbar>
                    <ConfirmButton
                        label="Remove"
                        danger
                        question={`Remove ${heading}?`}
                        warning="Chats stop getting this note from their next turn."
                        confirmLabel="Remove"
                        ariaLabel={`Remove Lore ${index + 1}`}
                        onConfirm={onRemove}
                        focusAfter={() => cardToggle(`Lore ${index + 1}`) ?? cardToggle(`Lore ${index}`)}
                    />
                </Toolbar>
            }
        >
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
            <LoreMoreTriggers entry={entry}>
                <TextField
                    label="Second keywords"
                    value={secondaryText}
                    hint="Separated by commas, matched like Keywords. They never bring the entry up; they only decide whether it goes in when it comes up."
                    placeholder="night, storm"
                    onChange={(v) => {
                        setSecondaryText(v);
                        const parsed = parseKeywords(v);
                        if (!sameList(parsed, entry.secondaryKeywords)) onTrigger('secondaryKeywords', parsed);
                    }}
                    {...marks('secondaryKeywords')}
                />
                <SegmentedField
                    label="Second keywords rule"
                    value={entry.secondaryMode}
                    options={SECONDARY_MODE_OPTIONS}
                    hint="Also needs one of: it goes in only if one of them is there too. Unless one of: it stays out if one is there."
                    onChange={(value) => onTrigger('secondaryMode', value)}
                    {...marks('secondaryMode')}
                />
                <TextField
                    label="Patterns"
                    value={patternText}
                    multiline
                    rows={2}
                    hint="One per line. Each is a regular expression, matched ignoring case, that brings the entry up like a keyword; ^@Mira: matches only Mira's lines."
                    placeholder={'\\b(luna|selene)\\b'}
                    error={patternError}
                    onChange={changePatterns}
                    {...marks('patterns')}
                />
                <div className="grid grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))] gap-x-4">
                    {/* Stays for has no effect on an entry sent on every turn. */}
                    {!entry.alwaysOn && (
                        <NumberField
                            label="Stays for"
                            value={entry.sticky}
                            min={0}
                            max={LORE_TIMED_MAX}
                            unit="Messages"
                            onChange={(value) => onTrigger('sticky', value)}
                        onInvalid={() => onInvalidNumber?.('sticky')}
                            {...marks('sticky')}
                        />
                    )}
                    <NumberField
                        label="Rests for"
                        value={entry.cooldown}
                        min={0}
                        max={LORE_TIMED_MAX}
                        unit="Messages"
                        onChange={(value) => onTrigger('cooldown', value)}
                        onInvalid={() => onInvalidNumber?.('cooldown')}
                        {...marks('cooldown')}
                    />
                    <NumberField
                        label="Waits until the Chat has"
                        value={entry.delay}
                        min={0}
                        max={LORE_TIMED_MAX}
                        unit="Messages"
                        onChange={(value) => onTrigger('delay', value)}
                        onInvalid={() => onInvalidNumber?.('delay')}
                        {...marks('delay')}
                    />
                </div>
                <p className="-mt-2 mb-4 text-sm text-muted">
                    Stays for: it stays in after it went in, mentioned or not. Rests for: then it stays out. Waits until: it stays out early in a
                    Chat. 0 is off; each of your lines and each reply counts one Message.
                </p>
                <NumberField
                    label="Chance"
                    value={entry.chance}
                    min={0}
                    max={100}
                    unit="%"
                    hint="How often it goes in when it would. Below 100, it is rolled once for each new Message and kept, so Regenerate never flips it."
                    onChange={(value) => onTrigger('chance', value)}
                        onInvalid={() => onInvalidNumber?.('chance')}
                    {...marks('chance')}
                />
                <TextField
                    label="Group"
                    value={entry.group}
                    hint="At most one entry of a group goes in per turn: the one already staying, else the one that came up most recently (card order breaks a tie). Leave it blank for none."
                    placeholder="weather"
                    onChange={(value) => onTrigger('group', value)}
                    {...marks('group')}
                />
                <SegmentedField
                    label="Brought in by other entries"
                    value={entry.recursable ? 'yes' : 'no'}
                    options={YES_NO}
                    hint="Yes: it comes along when the text of an entry already in names it. No keeps a common word in other entries from dragging it in."
                    onChange={(value) => onTrigger('recursable', value === 'yes')}
                    {...marks('recursable')}
                />
            </LoreMoreTriggers>
        </FoldingCard>
    );
}

'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import { useConnection } from '@/components/connection';
import { PlayIcon } from '@/components/icons';
import { StoryAssistantSheet } from '@/components/story-assistant/story-assistant-sheet';
import { fieldOf, useStoryAssistant } from '@/components/story-assistant/use-story-assistant';
import { ApiUnreachableError } from '@/lib/api';
import type { BondAxis } from '@/lib/bonds';
import { FROM_CARD_PARAM, tidyMessage } from '@/lib/character-card';
import { characterColour, portraitsOf } from '@/lib/character-colour';
import { SCROLL_FADES, useScrollFade } from '@/lib/scroll-fade';

import { AppliedChange } from '@/lib/story-assistant';
import { DEFAULT_NARRATION_VOICE, useVoices, voiceName } from '@/lib/voices';
import {
    BACKDROP_LABELS,
    LoreEntry,
    LoreEntryFields,
    MAX_CHARACTERS,
    MissingField,
    POV_LABELS,
    REPLY_LENGTH_LABELS,
    RewriteRequest,
    SceneBondGate,
    StartingBelief,
    Story,
    storyApi,
    storyTitle,
    TENSE_LABELS,
} from '@/lib/story';
import { ADD_BUTTON, ADD_BUTTON_IN_CARD } from './add-button';
import { focusChoice, movedIndex } from './arrow-keys';
import { useAutosave } from './autosave';
import { CharacterCard } from './character-card';
import { DocumentsSection } from './documents-section';
import { EditorHeader } from './editor-header';
import { CoverBanner, CoverSheet } from './story-cover';
import { VoiceField } from './voice-field';
import {
    ADD_CHARACTER_ID,
    FieldPlace,
    missingByTab,
    neededIds,
    placeOf,
    placeOfField,
    TabKey,
    tabFrom,
    TABS,
} from './editor-tabs';
import { FieldMarksContext } from './field-marks';
import { ConfirmButton, SegmentedField, TextField } from './fields';
import { OpeningPreview } from './opening-preview';
import { fieldDomId, FieldRewrites, rewritableField, rewriteKey, RewriteStates } from './rewrite';
import { LoreCard } from './lore-card';
import { EDITOR_CARD, FoldingCard, isCardFolded, NOTE, openAdded, openCard } from './folding-card';
import { SavedReplyList } from '@/components/saved-replies/saved-reply-list';
import { storySavedReplies } from '@/lib/saved-replies';
import { ReplaceRuleList } from '@/components/replace-rules/replace-rule-list';
import { storyReplaceRules } from '@/lib/replace-rules';
import { SceneCard } from './scene-card';
import { StartingBeliefsCard } from './starting-beliefs-card';
import { StartingBondsCard } from './starting-bonds-card';
import { StatusBox } from './status-box';

type StoryText = 'title' | 'setting' | 'opening';
type StyleKey = keyof Story['style'];

/** How long a field stays lit after a jump to it or a rewrite of it. */
const FLASH_MS = 2600;

function moved<T extends { id: number }>(items: T[], id: number, direction: -1 | 1): number[] {
    const ids = items.map((item) => item.id);
    const from = ids.indexOf(id);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= ids.length) return ids;
    ids.splice(from, 1);
    ids.splice(to, 0, id);
    return ids;
}

function without(states: RewriteStates, key: string): RewriteStates {
    const { [key]: _gone, ...rest } = states;
    return rest;
}

function prefersReducedMotion(): boolean {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** What a jump focuses: the target when it takes focus itself (an input, Add Character), else a group's first stop. */
function focusStop(target: HTMLElement): HTMLElement | null {
    return target.tabIndex >= 0 ? target : target.querySelector<HTMLElement>('input, textarea, [tabindex="0"]');
}

/** Whether the element fits in the band the page's scroll padding leaves: under the header, above the sheet. */
function fitsInView(target: HTMLElement): boolean {
    const root = getComputedStyle(document.documentElement);
    const padding = (parseFloat(root.scrollPaddingTop) || 0) + (parseFloat(root.scrollPaddingBottom) || 0);
    return target.offsetHeight <= window.innerHeight - padding;
}

/** The tab bar runs down the side from this width (the desktop layout), and across the top below it. */
const SIDE_TABS = '(min-width: 1024px)';

/** Whether the tab bar runs down the side now, kept up to date as the window changes (audit L28). */
function useSideTabs(): boolean {
    const [side, setSide] = useState(false);
    useEffect(() => {
        const query = window.matchMedia(SIDE_TABS);
        const update = () => setSide(query.matches);
        update();
        query.addEventListener('change', update);
        return () => query.removeEventListener('change', update);
    }, []);
    return side;
}

/** Under the first Sample on a page (.scratch/read-aloud/spec.md, "Story editor"). */
const SAMPLE_COST_HINT = 'A sample costs a fraction of a cent, once per voice; after that it plays for free.';

/** A screen this short (a phone on its side) keeps the header and tabs in the page instead of stuck on top (M48). */
const SHORT_SCREEN = '(max-height: 500px)';

/*
 * The layout. On a phone the header and the tab bar stick together under the top edge. On a
 * desktop (lg) the header row sticks across the top, the tabs are a list down the left that
 * sticks under it, and everything else is one column beside them. On a short screen nothing
 * sticks (M48).
 */
const EDITOR = 'lg:grid lg:grid-cols-[11rem_minmax(0,1fr)] lg:items-start lg:gap-x-10';
const TOP = [
    'sticky top-0 z-sticky -mx-4 mb-3 border-b border-line bg-bg px-2 pt-[max(--spacing(1),env(safe-area-inset-top))]',
    '[@media(max-height:500px)]:static lg:contents',
].join(' ');
const HEADER_ROW = [
    'lg:sticky lg:top-0 lg:z-sticky lg:col-span-full lg:-mx-10 lg:-mt-9 lg:mb-6 lg:border-b lg:border-line lg:bg-bg lg:px-10 lg:py-3',
    'lg:[@media(max-height:500px)]:static',
].join(' ');
const TAB_LIST = [
    'flex gap-1 overflow-x-auto px-1 pt-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
    'lg:sticky lg:top-[calc(var(--editor-top,0px)+--spacing(6))] lg:col-start-1 lg:flex-col lg:overflow-visible lg:p-0',
].join(' ');
/** A tab: 44px tall (H26), a pill across the top, a row in the side list. */
const TAB = [
    'bare-button flex min-h-11 flex-none items-center gap-2 rounded-full px-3.5 py-2',
    'text-md font-semibold whitespace-nowrap text-muted',
    'press focus-ring-inset aria-selected:bg-accent-soft aria-selected:text-text',
    'lg:justify-between lg:rounded-md lg:px-4 lg:text-left lg:not-aria-selected:hover:bg-surface lg:not-aria-selected:hover:text-text',
].join(' ');
/** How many fields on the tab are needed to play: a number, so it doesn't rest on colour (L30). */
const TAB_COUNT =
    'grid h-5 min-w-5 place-items-center rounded-full border border-warning-line bg-warning-surface px-1 text-xs leading-none font-bold text-status-toggle-text';

/**
 * The Story editor (spec: "Story authoring module", and Friendly UI's "Story editor"). The
 * local Story is what the author sees; every edit is saved on its own, and each answer brings
 * the playable status up to date. One tab panel shows at a time, and the tab is kept in the
 * URL. Every text field has a ✨ in its label row (spec: "Rewrite this field"), which
 * regenerates just that field with the whole Story as context.
 */
export function StoryEditor({ initial }: { initial: Story }) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { reportUnreachable } = useConnection();
    const [story, setStory] = useState<Story>(initial);
    const autosave = useAutosave();
    const { state, queue, cancel, commit, flush } = autosave;
    const voices = useVoices();
    const defaultNarration = voices?.defaultNarrationVoice ?? DEFAULT_NARRATION_VOICE;
    /** The voice narration reads in now: the Story's, else the default. */
    const narrationVoice = story.narrationVoice ?? defaultNarration;
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [rewrites, setRewrites] = useState<RewriteStates>({});
    const [tab, setTab] = useState<TabKey>(() => tabFrom(searchParams.get('tab')));
    const [flashed, setFlashed] = useState<string | null>(null);
    const [previewOpen, setPreviewOpen] = useState(false);
    const [coverOpen, setCoverOpen] = useState(false);
    /** Just made from a Character card: the one-time notice shows until dismissed or the page is left. */
    const [fromCard, setFromCard] = useState(() => searchParams.get(FROM_CARD_PARAM) !== null);
    const flashTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
    const tabList = useRef<HTMLDivElement>(null);
    const header = useRef<HTMLDivElement>(null);
    const headerRow = useRef<HTMLDivElement>(null);
    const storyId = initial.id;
    const sideTabs = useSideTabs();

    useEffect(() => () => clearTimeout(flashTimer.current), []);

    // One time: the flag leaves the URL at once, so a reload or Back doesn't show the notice again.
    useEffect(() => {
        const url = new URL(window.location.href);
        if (!url.searchParams.has(FROM_CARD_PARAM)) return;
        url.searchParams.delete(FROM_CARD_PARAM);
        window.history.replaceState(null, '', url);
    }, []);

    // The tab bar scrolls sideways on a phone: keep the selected tab in sight, e.g. after a jump,
    // in the middle rather than under an end's fade (docs/ui-audit-2026-11-13.md, M11).
    useEffect(() => {
        tabList.current
            ?.querySelector('[aria-selected="true"]')
            ?.scrollIntoView({ block: 'nearest', inline: 'center' });
    }, [tab]);
    // An end that hides tabs fades out, so Scenes and Lore off the edge are seen to be there (M11).
    const tabFade = useScrollFade(tabList);

    /** A field save: keep what the author typed, take the status from the API. */
    const applyStatus = useCallback((saved: Story) => {
        setStory((current) => ({
            ...current,
            playable: saved.playable,
            missing: saved.missing,
            updatedAt: saved.updatedAt,
        }));
    }, []);
    /** A structural change: the API's Story becomes the editor's. */
    const applyWhole = useCallback((saved: Story) => setStory(saved), []);
    /**
     * A drawn Expression, which lands outside the save queue: only the Characters' Expressions are
     * taken from the answer, so nothing typed while it drew is put back.
     */
    const applyExpressions = useCallback((saved: Story) => {
        setStory((current) => ({
            ...current,
            characters: current.characters.map((character) => {
                const answered = saved.characters.find((other) => other.id === character.id);
                return answered ? { ...character, expressions: answered.expressions } : character;
            }),
        }));
    }, []);
    /**
     * The assistant (ticket 23): its answers land through the same chain as structural changes,
     * and the editor shows the first changed field, without taking focus from the sheet.
     */
    const assistant = useStoryAssistant({
        storyId,
        commit,
        applyWhole,
        onApplied: (changes: AppliedChange[]) => {
            const field = changes.map(fieldOf).find((request) => request !== null);
            if (field) showField(field, { focus: false });
        },
    });
    const highlights = assistant.highlights;

    /** Shows a tab, and keeps it in the URL so reload and back return to it. */
    const selectTab = useCallback((next: TabKey) => {
        setTab(next);
        const url = new URL(window.location.href);
        if (next === 'story') url.searchParams.delete('tab');
        else url.searchParams.set('tab', next);
        window.history.replaceState(null, '', url);
    }, []);

    const flash = useCallback((domId: string) => {
        clearTimeout(flashTimer.current);
        setFlashed(domId);
        flashTimer.current = setTimeout(() => setFlashed(null), FLASH_MS);
    }, []);

    /**
     * A field's tab, then the field scrolled into view and lit, and focused unless the author is
     * busy elsewhere. The page's scroll padding keeps it under the header and above the sheet; a
     * field too tall for that band shows from its top, where its label is.
     */
    const jumpTo = (place: FieldPlace, { focus }: { focus: boolean }) => {
        // Render the tab now, so its field is in the page to scroll to.
        flushSync(() => selectTab(place.tab));
        if (!place.domId) return;
        const target = document.getElementById(place.domId);
        if (!target) return;
        // A field in a folded card: unfold it now, so there is something to scroll to and focus.
        const foldKey = target.closest<HTMLElement>('[data-fold-key]')?.dataset.foldKey;
        if (foldKey && isCardFolded(foldKey)) flushSync(() => openCard(foldKey));
        target.scrollIntoView({
            block: fitsInView(target) ? 'center' : 'start',
            behavior: prefersReducedMotion() ? 'auto' : 'smooth',
        });
        if (focus) focusStop(target)?.focus({ preventScroll: true });
        flash(place.domId);
    };
    /** A missing item's link: its field, focused. */
    const goTo = (item: MissingField) => jumpTo(placeOf(item.field, story), { focus: true });
    /** A field the Assistant changed: on landing, and from its link in the transcript. */
    const showField = (field: RewriteRequest, how: { focus: boolean }) => jumpTo(placeOfField(field), how);

    // What scrolls into view (a jump, Tab, the browser's own scroll to a focused field) lands
    // under the sticky header, kept measured as it wraps, and above the Assistant's sheet. On a
    // phone the header and the tabs stick together; on a wide screen the tabs are a side list and
    // only the header row sticks (the top block is then `display: contents`).
    useEffect(() => {
        const node = header.current;
        const row = headerRow.current;
        if (!node || !row) return;
        const root = document.documentElement;
        // On a short screen (a phone on its side) nothing sticks (audit M48), so nothing is under it.
        const measure = () => {
            const sticky = getComputedStyle(node).display === 'contents' ? row : node;
            const sticks = getComputedStyle(sticky).position === 'sticky';
            root.style.setProperty('--editor-top', sticks ? `${sticky.offsetHeight}px` : '0px');
        };
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(node);
        observer.observe(row);
        const short = window.matchMedia(SHORT_SCREEN);
        short.addEventListener('change', measure);
        root.style.scrollPaddingTop = 'var(--editor-top, 0px)';
        return () => {
            observer.disconnect();
            short.removeEventListener('change', measure);
            root.style.scrollPaddingTop = '';
            root.style.removeProperty('--editor-top');
        };
    }, []);
    useEffect(() => {
        if (!assistant.open) return;
        const root = document.documentElement;
        root.style.scrollPaddingBottom = 'var(--sheet-half)';
        return () => {
            root.style.scrollPaddingBottom = '';
        };
    }, [assistant.open]);

    const marks = useMemo(() => ({ needed: neededIds(story.missing, story), flashed }), [story, flashed]);
    // Each Character's colour and picture, for the headers of their cards.
    const castIds = story.characters.map((character) => character.id);
    const portraits = portraitsOf(story.characters);
    const tabsMissing = useMemo(() => missingByTab(story.missing, story), [story]);

    const setStoryText = (field: StoryText, value: string) => {
        setStory((current) => ({ ...current, [field]: value }));
        queue(`story.${field}`, () => storyApi.update(storyId, { [field]: value }), applyStatus);
    };
    const setStyle = <K extends StyleKey>(field: K, value: Story['style'][K]) => {
        setStory((current) => ({ ...current, style: { ...current.style, [field]: value } }));
        queue(`style.${field}`, () => storyApi.update(storyId, { [field]: value }), applyStatus);
    };
    const setBackdrop = (backdrop: Story['backdrop']) => {
        setStory((current) => ({ ...current, backdrop }));
        queue('story.backdrop', () => storyApi.update(storyId, { backdrop }), applyStatus);
    };
    const setNarrationVoice = (voice: string | null) => {
        setStory((current) => ({ ...current, narrationVoice: voice }));
        queue('story.narrationVoice', () => storyApi.update(storyId, { narrationVoice: voice }), applyStatus);
    };
    const setRoleText = (field: 'name' | 'description', value: string) => {
        setStory((current) => ({ ...current, role: { ...current.role, [field]: value } }));
        queue(`role.${field}`, () => storyApi.updateRole(storyId, { [field]: value }), applyStatus);
    };

    const setCharacterField = <K extends keyof Story['characters'][number]>(
        characterId: number,
        field: K,
        value: Story['characters'][number][K],
    ) => {
        setStory((current) => ({
            ...current,
            characters: current.characters.map((c) => (c.id === characterId ? { ...c, [field]: value } : c)),
        }));
        queue(
            `character.${characterId}.${field}`,
            () => storyApi.updateCharacter(storyId, characterId, { [field]: value }),
            applyStatus,
        );
    };
    const setBondText = (bondId: number, field: 'label' | 'description', value: string) => {
        setStory((current) => ({
            ...current,
            startingBonds: current.startingBonds.map((b) => (b.id === bondId ? { ...b, [field]: value } : b)),
        }));
        queue(
            `bond.${bondId}.${field}`,
            () => storyApi.updateStartingBond(storyId, bondId, { [field]: value }),
            applyStatus,
        );
    };
    const setBondLevel = (bondId: number, axis: BondAxis, level: number) => {
        setStory((current) => ({
            ...current,
            startingBonds: current.startingBonds.map((b) => (b.id === bondId ? { ...b, [axis]: level } : b)),
        }));
        queue(`bond.${bondId}.${axis}`, () => storyApi.updateStartingBond(storyId, bondId, { [axis]: level }), applyStatus);
    };
    /**
     * The Starting Beliefs as the author now has them: the whole list is saved, without the ones
     * still waiting for text (.scratch/memory-by-meaning/spec.md: "the whole list").
     */
    const setStartingBeliefs = (beliefs: StartingBelief[]) => {
        setStory((current) => ({ ...current, startingBeliefs: beliefs }));
        const written = beliefs.filter((belief) => belief.text.trim() !== '').map((belief) => ({ characterId: belief.characterId, text: belief.text }));
        queue('startingBeliefs', () => storyApi.setStartingBeliefs(storyId, written), applyStatus);
    };
    const setSceneText = (sceneId: number, field: 'name' | 'situation' | 'moveOnCondition', value: string) => {
        setStory((current) => ({
            ...current,
            scenes: current.scenes.map((s) => (s.id === sceneId ? { ...s, [field]: value } : s)),
        }));
        queue(`scene.${sceneId}.${field}`, () => storyApi.updateScene(storyId, sceneId, { [field]: value }), applyStatus);
    };
    const setSceneGates = (sceneId: number, gates: SceneBondGate[]) => {
        setStory((current) => ({
            ...current,
            scenes: current.scenes.map((s) => (s.id === sceneId ? { ...s, gates } : s)),
        }));
        // The whole list each time: the newest one wins (.scratch/bond-axes/spec.md, "API").
        queue(`scene.${sceneId}.gates`, () => storyApi.setSceneGates(storyId, sceneId, gates), applyStatus);
    };
    const setDocumentTitle = (documentId: number, title: string) => {
        setStory((current) => ({
            ...current,
            documents: current.documents.map((document) => (document.id === documentId ? { ...document, title } : document)),
        }));
        queue(`document.${documentId}.title`, () => storyApi.renameDocument(storyId, documentId, title), applyStatus);
    };
    const setLore = <K extends keyof LoreEntryFields>(loreId: number, field: K, value: LoreEntry[K]) => {
        setStory((current) => ({
            ...current,
            lore: current.lore.map((entry) => (entry.id === loreId ? { ...entry, [field]: value } : entry)),
        }));
        queue(`lore.${loreId}.${field}`, () => storyApi.updateLoreEntry(storyId, loreId, { [field]: value }), applyStatus);
    };

    /**
     * A Lore entry's patterns (.scratch/lore-triggers/spec.md): the API may refuse one that
     * doesn't compile, so the editor takes them only once saved, and a refusal goes to the field.
     */
    const setLorePatterns = (loreId: number, patterns: string[], onSaved: () => void, onError: (message: string) => void) => {
        queue(
            `lore.${loreId}.patterns`,
            () => storyApi.updateLoreEntry(storyId, loreId, { patterns }),
            (saved: Story) => {
                applyStatus(saved);
                const stored = saved.lore.find((entry) => entry.id === loreId)?.patterns ?? patterns;
                setStory((current) => ({
                    ...current,
                    lore: current.lore.map((entry) => (entry.id === loreId ? { ...entry, patterns: stored } : entry)),
                }));
                onSaved();
            },
            onError,
        );
    };

    /**
     * A rewrite goes after pending edits, like a structural change, and its answer replaces
     * the Story: only the one field differs, and it is lit as it lands. A failure shows at
     * that field, with Retry.
     */
    const rewrite = (request: RewriteRequest) => {
        const key = rewriteKey(request);
        setRewrites((current) => ({ ...current, [key]: { kind: 'busy' } }));
        void commit(
            () => storyApi.rewrite(storyId, request),
            (saved) => {
                applyWhole(saved);
                setRewrites((current) => without(current, key));
                flash(fieldDomId(request));
            },
            (message) => setRewrites((current) => ({ ...current, [key]: { kind: 'error', message } })),
        );
    };
    const fieldRewrites: FieldRewrites = { states: rewrites, highlights, onRewrite: rewrite };
    const rewritable = (request: RewriteRequest) => rewritableField(request, fieldRewrites);
    const styleHighlighted = (field: StyleKey) => highlights.has(rewriteKey({ target: 'story', field }));

    const play = () => router.push(`/stories/${storyId}/chats`);

    const deleteStory = async () => {
        setDeleteError(null);
        try {
            await storyApi.remove(storyId);
            router.push('/');
        } catch (error) {
            if (error instanceof ApiUnreachableError) reportUnreachable();
            else setDeleteError(error instanceof Error ? error.message : 'Could not delete the Story.');
        }
    };

    /** The arrow keys, Home and End move along the tab bar, as in any tab list. */
    const onTabKey = (event: KeyboardEvent<HTMLDivElement>) => {
        const index = movedIndex(event, TABS.findIndex((t) => t.key === tab), TABS.length, sideTabs ? 'vertical' : 'horizontal');
        if (index === null) return;
        event.preventDefault();
        selectTab(TABS[index].key);
        focusChoice(tabList.current, '[role="tab"]', index);
    };

    return (
        <main className={['wide', EDITOR, assistant.open && 'pb-(--sheet-half)'].filter(Boolean).join(' ')}>
            <div ref={header} className={TOP}>
                <div ref={headerRow} className={HEADER_ROW}>
                    <EditorHeader
                        title={storyTitle(story)}
                        save={state}
                        playable={story.playable}
                        missingCount={story.missing.length}
                        onAssistant={assistant.openSheet}
                        onPlay={play}
                    />
                </div>
                <div
                    ref={tabList}
                    className={`${TAB_LIST} ${SCROLL_FADES[tabFade]}`}
                    data-fade={tabFade}
                    role="tablist"
                    aria-label="Story sections"
                    aria-orientation={sideTabs ? 'vertical' : 'horizontal'}
                    onKeyDown={onTabKey}
                >
                    {TABS.map((t) => {
                        const missingHere = tabsMissing.get(t.key) ?? 0;
                        return (
                            <button
                                key={t.key}
                                type="button"
                                role="tab"
                                id={`tab-${t.key}`}
                                aria-selected={tab === t.key}
                                aria-controls="editor-panel"
                                tabIndex={tab === t.key ? 0 : -1}
                                // The count is said in words too, for a screen reader.
                                aria-label={missingHere > 0 ? `${t.label}, has missing fields (${missingHere})` : undefined}
                                className={TAB}
                                onClick={() => selectTab(t.key)}
                            >
                                {t.label}
                                {missingHere > 0 && (
                                    <span className={TAB_COUNT} aria-hidden="true">
                                        {missingHere}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>
            <div className="min-w-0 lg:col-start-2">
                {/* The cover heads the Story tab only: on the others it pushed the fields a quarter of the screen down (M12). */}
                {tab === 'story' && <CoverBanner story={story} onOpen={() => setCoverOpen(true)} />}
                {fromCard && (
                    <section className={`${EDITOR_CARD} border border-accent-line`} aria-label="Made from a Character card">
                        <p className="mt-0 mb-3">Made from a Character card. Fill in what&apos;s marked, or ask the Story assistant to tidy it.</p>
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                className="button button-small"
                                onClick={() => assistant.openSheet(tidyMessage(story.characters[0]?.name || 'the Character'))}
                            >
                                Tidy with the Story assistant
                            </button>
                            <button type="button" className="button button-quiet button-small" onClick={() => setFromCard(false)}>
                                Dismiss
                            </button>
                        </div>
                    </section>
                )}
                <StatusBox playable={story.playable} missing={story.missing} onGo={goTo} foldKey={`statusOpen:${storyId}`} />

                <FieldMarksContext.Provider value={marks}>
                    <div id="editor-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
                        {tab === 'story' && (
                            <>
                                <section className={EDITOR_CARD} aria-label="Story">
                                    <TextField
                                        label="Title"
                                        value={story.title}
                                        required
                                        hint="The name on the Story's card."
                                        onChange={(v) => setStoryText('title', v)}
                                        {...rewritable({ target: 'story', field: 'title' })}
                                    />
                                    <TextField
                                        label="Setting"
                                        value={story.setting}
                                        multiline
                                        rows={4}
                                        required
                                        hint="Place, situation, premise and tone, in plain language."
                                        onChange={(v) => setStoryText('setting', v)}
                                        {...rewritable({ target: 'story', field: 'setting' })}
                                    />
                                    <TextField
                                        label="Opening"
                                        value={story.opening}
                                        multiline
                                        rows={4}
                                        required
                                        hint="The passage that begins every Chat. Start a line with @Name: for a Character's speech."
                                        onChange={(v) => setStoryText('opening', v)}
                                        {...rewritable({ target: 'story', field: 'opening' })}
                                    />
                                    <button type="button" className={ADD_BUTTON_IN_CARD} onClick={() => setPreviewOpen(true)}>
                                        <PlayIcon size={16} />
                                        Preview the Opening
                                    </button>
                                </section>
                                {/* Delete Story: quiet, at the very foot of the Story tab, and it asks first. */}
                                <div className="mt-6 mb-2 text-center [&_.confirm]:justify-center [&_.confirm]:text-left">
                                    <ConfirmButton
                                        label="Delete Story"
                                        question="Delete this Story and everything under it?"
                                        warning="Its Role, Characters, Scenes, starting Bonds and Lore go too. There is no undo."
                                        confirmLabel="Delete"
                                        busyLabel="Deleting…"
                                        danger
                                        className="bg-transparent px-4 text-md text-danger underline"
                                        onConfirm={deleteStory}
                                    />
                                    {deleteError && <p role="alert">{deleteError}</p>}
                                </div>
                            </>
                        )}

                        {tab === 'style' && (
                            <>
                                <section className={EDITOR_CARD} aria-label="Style">
                                    <SegmentedField
                                        label="Point of view"
                                        value={story.style.pov}
                                        options={POV_LABELS}
                                        hint='Who tells the story: "I", "you" or "they".'
                                        onChange={(v) => setStyle('pov', v)}
                                        highlighted={styleHighlighted('pov')}
                                        domId={fieldDomId({ target: 'story', field: 'pov' })}
                                    />
                                    <SegmentedField
                                        label="Tense"
                                        value={story.style.tense}
                                        options={TENSE_LABELS}
                                        hint="Told as it happens, or looking back."
                                        onChange={(v) => setStyle('tense', v)}
                                        highlighted={styleHighlighted('tense')}
                                        domId={fieldDomId({ target: 'story', field: 'tense' })}
                                    />
                                    <SegmentedField
                                        label="Reply length"
                                        value={story.style.replyLength}
                                        options={REPLY_LENGTH_LABELS}
                                        hint="How much the AI writes each turn."
                                        onChange={(v) => setStyle('replyLength', v)}
                                        highlighted={styleHighlighted('replyLength')}
                                        domId={fieldDomId({ target: 'story', field: 'replyLength' })}
                                    />
                                    <TextField
                                        label="Image style"
                                        value={story.style.imageStyle}
                                        wrap
                                        placeholder='e.g. "anime, soft colours"'
                                        hint="Optional. One look for every Snapshot and Reference image."
                                        onChange={(v) => setStyle('imageStyle', v)}
                                        {...rewritable({ target: 'story', field: 'imageStyle' })}
                                    />
                                    <VoiceField
                                        label="Narration voice"
                                        value={story.narrationVoice}
                                        noneLabel={`Default (${voiceName(defaultNarration, voices?.voices)})`}
                                        voices={voices}
                                        sampleVoice={narrationVoice}
                                        onChange={setNarrationVoice}
                                        hint={SAMPLE_COST_HINT}
                                    />
                                    <SegmentedField
                                        label="Chat backdrop"
                                        value={story.backdrop}
                                        options={BACKDROP_LABELS}
                                        hint="Dimmed behind the Messages. Without a Snapshot yet, the Cover shows."
                                        onChange={setBackdrop}
                                    />
                                </section>
                                <FoldingCard foldKey={`saved-replies:${storyId}`} label="Saved replies" title="Saved replies" fieldPrefixes={[]}>
                                    <p className={NOTE}>
                                        Lines for this Story only, listed first in the composer&apos;s Saved replies tray. {'{user}'} becomes the
                                        name you wear in that Chat.
                                    </p>
                                    <SavedReplyList
                                        initial={story.savedReplies}
                                        store={storySavedReplies(storyId, applyStatus)}
                                        autosave={autosave}
                                        saveKey="savedReplies.story"
                                    />
                                </FoldingCard>
                                <FoldingCard foldKey={`replace-rules:${storyId}`} label="Replace rules" title="Replace rules" fieldPrefixes={[]}>
                                    <p className={NOTE}>
                                        Find and replace for this Story only, run after the app-wide rules in Settings. On AI Messages
                                        changes how replies read, never what is stored; On my Messages fixes what you send.
                                    </p>
                                    <ReplaceRuleList
                                        initial={story.replaceRules}
                                        store={storyReplaceRules(storyId, applyStatus)}
                                        autosave={autosave}
                                        saveKey="replaceRules.story"
                                    />
                                </FoldingCard>
                            </>
                        )}

                        {tab === 'role' && (
                            <section className={EDITOR_CARD} aria-label="Role">
                                <TextField
                                    label="Name"
                                    value={story.role.name}
                                    required
                                    hint="Who you are in this Story."
                                    onChange={(v) => setRoleText('name', v)}
                                    {...rewritable({ target: 'role', field: 'name' })}
                                />
                                <TextField
                                    label="Description"
                                    value={story.role.description}
                                    multiline
                                    required
                                    hint="The part you play. The Characters always know who they are talking to."
                                    onChange={(v) => setRoleText('description', v)}
                                    {...rewritable({ target: 'role', field: 'description' })}
                                />
                            </section>
                        )}

                        {tab === 'characters' && (
                            <section aria-label="Characters">
                                {story.characters.length === 0 && <p className={NOTE}>No Characters yet. A Story needs at least one.</p>}
                                {story.characters.map((character, index) => (
                                    <CharacterCard
                                        key={character.id}
                                        storyId={storyId}
                                        character={character}
                                        imageStyle={story.style.imageStyle}
                                        flush={flush}
                                        commit={(run, onError) => commit(run, applyWhole, onError)}
                                        onExpressionDrawn={applyExpressions}
                                        index={index}
                                        count={story.characters.length}
                                        colour={characterColour(character.id, castIds)}
                                        portrait={portraits[character.id]}
                                        rewrites={fieldRewrites}
                                        onText={(field, value) => setCharacterField(character.id, field, value)}
                                        onExampleLines={(lines) => setCharacterField(character.id, 'exampleLines', lines)}
                                        voices={voices}
                                        narrationVoice={narrationVoice}
                                        onSpeakingVoice={(voice) => setCharacterField(character.id, 'speakingVoice', voice)}
                                        sampleHint={index === 0 ? SAMPLE_COST_HINT : undefined}
                                        onMove={(direction) =>
                                            void commit(
                                                () => storyApi.reorderCharacters(storyId, moved(story.characters, character.id, direction)),
                                                applyWhole,
                                            )
                                        }
                                        onRemove={() => commit(() => storyApi.removeCharacter(storyId, character.id), applyWhole)}
                                    />
                                ))}
                                <button
                                    type="button"
                                    id={ADD_CHARACTER_ID}
                                    className={ADD_BUTTON}
                                    data-flash={flashed === ADD_CHARACTER_ID || undefined}
                                    disabled={story.characters.length >= MAX_CHARACTERS}
                                    onClick={() => void commit(() => storyApi.addCharacter(storyId), (saved) => {
                                        openAdded('character', story.characters, saved.characters);
                                        applyWhole(saved);
                                    })}
                                >
                                    + Add Character
                                </button>
                                {story.characters.length >= MAX_CHARACTERS && (
                                    <p className={NOTE}>A Story holds at most {MAX_CHARACTERS} Characters.</p>
                                )}
                            </section>
                        )}

                        {tab === 'bonds' && (
                            <section aria-label="Bonds">
                                <p className={NOTE}>Where the Characters stand with each other, and with you, when a Chat starts.</p>
                                {story.characters.length === 0 && <p className={NOTE}>Add a Character first, on the Characters tab.</p>}
                                {story.characters.map((character, index) => (
                                    <StartingBondsCard
                                        key={character.id}
                                        character={character}
                                        index={index}
                                        colour={characterColour(character.id, castIds)}
                                        portrait={portraits[character.id]}
                                        cast={story.characters}
                                        role={story.role}
                                        bonds={story.startingBonds.filter((bond) => bond.fromCharacterId === character.id)}
                                        rewrites={fieldRewrites}
                                        onAdd={(toCharacterId) =>
                                            void commit(
                                                () => storyApi.addStartingBond(storyId, { fromCharacterId: character.id, toCharacterId }),
                                                applyWhole,
                                            )
                                        }
                                        onText={setBondText}
                                        onLevel={setBondLevel}
                                        onRemove={(bondId) => commit(() => storyApi.removeStartingBond(storyId, bondId), applyWhole)}
                                    />
                                ))}
                                <StartingBeliefsCard cast={story.characters} beliefs={story.startingBeliefs ?? []} onChange={setStartingBeliefs} />
                            </section>
                        )}

                        {tab === 'scenes' && (
                            <section aria-label="Scenes">
                                {story.scenes.length === 0 && <p className={NOTE}>Optional. Without Scenes the story unfolds freely.</p>}
                                {story.scenes.map((scene, index) => (
                                    <SceneCard
                                        key={scene.id}
                                        scene={scene}
                                        index={index}
                                        count={story.scenes.length}
                                        rewrites={fieldRewrites}
                                        cast={story.characters}
                                        role={story.role}
                                        onText={(field, value) => setSceneText(scene.id, field, value)}
                                        onGates={(gates) => setSceneGates(scene.id, gates)}
                                        onMove={(direction) =>
                                            void commit(() => storyApi.reorderScenes(storyId, moved(story.scenes, scene.id, direction)), applyWhole)
                                        }
                                        onRemove={() => commit(() => storyApi.removeScene(storyId, scene.id), applyWhole)}
                                    />
                                ))}
                                <button type="button" className={ADD_BUTTON} onClick={() => void commit(() => storyApi.addScene(storyId), (saved) => {
                                    openAdded('scene', story.scenes, saved.scenes);
                                    applyWhole(saved);
                                })}>
                                    + Add Scene
                                </button>
                            </section>
                        )}

                        {tab === 'lore' && (
                            <section aria-label="Lore">
                                {story.lore.length === 0 && (
                                    <p className={NOTE}>
                                        Optional. Notes about your world: places, peoples, customs, things. Each reaches the story only when
                                        its name or a keyword comes up, so the Setting can stay short.
                                    </p>
                                )}
                                {story.lore.map((entry, index) => (
                                    <LoreCard
                                        key={entry.id}
                                        entry={entry}
                                        index={index}
                                        rewrites={fieldRewrites}
                                        onText={(field, value) => setLore(entry.id, field, value)}
                                        onKeywords={(keywords) => setLore(entry.id, 'keywords', keywords)}
                                        onAlwaysOn={(alwaysOn) => setLore(entry.id, 'alwaysOn', alwaysOn)}
                                        onTrigger={(field, value) => setLore(entry.id, field, value)}
                                        onInvalidNumber={(field) => cancel(`lore.${entry.id}.${field}`)}
                                        onPatterns={(patterns, onSaved, onError) => setLorePatterns(entry.id, patterns, onSaved, onError)}
                                        onRemove={() => commit(() => storyApi.removeLoreEntry(storyId, entry.id), applyWhole)}
                                    />
                                ))}
                                <button type="button" className={ADD_BUTTON} onClick={() => void commit(() => storyApi.addLoreEntry(storyId), (saved) => {
                                    openAdded('lore', story.lore, saved.lore);
                                    applyWhole(saved);
                                })}>
                                    + Add Lore entry
                                </button>
                                <DocumentsSection
                                    storyId={storyId}
                                    documents={story.documents}
                                    commit={commit}
                                    applyWhole={applyWhole}
                                    onTitle={setDocumentTitle}
                                />
                            </section>
                        )}
                    </div>
                </FieldMarksContext.Provider>
            </div>

            {coverOpen && (
                <CoverSheet story={story} commit={(run, onError) => commit(run, applyWhole, onError)} onClose={() => setCoverOpen(false)} />
            )}
            {assistant.open && <StoryAssistantSheet assistant={assistant} onShow={(field) => showField(field, { focus: true })} />}
            {previewOpen && (
                <OpeningPreview
                    storyId={storyId}
                    cast={story.characters.map((character) => character.id)}
                    portraits={portraits}
                    playable={story.playable}
                    flush={flush}
                    onPlay={play}
                    onClose={() => setPreviewOpen(false)}
                />
            )}
        </main>
    );
}

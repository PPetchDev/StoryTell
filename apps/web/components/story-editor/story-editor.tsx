'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import { useConnection } from '@/components/connection';
import { StoryAssistantSheet } from '@/components/story-assistant/story-assistant-sheet';
import { fieldOf, useStoryAssistant } from '@/components/story-assistant/use-story-assistant';
import { ApiUnreachableError } from '@/lib/api';
import { FROM_CARD_PARAM, tidyMessage } from '@/lib/character-card';
import { characterColour, portraitsOf } from '@/lib/character-colour';
import { isFolded, setFolded } from '@/lib/folds';
import { AppliedChange } from '@/lib/story-assistant';
import { DEFAULT_NARRATION_VOICE, useVoices, voiceName } from '@/lib/voices';
import {
    LoreEntry,
    LoreEntryFields,
    MAX_CHARACTERS,
    MissingField,
    POV_LABELS,
    REPLY_LENGTH_LABELS,
    RewriteRequest,
    Story,
    storyApi,
    storyTitle,
    TENSE_LABELS,
} from '@/lib/story';
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
    neededIds,
    placeOf,
    placeOfField,
    TabKey,
    tabFrom,
    TABS,
    tabsWithMissing,
} from './editor-tabs';
import { FieldMarksContext } from './field-marks';
import { ConfirmButton, SegmentedField, TextField } from './fields';
import { OpeningPreview } from './opening-preview';
import { fieldDomId, FieldRewrites, rewritableField, rewriteKey, RewriteStates } from './rewrite';
import { LoreCard } from './lore-card';
import { FoldingCard } from './folding-card';
import { SavedReplyList } from '@/components/saved-replies/saved-reply-list';
import { storySavedReplies } from '@/lib/saved-replies';
import { ReplaceRuleList } from '@/components/replace-rules/replace-rule-list';
import { storyReplaceRules } from '@/lib/replace-rules';
import { SceneCard } from './scene-card';
import { StartingBondsCard } from './starting-bonds-card';
import { StatusBox } from './status-box';
import styles from './story-editor.module.css';

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

/** Under the first ▶ Sample on a page (.scratch/read-aloud/spec.md, "Story editor"). */
const SAMPLE_COST_HINT = 'A sample costs a fraction of a cent, once per voice; after that it plays for free.';

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
    const { state, queue, commit, flush } = autosave;
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

    useEffect(() => () => clearTimeout(flashTimer.current), []);

    // One time: the flag leaves the URL at once, so a reload or Back doesn't show the notice again.
    useEffect(() => {
        const url = new URL(window.location.href);
        if (!url.searchParams.has(FROM_CARD_PARAM)) return;
        url.searchParams.delete(FROM_CARD_PARAM);
        window.history.replaceState(null, '', url);
    }, []);

    // The tab bar scrolls sideways on a phone: keep the selected tab in sight, e.g. after a jump.
    useEffect(() => {
        tabList.current
            ?.querySelector('[aria-selected="true"]')
            ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }, [tab]);

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
        if (foldKey && isFolded(foldKey)) flushSync(() => setFolded(foldKey, false));
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
        const measure = () => {
            const sticky = getComputedStyle(node).display === 'contents' ? row : node;
            root.style.setProperty('--editor-top', `${sticky.offsetHeight}px`);
        };
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(node);
        observer.observe(row);
        root.classList.add(styles.underHeaderRoot);
        return () => {
            observer.disconnect();
            root.classList.remove(styles.underHeaderRoot);
            root.style.removeProperty('--editor-top');
        };
    }, []);
    useEffect(() => {
        if (!assistant.open) return;
        const root = document.documentElement;
        root.classList.add(styles.underSheetRoot);
        return () => root.classList.remove(styles.underSheetRoot);
    }, [assistant.open]);

    const marks = useMemo(() => ({ needed: neededIds(story.missing, story), flashed }), [story, flashed]);
    // Each Character's colour and picture, for the headers of their cards.
    const castIds = story.characters.map((character) => character.id);
    const portraits = portraitsOf(story.characters);
    const tabsMissing = useMemo(() => tabsWithMissing(story.missing, story), [story]);

    const setStoryText = (field: StoryText, value: string) => {
        setStory((current) => ({ ...current, [field]: value }));
        queue(`story.${field}`, () => storyApi.update(storyId, { [field]: value }), applyStatus);
    };
    const setStyle = <K extends StyleKey>(field: K, value: Story['style'][K]) => {
        setStory((current) => ({ ...current, style: { ...current.style, [field]: value } }));
        queue(`style.${field}`, () => storyApi.update(storyId, { [field]: value }), applyStatus);
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
    const setSceneText = (sceneId: number, field: 'name' | 'situation' | 'moveOnCondition', value: string) => {
        setStory((current) => ({
            ...current,
            scenes: current.scenes.map((s) => (s.id === sceneId ? { ...s, [field]: value } : s)),
        }));
        queue(`scene.${sceneId}.${field}`, () => storyApi.updateScene(storyId, sceneId, { [field]: value }), applyStatus);
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
        const index = movedIndex(event, TABS.findIndex((t) => t.key === tab), TABS.length);
        if (index === null) return;
        event.preventDefault();
        selectTab(TABS[index].key);
        focusChoice(tabList.current, '[role="tab"]', index);
    };

    return (
        <main className={assistant.open ? `wide ${styles.editor} ${styles.underSheet}` : `wide ${styles.editor}`}>
            <div ref={header} className={styles.top}>
                <div ref={headerRow} className={styles.headerRow}>
                    <EditorHeader
                        title={storyTitle(story)}
                        save={state}
                        playable={story.playable}
                        missingCount={story.missing.length}
                        onAssistant={assistant.openSheet}
                        onPlay={play}
                    />
                </div>
                <div ref={tabList} className={styles.tabs} role="tablist" aria-label="Story sections" onKeyDown={onTabKey}>
                    {TABS.map((t) => (
                        <button
                            key={t.key}
                            type="button"
                            role="tab"
                            id={`tab-${t.key}`}
                            aria-selected={tab === t.key}
                            aria-controls="editor-panel"
                            tabIndex={tab === t.key ? 0 : -1}
                            // The dot is said in words too, for a screen reader.
                            aria-label={tabsMissing.has(t.key) ? `${t.label}, has missing fields` : undefined}
                            className={styles.tab}
                            onClick={() => selectTab(t.key)}
                        >
                            {t.label}
                            {tabsMissing.has(t.key) && <span className={styles.dot} aria-hidden="true" />}
                        </button>
                    ))}
                </div>
            </div>
            <CoverBanner story={story} onOpen={() => setCoverOpen(true)} />
            {coverOpen && (
                <CoverSheet
                    story={story}
                    commit={(run, onError) => commit(run, applyWhole, onError)}
                    onClose={() => setCoverOpen(false)}
                />
            )}
            {fromCard && (
                <section className={`${styles.card} ${styles.cardNotice}`} aria-label="Made from a Character card">
                    <p>Made from a Character card. Fill in what&apos;s marked, or ask the Story assistant to tidy it.</p>
                    <div className={styles.cardNoticeActions}>
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
            <StatusBox playable={story.playable} missing={story.missing} onGo={goTo} />

            <FieldMarksContext.Provider value={marks}>
                <div id="editor-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className={styles.panel}>
                    {tab === 'story' && (
                        <>
                            <section className={styles.card} aria-label="Story">
                                <TextField
                                    label="Title"
                                    value={story.title}
                                    hint="The name on the Story's card."
                                    onChange={(v) => setStoryText('title', v)}
                                    {...rewritable({ target: 'story', field: 'title' })}
                                />
                                <TextField
                                    label="Setting"
                                    value={story.setting}
                                    multiline
                                    rows={4}
                                    hint="Place, situation, premise and tone, in plain language."
                                    onChange={(v) => setStoryText('setting', v)}
                                    {...rewritable({ target: 'story', field: 'setting' })}
                                />
                                <TextField
                                    label="Opening"
                                    value={story.opening}
                                    multiline
                                    rows={4}
                                    hint="The passage that begins every Chat. Start a line with @Name: for a Character's speech."
                                    onChange={(v) => setStoryText('opening', v)}
                                    {...rewritable({ target: 'story', field: 'opening' })}
                                />
                                <button type="button" className={styles.add} onClick={() => setPreviewOpen(true)}>
                                    ▶ Preview the Opening
                                </button>
                            </section>
                            <div className={styles.deleteZone}>
                                <ConfirmButton
                                    label="Delete Story"
                                    question="Delete this Story and everything under it?"
                                    warning="Its Role, Characters, Scenes, starting Bonds and Lore go too. There is no undo."
                                    confirmLabel="Delete"
                                    danger
                                    onConfirm={() => void deleteStory()}
                                />
                                {deleteError && <p role="alert">{deleteError}</p>}
                            </div>
                        </>
                    )}

                    {tab === 'style' && (
                        <>
                            <section className={styles.card} aria-label="Style">
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
                            </section>
                            <FoldingCard foldKey={`saved-replies:${storyId}`} label="Saved replies" title="Saved replies" fieldPrefixes={[]}>
                                <p className={styles.note}>
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
                                <p className={styles.note}>
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
                        <section className={styles.card} aria-label="Role">
                            <TextField
                                label="Name"
                                value={story.role.name}
                                hint="Who you are in this Story."
                                onChange={(v) => setRoleText('name', v)}
                                {...rewritable({ target: 'role', field: 'name' })}
                            />
                            <TextField
                                label="Description"
                                value={story.role.description}
                                multiline
                                hint="The part you play. The Characters always know who they are talking to."
                                onChange={(v) => setRoleText('description', v)}
                                {...rewritable({ target: 'role', field: 'description' })}
                            />
                        </section>
                    )}

                    {tab === 'characters' && (
                        <section aria-label="Characters">
                            {story.characters.length === 0 && (
                                <p className={styles.note}>No Characters yet. A Story needs at least one.</p>
                            )}
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
                                    onRemove={() => void commit(() => storyApi.removeCharacter(storyId, character.id), applyWhole)}
                                />
                            ))}
                            <button
                                type="button"
                                id={ADD_CHARACTER_ID}
                                className={flashed === ADD_CHARACTER_ID ? `${styles.add} ${styles.flash}` : styles.add}
                                disabled={story.characters.length >= MAX_CHARACTERS}
                                onClick={() => void commit(() => storyApi.addCharacter(storyId), applyWhole)}
                            >
                                + Add Character
                            </button>
                            {story.characters.length >= MAX_CHARACTERS && (
                                <p className={styles.note}>A Story holds at most {MAX_CHARACTERS} Characters.</p>
                            )}
                        </section>
                    )}

                    {tab === 'bonds' && (
                        <section aria-label="Bonds">
                            <p className={styles.note}>Where the Characters stand with each other, and with you, when a Chat starts.</p>
                            {story.characters.length === 0 && (
                                <p className={styles.note}>Add a Character first, on the Characters tab.</p>
                            )}
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
                                    onRemove={(bondId) => void commit(() => storyApi.removeStartingBond(storyId, bondId), applyWhole)}
                                />
                            ))}
                        </section>
                    )}

                    {tab === 'scenes' && (
                        <section aria-label="Scenes">
                            {story.scenes.length === 0 && (
                                <p className={styles.note}>Optional. Without Scenes the story unfolds freely.</p>
                            )}
                            {story.scenes.map((scene, index) => (
                                <SceneCard
                                    key={scene.id}
                                    scene={scene}
                                    index={index}
                                    count={story.scenes.length}
                                    rewrites={fieldRewrites}
                                    onText={(field, value) => setSceneText(scene.id, field, value)}
                                    onMove={(direction) =>
                                        void commit(() => storyApi.reorderScenes(storyId, moved(story.scenes, scene.id, direction)), applyWhole)
                                    }
                                    onRemove={() => void commit(() => storyApi.removeScene(storyId, scene.id), applyWhole)}
                                />
                            ))}
                            <button
                                type="button"
                                className={styles.add}
                                onClick={() => void commit(() => storyApi.addScene(storyId), applyWhole)}
                            >
                                + Add Scene
                            </button>
                        </section>
                    )}

                    {tab === 'lore' && (
                        <section aria-label="Lore">
                            {story.lore.length === 0 && (
                                <p className={styles.note}>
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
                                    onPatterns={(patterns, onSaved, onError) => setLorePatterns(entry.id, patterns, onSaved, onError)}
                                    onRemove={() => void commit(() => storyApi.removeLoreEntry(storyId, entry.id), applyWhole)}
                                />
                            ))}
                            <button
                                type="button"
                                className={styles.add}
                                onClick={() => void commit(() => storyApi.addLoreEntry(storyId), applyWhole)}
                            >
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

            {assistant.open && (
                <StoryAssistantSheet assistant={assistant} onShow={(field) => showField(field, { focus: true })} />
            )}
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

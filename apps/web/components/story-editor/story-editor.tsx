'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import { useConnection } from '@/components/connection';
import { StoryAssistantSheet } from '@/components/story-assistant/story-assistant-sheet';
import { fieldOf, useStoryAssistant } from '@/components/story-assistant/use-story-assistant';
import { ApiUnreachableError } from '@/lib/api';
import { AppliedChange } from '@/lib/story-assistant';
import {
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
import { EditorHeader } from './editor-header';
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
    const { state, queue, commit, flush } = useAutosave();
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [rewrites, setRewrites] = useState<RewriteStates>({});
    const [tab, setTab] = useState<TabKey>(() => tabFrom(searchParams.get('tab')));
    const [flashed, setFlashed] = useState<string | null>(null);
    const [previewOpen, setPreviewOpen] = useState(false);
    const flashTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
    const tabList = useRef<HTMLDivElement>(null);
    const top = useRef<HTMLDivElement>(null);
    const storyId = initial.id;

    useEffect(() => () => clearTimeout(flashTimer.current), []);

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
     * The assistant (ticket 23): its answers land through the same chain as structural changes,
     * and the editor shows the first changed field, without taking focus from the sheet.
     */
    const assistant = useStoryAssistant({
        storyId,
        commit,
        applyWhole,
        onApplied: (changes: AppliedChange[]) => {
            const field = changes.map(fieldOf).find((request) => request !== null);
            if (field) jumpTo(placeOfField(field), { focus: false });
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
     * busy elsewhere. With the Assistant open, the page's scroll padding keeps it above the sheet.
     */
    const jumpTo = (place: FieldPlace, { focus }: { focus: boolean }) => {
        // Render the tab now, so its field is in the page to scroll to.
        flushSync(() => selectTab(place.tab));
        if (!place.domId) return;
        const target = document.getElementById(place.domId);
        if (!target) return;
        target.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
        // A field's input is the target itself; a group (segments, example lines) focuses its first stop.
        const stop = target.matches('input, textarea') ? target : target.querySelector<HTMLElement>('input, textarea, [tabindex="0"]');
        if (focus) stop?.focus({ preventScroll: true });
        flash(place.domId);
    };
    /** A missing item's link: its field, focused. */
    const goTo = (item: MissingField) => jumpTo(placeOf(item.field, story), { focus: true });

    // While the Assistant is open, scrolling a field into view (a jump, Tab, the browser's own
    // scroll to a focused field) keeps it between the sticky header and the sheet.
    useEffect(() => {
        if (!assistant.open) return;
        const root = document.documentElement;
        root.style.setProperty('--editor-top', `${top.current?.offsetHeight ?? 0}px`);
        root.classList.add(styles.underSheetRoot);
        return () => {
            root.classList.remove(styles.underSheetRoot);
            root.style.removeProperty('--editor-top');
        };
    }, [assistant.open]);

    const marks = useMemo(() => ({ needed: neededIds(story.missing, story), flashed }), [story, flashed]);
    const tabsMissing = useMemo(() => tabsWithMissing(story.missing, story), [story]);

    const setStoryText = (field: StoryText, value: string) => {
        setStory((current) => ({ ...current, [field]: value }));
        queue(`story.${field}`, () => storyApi.update(storyId, { [field]: value }), applyStatus);
    };
    const setStyle = <K extends StyleKey>(field: K, value: Story['style'][K]) => {
        setStory((current) => ({ ...current, style: { ...current.style, [field]: value } }));
        queue(`style.${field}`, () => storyApi.update(storyId, { [field]: value }), applyStatus);
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
        <main className={assistant.open ? styles.underSheet : undefined}>
            <div ref={top} className={styles.top}>
                <EditorHeader
                    title={storyTitle(story)}
                    save={state}
                    playable={story.playable}
                    missingCount={story.missing.length}
                    onAssistant={assistant.openPanel}
                    onPlay={play}
                />
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
                                    warning="Its Role, Characters, Scenes and starting Bonds go too. There is no undo."
                                    confirmLabel="Delete"
                                    danger
                                    onConfirm={() => void deleteStory()}
                                />
                                {deleteError && <p role="alert">{deleteError}</p>}
                            </div>
                        </>
                    )}

                    {tab === 'style' && (
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
                        </section>
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
                                    index={index}
                                    count={story.characters.length}
                                    rewrites={fieldRewrites}
                                    onText={(field, value) => setCharacterField(character.id, field, value)}
                                    onExampleLines={(lines) => setCharacterField(character.id, 'exampleLines', lines)}
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
                </div>
            </FieldMarksContext.Provider>

            {assistant.open && (
                <StoryAssistantSheet assistant={assistant} onShow={(field) => jumpTo(placeOfField(field), { focus: true })} />
            )}
            {previewOpen && (
                <OpeningPreview
                    storyId={storyId}
                    cast={story.characters.map((character) => character.id)}
                    playable={story.playable}
                    flush={flush}
                    onPlay={play}
                    onClose={() => setPreviewOpen(false)}
                />
            )}
        </main>
    );
}

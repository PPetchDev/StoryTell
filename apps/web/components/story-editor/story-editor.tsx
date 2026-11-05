'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';

import { useConnection } from '@/components/connection';
import { StoryAssistantPanel } from '@/components/story-assistant/story-assistant-panel';
import { useStoryAssistant } from '@/components/story-assistant/use-story-assistant';
import { ApiUnreachableError } from '@/lib/api';
import {
    MAX_CHARACTERS,
    POV_LABELS,
    REPLY_LENGTH_LABELS,
    RewriteRequest,
    Story,
    storyApi,
    storyTitle,
    TENSE_LABELS,
} from '@/lib/story';
import { useAutosave } from './autosave';
import { SaveStatus } from './save-status';
import { CharacterCard } from './character-card';
import { ConfirmButton, SelectField, TextField } from './fields';
import { rewriteKey, RewriteStates } from './rewrite';
import { SceneCard } from './scene-card';

type StoryText = 'title' | 'setting' | 'opening';
type StyleKey = keyof Story['style'];

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

/**
 * The Story editor (spec: "Story authoring module"). The local Story is what the author sees;
 * every edit is saved on its own, and each answer brings the playable status up to date.
 * Every text field has a Rewrite button (spec: "Rewrite this field"), which regenerates just
 * that field with the whole Story as context.
 */
export function StoryEditor({ initial }: { initial: Story }) {
    const router = useRouter();
    const { reportUnreachable } = useConnection();
    const [story, setStory] = useState<Story>(initial);
    const { state, queue, commit, flush } = useAutosave();
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [rewrites, setRewrites] = useState<RewriteStates>({});
    const storyId = initial.id;

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
    /** The assistant (ticket 23): its answers land through the same chain as structural changes. */
    const assistant = useStoryAssistant({ storyId, commit, applyWhole });
    const highlights = assistant.highlights;

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
     * the Story: only the one field differs. A failure shows at that field, with Retry.
     */
    const rewrite = (request: RewriteRequest) => {
        const key = rewriteKey(request);
        setRewrites((current) => ({ ...current, [key]: { kind: 'busy' } }));
        void commit(
            () => storyApi.rewrite(storyId, request),
            (saved) => {
                applyWhole(saved);
                setRewrites((current) => without(current, key));
            },
            (message) => setRewrites((current) => ({ ...current, [key]: { kind: 'error', message } })),
        );
    };
    /** The props a text field needs to offer Rewrite, and to show the assistant's mark. */
    const rewritable = (request: RewriteRequest) => ({
        rewrite: rewrites[rewriteKey(request)],
        onRewrite: () => rewrite(request),
        highlighted: highlights.has(rewriteKey(request)),
    });
    const styleHighlighted = (field: StyleKey) => highlights.has(rewriteKey({ target: 'story', field }));

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

    return (
        <main className="editor">
            <nav className="breadcrumbs">
                <Link href="/">← Stories</Link>
                <Link href={`/stories/${storyId}/chats`}>Play →</Link>
                {!assistant.open && (
                    <button type="button" className="button button-quiet button-small" onClick={assistant.openPanel}>
                        Assistant
                    </button>
                )}
                <SaveStatus state={state} />
            </nav>
            <h1 className="visually-hidden">{storyTitle(story)}</h1>
            {assistant.open && <StoryAssistantPanel assistant={assistant} />}

            <section className="status-card" aria-label="Playable status">
                {story.playable ? (
                    <p className="pill pill-ok">Playable</p>
                ) : (
                    <>
                        <p className="pill">Not playable yet</p>
                        <p className="muted">Still to fill in:</p>
                        <ul className="missing-list">
                            {story.missing.map((item) => (
                                <li key={item.field}>{item.label}</li>
                            ))}
                        </ul>
                    </>
                )}
            </section>

            <section className="card" aria-label="Story">
                <TextField
                    label="Title"
                    value={story.title}
                    onChange={(v) => setStoryText('title', v)}
                    {...rewritable({ target: 'story', field: 'title' })}
                />
                <TextField
                    label="Setting"
                    value={story.setting}
                    multiline
                    rows={6}
                    hint="Place, situation, premise and tone, in plain language."
                    onChange={(v) => setStoryText('setting', v)}
                    {...rewritable({ target: 'story', field: 'setting' })}
                />
                <TextField
                    label="Opening"
                    value={story.opening}
                    multiline
                    rows={6}
                    hint="The passage that begins every Chat."
                    onChange={(v) => setStoryText('opening', v)}
                    {...rewritable({ target: 'story', field: 'opening' })}
                />
            </section>

            <section className="card" aria-label="Style">
                <h2>Style</h2>
                <div className="field-row">
                    <SelectField
                        label="POV"
                        value={story.style.pov}
                        options={POV_LABELS}
                        onChange={(v) => setStyle('pov', v)}
                        highlighted={styleHighlighted('pov')}
                    />
                    <SelectField
                        label="Tense"
                        value={story.style.tense}
                        options={TENSE_LABELS}
                        onChange={(v) => setStyle('tense', v)}
                        highlighted={styleHighlighted('tense')}
                    />
                    <SelectField
                        label="Reply length"
                        value={story.style.replyLength}
                        options={REPLY_LENGTH_LABELS}
                        onChange={(v) => setStyle('replyLength', v)}
                        highlighted={styleHighlighted('replyLength')}
                    />
                </div>
                <TextField
                    label="Image style"
                    value={story.style.imageStyle}
                    placeholder='e.g. "anime, soft colours"'
                    hint="Optional. One look for every Snapshot and Reference image."
                    onChange={(v) => setStyle('imageStyle', v)}
                    {...rewritable({ target: 'story', field: 'imageStyle' })}
                />
            </section>

            <section className="card" aria-label="Role">
                <h2>Role</h2>
                <p className="hint">The part you play. The Characters always know who they are talking to.</p>
                <TextField
                    label="Name"
                    value={story.role.name}
                    onChange={(v) => setRoleText('name', v)}
                    {...rewritable({ target: 'role', field: 'name' })}
                />
                <TextField
                    label="Description"
                    value={story.role.description}
                    multiline
                    rows={3}
                    onChange={(v) => setRoleText('description', v)}
                    {...rewritable({ target: 'role', field: 'description' })}
                />
            </section>

            <section aria-label="Characters">
                <div className="section-header">
                    <h2>Characters</h2>
                    <button
                        type="button"
                        className="button"
                        disabled={story.characters.length >= MAX_CHARACTERS}
                        onClick={() => void commit(() => storyApi.addCharacter(storyId), applyWhole)}
                    >
                        Add Character
                    </button>
                </div>
                {story.characters.length === 0 && <p className="muted">No Characters yet. A Story needs at least one.</p>}
                {story.characters.length >= MAX_CHARACTERS && (
                    <p className="hint">A Story holds at most {MAX_CHARACTERS} Characters.</p>
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
                        cast={story.characters}
                        role={story.role}
                        bonds={story.startingBonds.filter((bond) => bond.fromCharacterId === character.id)}
                        rewrites={rewrites}
                        highlights={highlights}
                        onRewrite={rewrite}
                        onText={(field, value) => setCharacterField(character.id, field, value)}
                        onExampleLines={(lines) => setCharacterField(character.id, 'exampleLines', lines)}
                        onMove={(direction) =>
                            void commit(
                                () => storyApi.reorderCharacters(storyId, moved(story.characters, character.id, direction)),
                                applyWhole,
                            )
                        }
                        onRemove={() => void commit(() => storyApi.removeCharacter(storyId, character.id), applyWhole)}
                        onAddBond={(toCharacterId) =>
                            void commit(
                                () => storyApi.addStartingBond(storyId, { fromCharacterId: character.id, toCharacterId }),
                                applyWhole,
                            )
                        }
                        onBondText={setBondText}
                        onRemoveBond={(bondId) => void commit(() => storyApi.removeStartingBond(storyId, bondId), applyWhole)}
                    />
                ))}
            </section>

            <section aria-label="Scenes">
                <div className="section-header">
                    <h2>Scenes</h2>
                    <button
                        type="button"
                        className="button"
                        onClick={() => void commit(() => storyApi.addScene(storyId), applyWhole)}
                    >
                        Add Scene
                    </button>
                </div>
                {story.scenes.length === 0 && (
                    <p className="muted">Optional. Without Scenes the story unfolds freely.</p>
                )}
                {story.scenes.map((scene, index) => (
                    <SceneCard
                        key={scene.id}
                        scene={scene}
                        index={index}
                        count={story.scenes.length}
                        rewrites={rewrites}
                        highlights={highlights}
                        onRewrite={rewrite}
                        onText={(field, value) => setSceneText(scene.id, field, value)}
                        onMove={(direction) =>
                            void commit(() => storyApi.reorderScenes(storyId, moved(story.scenes, scene.id, direction)), applyWhole)
                        }
                        onRemove={() => void commit(() => storyApi.removeScene(storyId, scene.id), applyWhole)}
                    />
                ))}
            </section>

            <section className="card danger-zone" aria-label="Delete Story">
                <h2>Delete Story</h2>
                <p className="hint">Deletes the Story with its Role, Characters, Scenes and starting Bonds. There is no undo.</p>
                <ConfirmButton
                    label="Delete Story"
                    question="Delete this Story and everything under it?"
                    confirmLabel="Delete"
                    danger
                    onConfirm={() => void deleteStory()}
                />
                {deleteError && <p role="alert">{deleteError}</p>}
            </section>
        </main>
    );
}

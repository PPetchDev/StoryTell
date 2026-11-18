import {
    CHAPTER_MAX_TOKENS,
    chapterPromptMessages,
    chapterRanges,
    chapterRejection,
    chaptersToWrite,
    defaultMoveTarget,
    FREE_PLAY_NAME,
    MOVED_ON_EVENT,
    parseChapter,
    sceneMove,
} from '../src/manager/chat/chapters/chapters.js';
import { NotAMoveError } from '../src/errors/chat.errors.js';
import { buildTurnPrompt, PromptScene } from '../src/manager/chat/turn/prompt.js';
import { Pov, ReplyLength, Tense } from '../src/model/story/entities/story.entity.js';
import { closingParts } from './harness/prompt-layers.js';

/** Move on, and Chapters (.scratch/scene-chapters/spec.md): the pure logic. */

const SCENES = [
    { id: 1, name: 'Mare\'s milk' },
    { id: 2, name: 'The guest tent' },
    { id: 3, name: 'The fire' },
];

describe('Move on: where it may go', () => {
    it('goes to the next Scene, to any other one, or into free play, stamping both names', () => {
        expect(sceneMove(SCENES, 1, 2)).toEqual({ fromSceneId: 1, fromSceneName: 'Mare\'s milk', toSceneId: 2, toSceneName: 'The guest tent', event: MOVED_ON_EVENT });
        expect(sceneMove(SCENES, 1, 3).toSceneName).toBe('The fire');
        expect(sceneMove(SCENES, 3, 1).toSceneName).toBe('Mare\'s milk');
        expect(sceneMove(SCENES, 2, null)).toMatchObject({ fromSceneId: 2, toSceneId: null, toSceneName: null });
    });

    it('goes from free play into a Scene, stamped as leaving free play', () => {
        expect(sceneMove(SCENES, null, 2)).toMatchObject({ fromSceneId: null, fromSceneName: FREE_PLAY_NAME, toSceneId: 2 });
    });

    it('refuses the Scene the Chat is on, free play from free play, a Scene not in the Story, and a Story with no Scenes', () => {
        expect(() => sceneMove(SCENES, 2, 2)).toThrow(NotAMoveError);
        expect(() => sceneMove(SCENES, null, null)).toThrow(NotAMoveError);
        expect(() => sceneMove(SCENES, 1, 99)).toThrow(NotAMoveError);
        expect(() => sceneMove([], null, null)).toThrow(NotAMoveError);
        // A current Scene the Story no longer has is free play.
        expect(() => sceneMove(SCENES, 42, null)).toThrow(NotAMoveError);
    });

    it('preselects the next Scene, free play after the last, and the first from free play', () => {
        expect(defaultMoveTarget(SCENES, 1)).toBe(2);
        expect(defaultMoveTarget(SCENES, 3)).toBeNull();
        expect(defaultMoveTarget(SCENES, null)).toBe(1);
    });
});

describe('Chapters: the Messages each covers', () => {
    const messages = [0, 1, 2, 3, 4, 5, 6].map((position) => ({ id: 100 + position, position }));

    it('the first from the Opening, a later one from after the advance before, through its own advance', () => {
        expect(chapterRanges(messages, [{ id: 1, messageId: 102 }, { id: 2, messageId: 106 }])).toEqual([
            { advanceId: 1, from: 0, through: 2 },
            { advanceId: 2, from: 3, through: 6 },
        ]);
    });

    it('leaves the second of two advances at one Message empty, and drops one whose Message is gone', () => {
        const ranges = chapterRanges(messages, [{ id: 1, messageId: 104 }, { id: 2, messageId: 104 }, { id: 3, messageId: 999 }]);
        expect(ranges).toEqual([
            { advanceId: 1, from: 0, through: 4 },
            { advanceId: 2, from: 5, through: 4 },
        ]);
    });
});

describe('Chapters: which a run writes', () => {
    const chapter = (advanceId: number, fields: Partial<{ hasMessages: boolean; summary: string | null; failed: string | null }> = {}) => ({
        advanceId,
        hasMessages: true,
        summary: null,
        failed: null,
        ...fields,
    });

    it('the ones never tried, newest first, at most two', () => {
        expect(chaptersToWrite([chapter(1), chapter(2), chapter(3), chapter(4)])).toEqual([4, 3]);
    });

    it('never a written one, a failed one, or one with no Messages', () => {
        expect(chaptersToWrite([chapter(1), chapter(2, { summary: 'Done.' }), chapter(3, { failed: 'Down.' }), chapter(4, { hasMessages: false })])).toEqual([1]);
    });
});

describe('Chapters: the call', () => {
    const prompt = chapterPromptMessages({
        sceneName: 'The guest tent',
        identityName: 'Ash',
        castNames: ['Nara', 'Tavri'],
        messages: [
            { speaker: 'Ash', text: 'I lift the tent flap.' },
            { speaker: 'Story', text: '@Nara: Come in, quick.' },
        ],
        previous: 'Ash tasted the milk and asked about the herd.',
    });
    const [system, user] = prompt;

    it('sends the Messages under their speakers, the Scene\'s name and the previous summary as context only', () => {
        expect(user.content).toContain('[Ash]\nI lift the tent flap.\n\n[Story]\n@Nara: Come in, quick.');
        expect(user.content).toContain("This chapter's scene: The guest tent");
        expect(user.content).toContain('The chapter before, for context only:\nAsh tasted the milk and asked about the herd.');
    });

    it('keeps to the identity rule, adults only, and what the Messages show, never what the Scene was for', () => {
        expect(system.content).toContain("never guess Ash's gender");
        expect(system.content).toContain('Everyone in the story is an adult');
        expect(system.content).toContain("don't say what the chapter was meant to bring about");
        expect(system.content).toContain('Nara, Tavri');
    });

    it('leaves the previous summary out for the first Chapter', () => {
        const [, first] = chapterPromptMessages({ sceneName: 'A', identityName: 'Ash', castNames: [], messages: [{ speaker: 'Story', text: 'Smoke.' }], previous: null });
        expect(first.content).not.toContain('The chapter before');
    });

    it('reads the answer without a label, and refuses an empty one', () => {
        expect(parseChapter('Summary: Ash came in.')).toBe('Ash came in.');
        expect(parseChapter('**Chapter summary:** Ash came in.')).toBe('Ash came in.');
        expect(parseChapter('  \n ')).toBeNull();
    });

    it('turns away an answer cut off at the cap, or one going on with the story', () => {
        expect(chapterRejection('Ash came in.', CHAPTER_MAX_TOKENS, ['Ash', 'Story'])).toMatch(/cut off/);
        expect(chapterRejection('[Story]\n@Nara: Sit.', 50, ['Ash', 'Story'])).toMatch(/went on with the story/);
        expect(chapterRejection('Ash came in. [Story] was quiet.', 50, ['Ash', 'Story'])).toBeNull();
    });
});

describe("The Narrator's Scene line after a Move on", () => {
    const CHOSEN = 'has chosen to move the story on to this Scene';
    const moment = (scene: PromptScene) =>
        closingParts(
            buildTurnPrompt({
                story: {
                    setting: "A herders' camp.",
                    pov: Pov.Second,
                    tense: Tense.Present,
                    replyLength: ReplyLength.Medium,
                    characters: [{ name: 'Nara', appearance: 'Tall.', personality: 'Warm.', voice: 'Quick.', exampleLines: [], background: '', secrets: '' }],
                },
                identity: { name: 'Ash', description: 'A trader.' },
                scene,
                bonds: [],
                arcs: [],
                memories: [],
                history: [{ role: 'assistant', text: '@Nara: Drink.' }],
                userText: 'I follow her.',
            }),
        ).moment;
    const scene = { name: 'The guest tent', situation: 'Night in the guest tent.', moveOnCondition: 'Nara tells a secret.' };

    it('asks the reply to carry the story into the Scene the user chose, while no reply is in it', () => {
        expect(moment({ ...scene, replies: 0, chosenByUser: true })).toContain(`Ash ${CHOSEN}. Let this reply bring the story there`);
    });

    it('says nothing of it for a Scene the Judge moved to, or once a reply is written', () => {
        expect(moment({ ...scene, replies: 0 })).not.toContain(CHOSEN);
        expect(moment({ ...scene, replies: 0, chosenByUser: false })).not.toContain(CHOSEN);
    });
});

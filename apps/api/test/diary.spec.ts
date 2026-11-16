import {
    AutoDiaryInput,
    autoDiaryWriters,
    buildDiaryPrompt,
    DIARY_AUTO_EVERY_REPLIES,
    DIARY_ENTRY_MAX,
    DiaryPromptInput,
    diaryMoment,
    fitStory,
    readDiaryEntry,
    storySince,
} from '../src/manager/chat/diary/diary.js';
import { ChatManagerService } from '../src/manager/chat/chat.service.js';
import { UnreadableDiaryEntryError } from '../src/errors/chat.errors.js';
import { TextCompletionRequest } from '../src/service/model-gateway/model-gateway.js';
import { startTestApp, TestApp } from './harness/test-app.js';

/**
 * Diary (.scratch/diary/spec.md): what the writer is told and how its answer is read, as pure
 * logic; then through the HTTP API with the fake gateway scripted.
 */

const INPUT: DiaryPromptInput = {
    character: { name: 'Mira', personality: 'Guarded.', voice: 'Short sentences.', background: 'Kept the light for ten years.' },
    identityName: 'Ash',
    identityDescription: 'The new keeper.',
    setting: 'A lighthouse on a storm-cut island.',
    arcSteps: ['She lets someone help.'],
    bonds: [{ towardName: 'Ash', label: 'wary', description: 'She watches the new keeper.', levels: null }],
    beliefs: ['Ash was sent by the harbour board.'],
    memories: ['Ash carried the oil up the stair.', 'The lamp went out at midnight.'],
    previousEntry: null,
    story: [
        { position: 0, text: 'Mira: Boots off, keeper.' },
        { position: 1, text: 'Ash: I climb the stair.' },
    ],
    moment: 'Night, the lamp room',
};

describe('Diary: the moment and the Messages an entry tells of (pure)', () => {
    it('words the moment from the Time of day and the Place, or neither', () => {
        expect(diaryMoment('night', 'the lamp room')).toBe('Night, the lamp room');
        expect(diaryMoment(null, 'the quay')).toBe('The quay');
        expect(diaryMoment('dawn', null)).toBe('Dawn');
        expect(diaryMoment(null, ' ')).toBeNull();
    });

    it('takes the Messages after the last entry, up to the one it is written at', () => {
        const messages = [0, 1, 2, 3, 4].map((position) => ({ position }));
        expect(storySince(messages, null, 2).map((message) => message.position)).toEqual([0, 1, 2]);
        expect(storySince(messages, 2, 4).map((message) => message.position)).toEqual([3, 4]);
        expect(storySince(messages, 4, 4)).toEqual([]);
    });

    it('keeps the newest Messages that fit, and always the newest one', () => {
        const story = [1, 2, 3].map((position) => ({ position, text: 'word '.repeat(400) }));
        const whole = fitStory(story, 100_000);
        expect(whole).toEqual({ kept: story, cut: false });
        const tight = fitStory(story, 10);
        expect(tight.kept.map((message) => message.position)).toEqual([3]);
        expect(tight.cut).toBe(true);
    });
});

describe('Diary: what the writer is told (pure)', () => {
    it('tells the diarist, their feelings, Beliefs and change, the story and the rules, and where it stands', () => {
        const prompt = buildDiaryPrompt(INPUT);
        const [system, user] = prompt.messages.map((message) => message.content);
        expect(prompt.messages.map((message) => message.role)).toEqual(['system', 'user']);
        expect(system).toContain('Every character is an adult.');
        expect(system).toContain('Setting: A lighthouse on a storm-cut island.');
        expect(system).toContain('The diarist is Mira.\nPersonality: Guarded.\nVoice (how Mira talks and writes): Short sentences.\nBackground: Kept the light for ten years.');
        expect(system).toContain('How this story has changed Mira so far: She lets someone help.');
        expect(system).toContain('- toward Ash: "wary" — She watches the new keeper.');
        expect(system).toContain('What Mira believes, which may be false (Mira does not doubt it):\n- Ash was sent by the harbour board.');
        expect(system).toContain(
            'What Mira knows of the story so far (their Memories; what is not here, they do not know):\n- Ash carried the oil up the stair.\n- The lamp went out at midnight.',
        );
        // Written the way she would, coloured by how she feels and what she knows.
        expect(user).toContain('Write it the way Mira would: their Personality and Voice above decide the mood');
        expect(user).toContain('How Mira feels about each person, and what they know and believe, colour what they notice and how they judge it');
        expect(system).toContain('Ash is the person the user plays.\nWho Ash is: The new keeper.');
        expect(user).toContain('What has happened since the story began, as the story told it. Lines labelled "Ash:" are Ash\'s own.\nIt is now: Night, the lamp room.\n<story>\nMira: Boots off, keeper.\n\nAsh: I climb the stair.\n</story>');
        expect(user).toContain("Write Mira's diary entry about the passage above.");
        expect(user).toContain('decide nothing for Ash');
        // The user's gender is theirs to say, as in the turn's own prompt (a real model's entry called Ash "he", 2026-11-16).
        expect(user).toContain(
            'Never guess Ash\'s gender. Only who Ash is above, or Ash\'s own lines, can state it; the narration and other characters\' lines do not count, even where they guessed. Until it is stated, Mira calls Ash by name or "they", never "he" or "she".',
        );
        expect(user).not.toContain("story's Epilogue");
        expect(user).toContain('80 to 150 words');
        expect(user.endsWith('Answer with only the entry.')).toBe(true);
    });

    it('says nothing of what is not there', () => {
        const bare = buildDiaryPrompt({
            ...INPUT,
            identityDescription: ' ',
            setting: ' ',
            arcSteps: [],
            bonds: [],
            beliefs: [],
            memories: [],
            moment: null,
            character: { name: 'Mira', personality: '', voice: '', background: '' },
        });
        const [system, user] = bare.messages.map((message) => message.content);
        expect(system).not.toContain('Setting:');
        expect(system).toContain('The diarist is Mira.\nAsh is the person the user plays.');
        expect(system).not.toContain('Who Ash is');
        expect(system).not.toContain('Memories');
        expect(user).not.toContain('It is now');
    });

    it('marks an Epilogue in the passage, and written at one, looks back once it is all over', () => {
        const story = [
            { position: 1, text: 'Ash: We tie up at the quay.' },
            { position: 2, text: 'Weeks pass. Ash takes the wheel.', epilogue: true },
        ];
        const at = buildDiaryPrompt({ ...INPUT, story, moment: 'After the ending' }).messages[1].content;
        expect(at).toContain("It is now: After the ending.\n<story>\nAsh: We tie up at the quay.\n\n[The story's Epilogue: what came after, perhaps long after]\nWeeks pass. Ash takes the wheel.\n</story>");
        expect(at).toContain(
            "- The passage ends with the story's Epilogue, which tells what came after, perhaps long after. Mira writes once it is all over, looking back on it, and keeps things in the order they happened.",
        );
        // Played on after it: the Epilogue is still marked, but the entry is written where the story stands now.
        const after = buildDiaryPrompt({ ...INPUT, story: [...story, { position: 3, text: 'Ash: A new season.' }] }).messages[1].content;
        expect(after).toContain("[The story's Epilogue: what came after, perhaps long after]\nWeeks pass.");
        expect(after).not.toContain("The passage ends with the story's Epilogue");
    });

    it('gives the last entry for continuity, and says when the older story is left out', () => {
        const prompt = buildDiaryPrompt({
            ...INPUT,
            previousEntry: 'He came up the stair like he owned it.',
            story: [1, 2, 3].map((position) => ({ position, text: `Message ${position}. ${'word '.repeat(6_000)}` })),
        });
        const user = prompt.messages[1].content;
        expect(user.startsWith("Mira's last diary entry, for continuity (do not repeat it):\nHe came up the stair like he owned it.")).toBe(true);
        expect(user).toContain('What has happened since that entry, as the story told it (its earlier part is left out here).');
        expect(user).toContain('Message 3.');
        expect(user).not.toContain('Message 1.');
        expect(user).toContain('following on from their last entry');
    });
});

describe('Diary: who writes by themselves at a reply (pure)', () => {
    // The Opening (0, the author's), then replies at odd positions; Mira (1) speaks in all, Kai (2) in the first only.
    const replies = (count: number) => [
        { position: 0, written: false, speakers: [1, 2] },
        ...Array.from({ length: count }, (_, n) => [
            { position: 2 * n + 1, written: true, speakers: n === 0 ? [1, 2] : [1] },
            { position: 2 * n + 2, written: false, speakers: [] },
        ]).flat(),
    ];
    const input = (count: number, at: Partial<AutoDiaryInput['at']> = {}, lastEntryAt = new Map<number, number>()): AutoDiaryInput => {
        const messages = replies(count).filter((message) => message.position <= 2 * count - 1);
        return {
            messages,
            at: { position: 2 * count - 1, epilogue: false, sceneMoved: false, endingReached: false, ...at },
            cast: [1, 2, 3],
            lastEntryAt,
        };
    };

    it('writes after enough replies, only for those who spoke since their last entry, furthest behind first', () => {
        expect(DIARY_AUTO_EVERY_REPLIES).toBe(10);
        expect(autoDiaryWriters(input(9))).toEqual([]);
        // Ten replies: Mira and Kai spoke since the Chat began; Lio (3) never did.
        expect(autoDiaryWriters(input(10))).toEqual([1, 2]);
        // Mira wrote at reply 5: she is not due yet, and Kai is.
        expect(autoDiaryWriters(input(10, {}, new Map([[1, 9]])))).toEqual([2]);
        // Kai wrote at reply 1 and has not spoken since: nothing to tell.
        expect(autoDiaryWriters(input(12, {}, new Map([[2, 1]])))).toEqual([1]);
    });

    it('writes at once when the Scene moves on, an Ending is reached or it is the Epilogue', () => {
        for (const milestone of [{ sceneMoved: true }, { endingReached: true }, { epilogue: true }]) {
            expect(autoDiaryWriters(input(3, milestone))).toEqual([1, 2]);
        }
        // Not twice at the same reply.
        expect(autoDiaryWriters(input(3, { epilogue: true }, new Map([[1, 5], [2, 5]])))).toEqual([]);
    });

    it('writes for at most three at once, those furthest behind first', () => {
        const messages = [{ position: 1, written: true, speakers: [1, 2, 3, 4, 5] }];
        const behind = new Map<number, number>();
        const at = { position: 1, epilogue: true, sceneMoved: false, endingReached: false };
        expect(autoDiaryWriters({ messages, at, cast: [1, 2, 3, 4, 5], lastEntryAt: behind })).toEqual([1, 2, 3]);
        // Sitting out is not being in the cast.
        expect(autoDiaryWriters({ messages, at, cast: [4, 5], lastEntryAt: behind })).toEqual([4, 5]);
    });
});

describe('Diary: reading the answer (pure)', () => {
    it('takes off a fence, a name label and a heading, and keeps a salutation', () => {
        expect(readDiaryEntry('  He stayed.  ', 'Mira')).toBe('He stayed.');
        expect(readDiaryEntry('```\nHe stayed.\n```', 'Mira')).toBe('He stayed.');
        expect(readDiaryEntry('Mira: He stayed.', 'Mira')).toBe('He stayed.');
        expect(readDiaryEntry("**Mira's Diary Entry**\n\nHe stayed.", 'Mira')).toBe('He stayed.');
        expect(readDiaryEntry('# Diary\nHe stayed.', 'Mira')).toBe('He stayed.');
        expect(readDiaryEntry('Dear diary,\nHe stayed.', 'Mira')).toBe('Dear diary,\nHe stayed.');
        expect(readDiaryEntry('Dear diary\n\nHe stayed.', 'Mira')).toBe('Dear diary\n\nHe stayed.');
    });

    it('cuts a runaway answer at a word, and refuses an empty one', () => {
        const long = readDiaryEntry('word '.repeat(1_000), 'Mira');
        expect(long.length).toBeLessThanOrEqual(DIARY_ENTRY_MAX + 1);
        expect(long.endsWith('word…')).toBe(true);
        expect(() => readDiaryEntry(' \n ', 'Mira')).toThrow(UnreadableDiaryEntryError);
        expect(() => readDiaryEntry('```\n\n```', 'Mira')).toThrow(UnreadableDiaryEntryError);
    });
});

interface Message {
    id: number;
    kind: 'user' | 'ai';
    judge?: { status: string } | null;
    memory?: { status: string } | null;
}

interface Chat {
    id: number;
    messages: Message[];
    autoDiary: boolean;
    diaryWriting: boolean;
    diaryLatest: Array<{ characterId: number; entryId: number }>;
}

interface Entry {
    id: number;
    characterId: number;
    messageId: number;
    moment: string | null;
    text: string;
    createdAt: string;
}

const NO_OPS = '{"operations":[]}';

function judgement(extra: Record<string, unknown> = {}): string {
    return JSON.stringify({ bond_changes: [], arc_steps: [], scene: { move_on: false, reason: 'not yet' }, ...extra });
}

describe('Diary: asking, keeping and taking back (HTTP)', () => {
    let t: TestApp;

    beforeAll(async () => {
        t = await startTestApp();
    });

    afterEach(() => {
        t.gateway.reset();
    });

    afterAll(async () => {
        await t.close();
    });

    async function createStory(): Promise<{ storyId: number; mira: number; kai: number }> {
        const created = await t.http.post('/api/stories').send({ title: 'The Lighthouse' }).expect(201);
        const storyId = created.body.id as number;
        await t.http.patch(`/api/stories/${storyId}`).send({ setting: 'A lighthouse.', opening: 'The lamp is out.\n\n@Mira: Boots off, keeper.' }).expect(200);
        await t.http.patch(`/api/stories/${storyId}/role`).send({ name: 'Ash', description: 'The new keeper.' }).expect(200);
        const first = await t.http
            .post(`/api/stories/${storyId}/characters`)
            .send({
                name: 'Mira',
                appearance: 'Tall.',
                personality: 'Guarded.',
                voice: 'Short.',
                background: 'Ten years on the rock.',
                secrets: 'She put the lamp out herself.',
                arcDirections: 'If trusted, her coldness thaws.',
            })
            .expect(201);
        const second = await t.http.post(`/api/stories/${storyId}/characters`).send({ name: 'Kai', appearance: 'Wiry.', personality: 'Restless.', voice: 'Quick.' }).expect(201);
        return { storyId, mira: first.body.characters[0].id as number, kai: second.body.characters[1].id as number };
    }

    async function createChat(storyId: number): Promise<Chat> {
        return (await t.http.post(`/api/stories/${storyId}/chats`).expect(201)).body as Chat;
    }

    async function getChat(storyId: number, chatId: number): Promise<Chat> {
        return (await t.http.get(`/api/stories/${storyId}/chats/${chatId}`).expect(200)).body as Chat;
    }

    async function settled(storyId: number, chatId: number): Promise<Chat> {
        const deadline = Date.now() + 5_000;
        for (;;) {
            const chat = await getChat(storyId, chatId);
            const last = [...chat.messages].reverse().find((message) => message.kind === 'ai' && message.judge);
            if (!last || (last.judge?.status !== 'pending' && last.memory?.status !== 'pending')) return chat;
            if (Date.now() > deadline) throw new Error('The background calls did not settle in time');
            await new Promise((resolve) => setTimeout(resolve, 20));
        }
    }

    function script(reply: string, judge: string = judgement()): void {
        t.gateway.scriptText('turn', { text: reply, model: 'glm-5.3' });
        t.gateway.scriptText('judge', judge);
        t.gateway.scriptText('memory_extraction', NO_OPS);
    }

    async function play(storyId: number, chatId: number, text: string, judge: string = judgement()): Promise<Chat> {
        script(`@Mira: ${text} Heard.`, judge);
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages`).send({ text }).expect(201);
        return settled(storyId, chatId);
    }

    const diaryPath = (storyId: number, chatId: number) => `/api/stories/${storyId}/chats/${chatId}/diary`;
    const writePath = (storyId: number, chatId: number, characterId: number) => `/api/stories/${storyId}/chats/${chatId}/characters/${characterId}/diary`;

    async function write(storyId: number, chatId: number, characterId: number, text: string): Promise<Entry> {
        t.gateway.scriptText('diary_entry', text);
        return (await t.http.post(writePath(storyId, chatId, characterId)).expect(201)).body as Entry;
    }

    async function entries(storyId: number, chatId: number): Promise<Entry[]> {
        return (await t.http.get(diaryPath(storyId, chatId)).expect(200)).body.entries as Entry[];
    }

    function lastDiaryCall(): TextCompletionRequest {
        const calls = t.gateway.textCalls('diary_entry');
        return calls[calls.length - 1];
    }

    it('writes an entry at the newest AI Message from what the user may see of the Character, and keeps it', async () => {
        const { storyId, mira, kai } = await createStory();
        await t.http.post(`/api/stories/${storyId}/starting-bonds`).send({ fromCharacterId: mira, toCharacterId: null, label: 'wary' }).expect(201);
        await t.http.post(`/api/stories/${storyId}/starting-bonds`).send({ fromCharacterId: kai, toCharacterId: null, label: 'eager' }).expect(201);
        await t.http.put(`/api/stories/${storyId}/starting-beliefs`).send({ startingBeliefs: [{ characterId: mira, text: '{user} was sent by the harbour board.' }] }).expect(200);
        const chat = await createChat(storyId);
        expect(await entries(storyId, chat.id)).toEqual([]);

        // Mira knows one Memory and Kai another: she is told only hers.
        await t.http.post(`/api/stories/${storyId}/chats/${chat.id}/memories`).send({ text: '{user} carried the oil up alone.', knownBy: [mira] }).expect(201);
        await t.http.post(`/api/stories/${storyId}/chats/${chat.id}/memories`).send({ text: 'Kai hid the spare wick.', knownBy: [kai] }).expect(201);
        const played = await play(
            storyId,
            chat.id,
            'I climb the stair.',
            judgement({ arc_steps: [{ character: 'Mira', step: 'She lets someone help.', cause: 'Ash carried the oil.' }], details: { place: 'the lamp room' } }),
        );
        const newest = played.messages.at(-1)!;

        const entry = await write(storyId, chat.id, mira, '  He came up the stair like he owned it.  ');
        expect(entry).toMatchObject({ characterId: mira, messageId: newest.id, moment: 'The lamp room', text: 'He came up the stair like he owned it.' });
        expect(await entries(storyId, chat.id)).toEqual([entry]);

        const call = lastDiaryCall();
        const [system, user] = call.messages.map((message) => message.content);
        expect(call.kind).toBe('diary_entry');
        expect(call.servedFor).toEqual({ storyId, chatId: chat.id });
        expect(system).toContain('The diarist is Mira.\nPersonality: Guarded.\nVoice (how Mira talks and writes): Short.\nBackground: Ten years on the rock.');
        expect(system).toContain('How this story has changed Mira so far: She lets someone help.');
        expect(system).toContain('- toward Ash: "wary"');
        expect(system).toContain('- Ash was sent by the harbour board.');
        expect(system).toContain('(their Memories; what is not here, they do not know):\n- Ash carried the oil up alone.');
        expect(system).not.toContain('spare wick');
        // Never what the user may not read, nor anyone else's feelings.
        expect(`${system}\n${user}`).not.toContain('She put the lamp out herself.');
        expect(`${system}\n${user}`).not.toContain('her coldness thaws');
        expect(system).not.toContain('eager');
        // The whole story so far, in the Transcript's layout, the Opening included.
        expect(user).toContain('<story>\nThe lamp is out.\n\nMira: Boots off, keeper.\n\nAsh: I climb the stair.\n\nMira: I climb the stair. Heard.\n</story>');
        expect(user).toContain('It is now: The lamp room.');
        // The turn's own prompt never reads the Diary.
        await play(storyId, chat.id, 'I light the lamp.');
        const turn = t.gateway.textCalls('turn').at(-1)!;
        expect(JSON.stringify(turn.messages)).not.toContain('like he owned it');
    });

    it('refuses a second entry about the same moment before any call, and the next one tells only what is new', async () => {
        const { storyId, mira, kai } = await createStory();
        const chat = await createChat(storyId);
        // A Chat with only its Opening can already be written about.
        const first = await write(storyId, chat.id, mira, 'A new keeper. We will see.');
        expect(first.moment).toBeNull();

        const refused = await t.http.post(writePath(storyId, chat.id, mira)).expect(409);
        expect(refused.body.error).toMatchObject({ code: '409.004.026', message: 'Mira has already written about this. Play on, then ask again.' });
        expect(t.gateway.textCalls('diary_entry')).toHaveLength(1);

        // Another Character's Diary is their own.
        const kais = await write(storyId, chat.id, kai, 'Finally, someone new.');
        expect(kais.characterId).toBe(kai);

        await play(storyId, chat.id, 'I climb the stair.');
        const second = await write(storyId, chat.id, mira, 'He climbs well enough.');
        const user = lastDiaryCall().messages[1].content;
        expect(user.startsWith("Mira's last diary entry, for continuity (do not repeat it):\nA new keeper. We will see.")).toBe(true);
        expect(user).toContain('<story>\nAsh: I climb the stair.\n\nMira: I climb the stair. Heard.\n</story>');
        expect(user).not.toContain('Boots off');
        expect(user).not.toContain('Finally, someone new.');
        // Newest first.
        expect((await entries(storyId, chat.id)).map((entry) => entry.id)).toEqual([second.id, kais.id, first.id]);
    });

    it('the Characters write by themselves after ten replies and at an Epilogue, in the background, and the Chat says so', async () => {
        const { storyId, mira, kai } = await createStory();
        const chat = await createChat(storyId);
        const idle = () => t.app.get(ChatManagerService).backgroundIdle(chat.id);
        expect(await getChat(storyId, chat.id)).toMatchObject({ autoDiary: true, diaryWriting: false, diaryLatest: [] });

        // Nine replies: nobody is due, and nothing is asked.
        for (let n = 1; n <= 9; n++) await play(storyId, chat.id, `Turn ${n}.`);
        await idle();
        expect(t.gateway.textCalls('diary_entry')).toHaveLength(0);

        // The tenth: Mira, who spoke in every one, writes; Kai, who never spoke, does not.
        t.gateway.scriptText('diary_entry', 'Ten nights of that stair.');
        await play(storyId, chat.id, 'Turn 10.');
        // Read the moment the reply's calls are done: the entry is in, or the Chat says it is on the way.
        const right = await getChat(storyId, chat.id);
        expect(right.diaryWriting || right.diaryLatest.length === 1).toBe(true);
        await idle();
        const tenth = await entries(storyId, chat.id);
        expect(tenth).toMatchObject([{ characterId: mira, text: 'Ten nights of that stair.' }]);
        expect(tenth[0].messageId).toBe((await getChat(storyId, chat.id)).messages.at(-1)!.id);
        expect(await getChat(storyId, chat.id)).toMatchObject({ diaryWriting: false, diaryLatest: [{ characterId: mira, entryId: tenth[0].id }] });

        // One more reply is not enough again; asking still works, and is refused at the same reply.
        await play(storyId, chat.id, 'Turn 11.');
        await idle();
        expect(t.gateway.textCalls('diary_entry')).toHaveLength(1);
        await write(storyId, chat.id, kai, 'He talks too much.');
        await t.http.post(writePath(storyId, chat.id, kai)).expect(409);

        // The Epilogue: Mira spoke since her entry, so she writes, after the ending.
        script('@Mira: The light never went out again.');
        t.gateway.scriptText('diary_entry', 'It is over, and the lamp still burns.');
        await t.http.post(`/api/stories/${storyId}/chats/${chat.id}/epilogue`).expect(200);
        await idle();
        const after = await entries(storyId, chat.id);
        expect(after[0]).toMatchObject({ characterId: mira, moment: 'After the ending', text: 'It is over, and the lamp still burns.' });
        expect(after.filter((entry) => entry.characterId === kai)).toHaveLength(1);
        expect(lastDiaryCall().messages[1].content).toContain("The passage ends with the story's Epilogue");
    });

    it('a Chat can turn them off, a Branch copies the setting, and a failed entry is dropped without stopping play', async () => {
        const { storyId } = await createStory();
        const chat = await createChat(storyId);
        const idle = () => t.app.get(ChatManagerService).backgroundIdle(chat.id);
        await play(storyId, chat.id, 'I climb the stair.');

        const off = await t.http.patch(`/api/stories/${storyId}/chats/${chat.id}`).send({ autoDiary: false }).expect(200);
        expect(off.body.autoDiary).toBe(false);
        script('The lamp burned on.');
        await t.http.post(`/api/stories/${storyId}/chats/${chat.id}/epilogue`).expect(200);
        await idle();
        expect(t.gateway.textCalls('diary_entry')).toHaveLength(0);
        await t.http.patch(`/api/stories/${storyId}/chats/${chat.id}`).send({ autoDiary: 'yes' }).expect(400);
        const newest = (await getChat(storyId, chat.id)).messages.at(-1)!;
        const { body: branch } = await t.http.post(`/api/stories/${storyId}/chats/${chat.id}/messages/${newest.id}/branch`).expect(201);
        expect(branch.autoDiary).toBe(false);

        // On again, with nothing scripted for the entry: the call fails, nothing is kept, and play goes on.
        await t.http.patch(`/api/stories/${storyId}/chats/${chat.id}`).send({ autoDiary: true }).expect(200);
        await play(storyId, chat.id, 'I climb on.');
        script('@Mira: Again, then.');
        await t.http.post(`/api/stories/${storyId}/chats/${chat.id}/epilogue`).expect(200);
        await idle();
        expect(t.gateway.textCalls('diary_entry')).toHaveLength(1);
        expect(await entries(storyId, chat.id)).toEqual([]);
        expect((await getChat(storyId, chat.id)).diaryWriting).toBe(false);
        await play(storyId, chat.id, 'Still here.');
        expect((await getChat(storyId, chat.id)).messages.at(-1)!.kind).toBe('ai');
    });

    it('written at an Epilogue, an entry is dated after the ending, and the writer is told what the Epilogue is', async () => {
        const { storyId, mira } = await createStory();
        const chat = await createChat(storyId);
        await play(storyId, chat.id, 'I climb the stair.', judgement({ details: { place: 'the lamp room' } }));
        script('Years pass. The light never goes out again.');
        await t.http.post(`/api/stories/${storyId}/chats/${chat.id}/epilogue`).expect(200);
        const ended = await settled(storyId, chat.id);
        const epilogue = ended.messages.at(-1)!;
        // Mira's own entry at the Epilogue, with nothing scripted for it, fails first: then the one asked for is written.
        await t.app.get(ChatManagerService).backgroundIdle(chat.id);

        const entry = await write(storyId, chat.id, mira, 'All those years, and the lamp still burns.');
        expect(entry).toMatchObject({ messageId: epilogue.id, moment: 'After the ending' });
        const [system, user] = lastDiaryCall().messages.map((message) => message.content);
        expect(system).toContain('Who Ash is: The new keeper.');
        expect(user).toContain('It is now: After the ending.');
        expect(user).toContain("[The story's Epilogue: what came after, perhaps long after]\nYears pass. The light never goes out again.");
        expect(user).toContain("The passage ends with the story's Epilogue");
        expect(user).not.toContain('the lamp room');

        // Played on after it, the next entry is dated where the story stands again.
        await play(storyId, chat.id, 'I trim the wick.', judgement({ details: { place: 'the gallery' } }));
        const next = await write(storyId, chat.id, mira, 'Back to work.');
        expect(next.moment).toBe('The gallery');
        expect(lastDiaryCall().messages[1].content).not.toContain("[The story's Epilogue");
    });

    it('refuses an unknown Character, an empty answer, a missing entry and credit being out, keeping nothing', async () => {
        const { storyId, mira } = await createStory();
        const other = await createStory();
        const chat = await createChat(storyId);

        await t.http.post(writePath(storyId, chat.id, other.mira)).expect(404);
        t.gateway.scriptText('diary_entry', '   ');
        const empty = await t.http.post(writePath(storyId, chat.id, mira)).expect(502);
        expect(empty.body.error.code).toBe('502.004.027');
        expect(await entries(storyId, chat.id)).toEqual([]);

        t.gateway.setRemainingCredit({ text: { remainingUsd: 0, limitUsd: 22 } });
        await t.http.post(writePath(storyId, chat.id, mira)).expect(402);
        expect(t.gateway.textCalls('diary_entry')).toHaveLength(1);
        t.gateway.reset();

        // The lock is let go after a failure: the next ask is written.
        const entry = await write(storyId, chat.id, mira, 'Quiet tonight.');
        const missing = await t.http.delete(`${diaryPath(storyId, chat.id)}/${entry.id + 1000}`).expect(404);
        expect(missing.body.error.code).toBe('404.004.028');
        const otherChat = await createChat(other.storyId);
        await t.http.delete(`${diaryPath(other.storyId, otherChat.id)}/${entry.id}`).expect(404);

        await t.http.delete(`${diaryPath(storyId, chat.id)}/${entry.id}`).expect(204);
        expect(await entries(storyId, chat.id)).toEqual([]);
        // Deleted, the same moment can be written about again.
        await write(storyId, chat.id, mira, 'Quiet again.');
    });

    it('takes an entry back with the Message it was written at: Regenerate, an edit and Reset', async () => {
        const { storyId, mira } = await createStory();
        const chat = await createChat(storyId);
        const opening = await write(storyId, chat.id, mira, 'A new keeper.');
        const one = await play(storyId, chat.id, 'One.');
        const atOne = await write(storyId, chat.id, mira, 'He counts aloud.');
        const two = await play(storyId, chat.id, 'Two.');
        const atTwo = await write(storyId, chat.id, mira, 'Still counting.');

        script('@Mira: Again, then.');
        await t.http.post(`/api/stories/${storyId}/chats/${chat.id}/messages/${two.messages.at(-1)!.id}/regenerate`).expect(200);
        await settled(storyId, chat.id);
        expect((await entries(storyId, chat.id)).map((entry) => entry.id)).toEqual([atOne.id, opening.id]);
        expect(atTwo.messageId).toBe(two.messages.at(-1)!.id);
        // The rewritten reply can be written about, from the entry before it.
        await write(storyId, chat.id, mira, 'He started over.');
        expect(lastDiaryCall().messages[1].content).toContain('<story>\nAsh: Two.\n\nMira: Again, then.\n</story>');

        script('@Mira: Morning.');
        await t.http.patch(`/api/stories/${storyId}/chats/${chat.id}/messages/${one.messages[1].id}`).send({ text: 'Good morning.' }).expect(200);
        await settled(storyId, chat.id);
        expect((await entries(storyId, chat.id)).map((entry) => entry.id)).toEqual([opening.id]);

        await t.http.post(`/api/stories/${storyId}/chats/${chat.id}/reset`).expect(200);
        expect(await entries(storyId, chat.id)).toEqual([]);
    });

    it('a Branch carries the entries written up to its Message, and a removed Character takes theirs along', async () => {
        const { storyId, mira, kai } = await createStory();
        const chat = await createChat(storyId);
        const one = await play(storyId, chat.id, 'One.');
        await write(storyId, chat.id, mira, 'He counts aloud.');
        await write(storyId, chat.id, kai, 'Counting. Really.');
        await play(storyId, chat.id, 'Two.');
        await write(storyId, chat.id, mira, 'Still counting.');

        const { body: branch } = await t.http.post(`/api/stories/${storyId}/chats/${chat.id}/messages/${one.messages.at(-1)!.id}/branch`).expect(201);
        const carried = await entries(storyId, branch.id);
        expect(carried.map((entry) => entry.text)).toEqual(['Counting. Really.', 'He counts aloud.']);
        // Against the Branch's own Message, so its next entry follows on from there.
        expect(carried.every((entry) => entry.messageId === branch.messages.at(-1).id)).toBe(true);
        await t.http.post(writePath(storyId, branch.id, mira)).expect(409);
        expect(await entries(storyId, chat.id)).toHaveLength(3);

        await t.http.delete(`/api/stories/${storyId}/characters/${kai}`).expect(200);
        expect((await entries(storyId, chat.id)).map((entry) => entry.text)).toEqual(['Still counting.', 'He counts aloud.']);
    });
});

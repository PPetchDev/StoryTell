import { CardStoryPlan, mapCard } from '../src/manager/character-card/card-mapping.js';
import { replaceText, readChunks, readText } from '../src/manager/character-card/card-png.js';
import { readCard, readCardJson } from '../src/manager/character-card/card-reader.js';
import { writeCard } from '../src/manager/character-card/card-writer.js';
import { pngImage, v2Card, v3Card } from './harness/card-files.js';
import { startTestApp, TestApp } from './harness/test-app.js';

// .scratch/character-cards/issues/05-cards-carry-lore-triggers.md: a lorebook's trigger settings
// come in as Storytell's Lore trigger settings, and go back out the same way. SillyTavern's numbers
// and key names were checked against public/scripts/world-info.js (world_info_logic: AND_ANY 0,
// NOT_ALL 1, NOT_ANY 2, AND_ALL 3; convertCharacterBook reads extensions.sticky, cooldown, delay,
// probability, useProbability, group, exclude_recursion, selectiveLogic, and entry.selective).

function plan(card: unknown): CardStoryPlan {
    return mapCard(readCardJson(JSON.stringify(card)).card, { roleName: 'Ash', greeting: 0 });
}

const DEFAULTS = {
    secondaryKeywords: [],
    secondaryMode: 'alsoNeeds',
    patterns: [],
    recursable: true,
    sticky: 0,
    cooldown: 0,
    delay: 0,
    chance: 100,
    group: '',
};

/** One lorebook entry over a plain default. */
function entry(fields: Record<string, unknown>) {
    return { keys: ['tide', 'ebb'], content: 'The tide turns at noon.', enabled: true, name: 'Tide', ...fields };
}

describe('Character cards: Lore trigger settings in (pure)', () => {
    it('brings an entry with no settings in at the defaults', () => {
        expect(plan(v2Card({ character_book: { entries: [entry({})] } })).lore).toEqual([
            { name: 'Tide', keywords: ['ebb'], text: 'The tide turns at noon.', alwaysOn: false, ...DEFAULTS },
        ]);
    });

    it('maps selective second keys to Second keywords, with the mode from selectiveLogic, and lists the approximated modes', () => {
        const result = plan(
            v2Card({
                character_book: {
                    entries: [
                        entry({ name: 'And any', secondary_keys: ['moon', ' Moon ', '{{user}}'], selective: true, extensions: { selectiveLogic: 0 } }),
                        entry({ name: 'Not all', secondary_keys: ['storm'], selective: true, extensions: { selectiveLogic: 1 } }),
                        entry({ name: 'Not any', secondary_keys: ['storm'], selective: true, extensions: { selectiveLogic: 2 } }),
                        entry({ name: 'And all', secondary_keys: ['storm', 'night'], selective: true, extensions: { selectiveLogic: 3 } }),
                        entry({ name: 'No logic', secondary_keys: ['storm'], selective: true }),
                        // Not selective: SillyTavern never reads its second keys either.
                        entry({ name: 'Off', secondary_keys: ['storm'], selective: false, extensions: { selectiveLogic: 2 } }),
                    ],
                },
            }),
        );
        expect(result.lore.map((lore) => [lore.name, lore.secondaryKeywords, lore.secondaryMode])).toEqual([
            ['And any', ['moon', 'Ash'], 'alsoNeeds'],
            ['Not all', ['storm'], 'unless'],
            ['Not any', ['storm'], 'unless'],
            ['And all', ['storm', 'night'], 'alsoNeeds'],
            ['No logic', ['storm'], 'alsoNeeds'],
            ['Off', [], 'alsoNeeds'],
        ]);
        expect(result.leftOut).toContain(
            'Second keyword modes on 2 Lore entries are approximated: "and all" became Also needs one of, "not all" became Unless one of.',
        );
        expect(result.leftOut.some((line) => line.startsWith('Second keywords on'))).toBe(false);
    });

    it('keeps at most 20 second keywords of at most 100 characters, and counts the rest', () => {
        const keys = ['x'.repeat(101), ...Array.from({ length: 22 }, (_, index) => `key ${index}`)];
        const [lore] = plan(v2Card({ character_book: { entries: [entry({ secondary_keys: keys, selective: true })] } })).lore;
        expect(lore.secondaryKeywords).toEqual(Array.from({ length: 20 }, (_, index) => `key ${index}`));
    });

    it('makes /…/flags keys Patterns, flags dropped; a key that does not compile is left out and counted', () => {
        const result = plan(
            v2Card({
                character_book: {
                    entries: [entry({ keys: ['ebb', '/storm(s)?/i', '/(unclosed/', '/gale|squall/gm', '/a\\/b/'] })],
                },
            }),
        );
        expect(result.lore[0]).toMatchObject({ keywords: ['ebb'], patterns: ['storm(s)?', 'gale|squall', 'a\\/b'] });
        expect(result.leftOut).toContain("1 regex keyword that doesn't compile.");
        expect(result.leftOut.some((line) => line.includes("aren't supported yet"))).toBe(false);
    });

    it('makes every key of a V3 use_regex entry a Pattern', () => {
        const [lore] = plan(
            v3Card({ character_book: { entries: [entry({ name: 'Moon', keys: ['moon', 'tides?', '/full/i'], use_regex: true })] } }),
        ).lore;
        expect(lore).toMatchObject({ name: 'Moon', keywords: [], patterns: ['moon', 'tides?', 'full'] });
    });

    it('keeps at most 10 Patterns of at most 200 characters, and counts the rest', () => {
        const keys = [`/${'a'.repeat(201)}/`, ...Array.from({ length: 12 }, (_, index) => `/p${index}/`)];
        const result = plan(v2Card({ character_book: { entries: [entry({ keys })] } }));
        expect(result.lore[0].patterns).toEqual(Array.from({ length: 10 }, (_, index) => `p${index}`));
        expect(result.leftOut).toContain('3 regex keywords over 200 characters or past 10 on an entry.');
    });

    it('takes Stays for, Rests for and Waits until from sticky, cooldown and delay, clamped to 0–50', () => {
        const result = plan(
            v2Card({
                character_book: {
                    entries: [
                        entry({ extensions: { sticky: 3, cooldown: 2, delay: 4 } }),
                        entry({ extensions: { sticky: 80, cooldown: -2, delay: 2.6 } }),
                        entry({ extensions: { sticky: null, cooldown: '5', delay: true } }),
                    ],
                },
            }),
        );
        expect(result.lore.map((lore) => [lore.sticky, lore.cooldown, lore.delay])).toEqual([
            [3, 2, 4],
            [50, 0, 3],
            [0, 0, 0],
        ]);
    });

    it('takes Chance from probability when useProbability is on (its default), clamped to 0–100', () => {
        const result = plan(
            v2Card({
                character_book: {
                    entries: [
                        entry({ extensions: { probability: 50, useProbability: true } }),
                        entry({ extensions: { probability: 30 } }),
                        entry({ extensions: { probability: 30, useProbability: false } }),
                        entry({ extensions: { probability: 140 } }),
                        entry({ extensions: { probability: null } }),
                    ],
                },
            }),
        );
        expect(result.lore.map((lore) => lore.chance)).toEqual([50, 30, 100, 100, 100]);
    });

    it('takes the first label of group as the Group, and exclude_recursion as "Brought in by other entries" off', () => {
        const result = plan(
            v2Card({
                character_book: {
                    entries: [
                        entry({ extensions: { group: ' Weather , Sea', exclude_recursion: true } }),
                        entry({ extensions: { group: 'g'.repeat(80), exclude_recursion: false } }),
                    ],
                },
            }),
        );
        expect(result.lore.map((lore) => [lore.group, lore.recursable])).toEqual([
            ['Weather', false],
            ['g'.repeat(60), true],
        ]);
    });
});

type StoryForCard = Parameters<typeof writeCard>[0];

const TUNED = {
    id: 21,
    name: 'Lamp room',
    keywords: ['lamp'],
    text: 'At the top of 112 steps, where Ash sleeps.',
    alwaysOn: false,
    secondaryKeywords: ['night', 'Ash'],
    secondaryMode: 'unless' as const,
    patterns: ['lamps?\\b', 'light/house'],
    recursable: false,
    sticky: 3,
    cooldown: 2,
    delay: 4,
    chance: 50,
    group: 'Rooms',
};

function storyForCard(): StoryForCard {
    const mira = {
        id: 11,
        name: 'Mira',
        appearance: 'Tall.',
        personality: 'Dry.',
        voice: 'Short.',
        exampleLines: [],
        background: '',
        secrets: '',
        arcDirections: '',
        referenceImagePath: null,
        portraitCrop: null,
        speakingVoice: null,
        expressions: [],
    };
    return {
        id: 7,
        title: 'The Lighthouse',
        createdAt: '2026-11-01T10:00:00.000Z',
        updatedAt: '2026-11-02T12:30:00.000Z',
        setting: 'A lighthouse.',
        opening: 'Rain.',
        style: { pov: 'second', tense: 'past', replyLength: 'medium', imageStyle: '' },
        role: { id: 3, name: 'Ash', description: 'The keeper.' },
        characters: [mira],
        startingBonds: [],
        scenes: [],
        lore: [TUNED, { ...TUNED, id: 22, name: 'Plain', keywords: [], text: 'Plain.', ...DEFAULTS }],
        documents: [],
        savedReplies: [],
        replaceRules: [],
        cover: null,
        narrationVoice: null,
        backdrop: 'none',
    } as unknown as StoryForCard;
}

describe('Character cards: Lore trigger settings out (pure)', () => {
    it('writes second keys with selective and selectiveLogic, patterns as /source/i keys, and the settings in extensions', () => {
        const story = storyForCard();
        const { v2, v3 } = writeCard(story, story.characters[0]);
        const [tuned, plain] = (v2 as { data: { character_book: { entries: Record<string, unknown>[] } } }).data.character_book.entries;
        expect(tuned).toMatchObject({
            keys: ['Lamp room', 'lamp', '/lamps?\\b/i', '/light/house/i'],
            secondary_keys: ['night', '{{user}}'],
            selective: true,
            extensions: { selectiveLogic: 2, sticky: 3, cooldown: 2, delay: 4, probability: 50, useProbability: true, group: 'Rooms', exclude_recursion: true },
        });
        expect(plain).toMatchObject({
            keys: ['Plain'],
            secondary_keys: [],
            selective: false,
            extensions: { selectiveLogic: 0, sticky: 0, cooldown: 0, delay: 0, probability: 100, useProbability: true, group: '', exclude_recursion: false },
        });
        // V3: the plain keys are not regex; SillyTavern reads /…/ keys as regex either way.
        const v3Entries = (v3 as { data: { character_book: { entries: Record<string, unknown>[] } } }).data.character_book.entries;
        expect(v3Entries.map((each) => each.use_regex)).toEqual([false, false]);
    });

    it('export then import keeps every trigger setting', () => {
        const story = storyForCard();
        const { v2, v3 } = writeCard(story, story.characters[0]);
        for (const definition of [v2, v3]) {
            const png = replaceText(pngImage(), () => false, [{ keyword: 'chara', text: Buffer.from(JSON.stringify(definition)).toString('base64') }]);
            const back = mapCard(readCard(png).card, { roleName: 'Ash', greeting: 0 });
            expect(back.lore).toEqual(story.lore.map(({ id: _id, ...fields }) => fields));
            expect(back.leftOut.filter((line) => /regex|Second/.test(line))).toEqual([]);
        }
    });
});

describe('Character cards: Lore trigger settings through the API', () => {
    let t: TestApp;

    beforeAll(async () => {
        t = await startTestApp();
    });

    afterAll(async () => {
        await t.close();
    });

    it('imports a sticky, grouped, 50% entry with second keys and a regex key with those settings, and exports them back', async () => {
        const card = v2Card({
            name: 'Mira',
            character_book: {
                entries: [
                    {
                        keys: ['lamp', '/lamps?\\b/i'],
                        secondary_keys: ['night'],
                        selective: true,
                        content: 'The lamp burns all night.',
                        enabled: true,
                        name: 'Lamp',
                        insertion_order: 0,
                        extensions: { selectiveLogic: 2, sticky: 3, cooldown: 1, delay: 2, probability: 50, useProbability: true, group: 'Lights', exclude_recursion: true },
                    },
                ],
            },
        });
        const preview = await t.http.post('/api/stories/from-card/preview').attach('card', Buffer.from(JSON.stringify(card)), 'mira.json').expect(200);
        expect(preview.body.leftOut.some((line: string) => /regex|Second keywords/.test(line))).toBe(false);

        const { body: story } = await t.http
            .post('/api/stories/from-card')
            .attach('card', Buffer.from(JSON.stringify(card)), 'mira.json')
            .field('roleName', 'Ash')
            .expect(201);
        expect(story.lore).toEqual([
            expect.objectContaining({
                name: 'Lamp',
                keywords: [],
                patterns: ['lamps?\\b'],
                secondaryKeywords: ['night'],
                secondaryMode: 'unless',
                sticky: 3,
                cooldown: 1,
                delay: 2,
                chance: 50,
                group: 'Lights',
                recursable: false,
            }),
        ]);

        const exported = await t.http
            .post(`/api/stories/${story.id}/characters/${story.characters[0].id}/card`)
            .attach('image', pngImage(), 'card.png')
            .buffer(true)
            .parse((res, done) => {
                const parts: Buffer[] = [];
                res.on('data', (part: Buffer) => parts.push(part));
                res.on('end', () => done(null, Buffer.concat(parts)));
            })
            .expect(200);
        const v2 = JSON.parse(Buffer.from(readText(readChunks(exported.body as Buffer), 'chara')!, 'base64').toString('utf8'));
        expect(v2.data.character_book.entries[0]).toMatchObject({
            keys: ['Lamp', '/lamps?\\b/i'],
            secondary_keys: ['night'],
            selective: true,
            extensions: { selectiveLogic: 2, sticky: 3, cooldown: 1, delay: 2, probability: 50, useProbability: true, group: 'Lights', exclude_recursion: true },
        });
    });
});

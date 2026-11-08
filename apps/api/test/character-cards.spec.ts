import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { crc32 } from 'node:zlib';
import { vi } from 'vitest';

import { CardStoryPlan, mapCard } from '../src/manager/character-card/card-mapping.js';
import { exampleBlocks, labelledDescription, userMacro, writeCard } from '../src/manager/character-card/card-writer.js';
import { readChunks, readText, replaceText, textOf, writeChunks } from '../src/manager/character-card/card-png.js';
import { cardKind, readCard, readCardJson, readJsonCard } from '../src/manager/character-card/card-reader.js';
import { StoryManagerService } from '../src/manager/story/story.service.js';
import { StoryModelService } from '../src/model/story/story.service.js';
import { cardFixture, cardFixtureJson, chunksOf, chunkTypes, jsonFile, pngCard, pngImage, v2Card, v3Card } from './harness/card-files.js';
import { startTestApp, TestApp } from './harness/test-app.js';

function plan(card: unknown, roleName = 'Ash', greeting = 0): CardStoryPlan {
    return mapCard(readCardJson(JSON.stringify(card)).card, { roleName, greeting });
}

function codeOf(run: () => unknown): string | undefined {
    try {
        run();
    } catch (error) {
        return (error as { code?: string }).code;
    }
    return undefined;
}

describe('Character cards: reading JSON (pure)', () => {
    it('reads a V1 card, whose object is the data itself', () => {
        const read = readJsonCard(cardFixture('v1-flat.json'));
        expect(read.format).toBe('v1');
        expect(read.card.name).toBe('Captain Vela');
        expect(read.card.scenario).toContain("boards {{char}}'s airship");
        // Absent strings are "", absent lists [].
        expect(read.card.creator_notes).toBe('');
        expect(read.card.alternate_greetings).toEqual([]);
        expect(read.card.character_book).toBeNull();
        expect(read.picture).toBeNull();
    });

    it('reads a V2 card from its data, the lorebook included', () => {
        const read = readJsonCard(cardFixture('v2-lighthouse.json'));
        expect(read.format).toBe('v2');
        expect(read.card.name).toBe('Mira');
        expect(read.card.alternate_greetings).toHaveLength(2);
        expect(read.card.character_book?.entries).toHaveLength(5);
        expect(read.card.character_book?.entries[2].enabled).toBe(false);
    });

    it('reads a V3 card with Thai text, and any other spec with a data object as V3', () => {
        const read = readJsonCard(cardFixture('v3-thai.json'));
        expect(read.format).toBe('v3');
        expect(read.card.nickname).toBe('มะลิ');
        expect(read.card.first_mes).toBe('สวัสดีค่ะคุณ{{user}} วันนี้รับมาลัยไหมคะ');
        expect(readCardJson(JSON.stringify({ spec: 'chara_card_v9', data: { name: 'Odd' } })).format).toBe('v3');
    });

    it('reads a BOM-led file, and tells JSON from other files by the bytes alone', () => {
        const withBom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('  \n{"name":"Bom"}')]);
        expect(cardKind(withBom)).toBe('json');
        expect(readJsonCard(withBom).card.name).toBe('Bom');
        expect(cardKind(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe('png');
        // A zip (CHARX), a WebP, a JPEG, plain text: not cards.
        expect(codeOf(() => cardKind(Buffer.from('PK\x03\x04rest', 'latin1')))).toBe('415.007.002');
        expect(codeOf(() => cardKind(Buffer.from('RIFF\0\0\0\0WEBPVP8 ', 'latin1')))).toBe('415.007.002');
        expect(codeOf(() => cardKind(Buffer.from([0xff, 0xd8, 0xff, 0xe0])))).toBe('415.007.002');
        expect(codeOf(() => cardKind(Buffer.from('name: Mira')))).toBe('415.007.002');
    });

    it('refuses broken JSON, a non-object, a spec without data, and an object that is not a card', () => {
        expect(codeOf(() => readCardJson('{"name": "Mira",'))).toBe('422.007.004');
        expect(codeOf(() => readCardJson('["Mira"]'))).toBe('422.007.004');
        expect(codeOf(() => readCardJson('{"spec": "chara_card_v2"}'))).toBe('422.007.004');
        expect(codeOf(() => readCardJson('{"title": "Not a card"}'))).toBe('422.007.004');
    });
});

describe('Character cards: the mapping (pure)', () => {
    it('maps every row of a V2 card', () => {
        const result = plan(cardFixtureJson('v2-lighthouse.json'), 'Ash');
        expect(result.story).toEqual({
            title: 'Mira',
            setting: 'Ash arrives on the supply boat as the new assistant keeper.',
            opening: 'Rain hammers the gallery windows. "You\'re Ash? You\'re late."',
        });
        expect(result.role).toEqual({ name: 'Ash', description: '' });
        expect(result.character).toEqual({
            name: 'Mira',
            appearance: '',
            personality: 'Guarded and dry, warms slowly to Ash.',
            voice: '',
            exampleLines: ["Boots off. The floor's just been scrubbed."],
            background: 'Mira keeps the lighthouse on a storm-cut island. She is thirty-four.',
            secrets: '',
            arcDirections: '',
        });
    });

    it('titles a nameless card "Imported card", names its Character from the V3 nickname first, else "Character"', () => {
        expect(plan(v3Card({ name: '  ', nickname: '' })).story.title).toBe('Imported card');
        expect(plan(v3Card({ name: '  ', nickname: '' })).character.name).toBe('Character');
        const thai = plan(cardFixtureJson('v3-thai.json'), 'ต้น');
        expect(thai.story.title).toBe('นางฟ้าแห่งตลาดน้ำ');
        expect(thai.character.name).toBe('มะลิ');
        expect(thai.story.setting).toBe('ต้น พายเรือมาซื้อพวงมาลัยจาก มะลิ');
        expect(thai.story.opening).toBe('สวัสดีค่ะคุณต้น วันนี้รับมาลัยไหมคะ');
        expect(thai.character.background).toBe('มะลิ ขายดอกไม้ที่ตลาดน้ำ อายุยี่สิบแปดปี');
    });

    it('replaces every macro, ignoring case, in every field that comes in', () => {
        const macros = 'A {{USER}} B <user> C {{Char}} D <BOT> E <CHAR> F {{ user }}';
        const expected = 'A Ash B Ash C Rowan D Rowan E Rowan F Ash';
        const result = plan(
            v2Card({
                name: 'Rowan',
                description: macros,
                personality: macros,
                scenario: macros,
                first_mes: macros,
                mes_example: `<START>\n${macros}\nsecond line`,
                character_book: { entries: [{ keys: ['{{char}}\'s boat', 'Lore key'], content: macros, enabled: true, name: 'About {{user}}' }] },
            }),
        );
        expect(result.story.setting).toBe(expected);
        expect(result.story.opening).toBe(expected);
        expect(result.character.personality).toBe(expected);
        expect(result.character.background).toBe(expected);
        expect(result.character.exampleLines).toEqual([`${expected}\nsecond line`]);
        expect(result.lore[0]).toMatchObject({ name: 'About Ash', keywords: ["Rowan's boat", 'Lore key'], text: expected });
        // Other macros are left as written for the author to tidy.
        expect(plan(v2Card({ scenario: '{{random:a,b}} and {{original}}' })).story.setting).toBe('{{random:a,b}} and {{original}}');
    });

    it('makes line endings \\n and trims every text', () => {
        expect(plan(v2Card({ scenario: '  \r\nOne\r\nTwo\rThree  \n' })).story.setting).toBe('One\nTwo\nThree');
    });

    it('splits example messages on <START>, drops blank blocks, and strips a single line\'s own label only', () => {
        const result = plan(
            v2Card({
                name: 'Rowan',
                mes_example: 'Before any start\n<START>\n{{char}}: Fare first.\n<start>\n   \n<START>\n{{user}}: Hello?\n{{char}}: Fare first.\n<START>\nRowan:   Mind the step.\n<START>\n{{user}}: Only the user speaks.\n<START>\n{{char}}: Two lines.\n{{user}}: Fine.',
            }),
        );
        expect(result.character.exampleLines).toEqual([
            'Before any start',
            'Fare first.',
            'Ash: Hello?\nRowan: Fare first.',
            'Mind the step.',
            'Ash: Only the user speaks.',
            'Rowan: Two lines.\nAsh: Fine.',
        ]);
    });

    it('keeps at most 50 Example lines and lists the rest', () => {
        const blocks = Array.from({ length: 53 }, (_, index) => `<START>\n{{char}}: Line ${index + 1}`).join('\n');
        const result = plan(v2Card({ mes_example: blocks }));
        expect(result.character.exampleLines).toHaveLength(50);
        expect(result.character.exampleLines[49]).toBe('Line 50');
        expect(result.leftOut).toContain('3 example messages past the 50 Example lines.');
    });

    it('maps the lorebook: disabled, blank and decorator handling, constant to Always include, regex keys left out', () => {
        const result = plan(cardFixtureJson('v2-lighthouse.json'), 'Ash');
        expect(result.lore).toEqual([
            // The comment names it; the key that is the name is dropped as redundant.
            { name: 'Lamp room', keywords: ['lamp'], text: 'The lamp room sits at the top of 112 steps.', alwaysOn: false },
            // No name or comment: the first key names it; the @@ decorator line is gone.
            { name: 'Gull Rock', keywords: [], text: "Gull Rock is where Mira's brother drowned.", alwaysOn: true },
            // The /…/ key is left out until Lore triggers.
            { name: 'Storms', keywords: ['weather'], text: 'Storms come from the west.', alwaysOn: false },
        ]);
        expect(result.leftOut).toEqual(
            expect.arrayContaining(['1 disabled Lore entry.', '1 empty Lore entry.', "1 regex keyword (patterns aren't supported yet)."]),
        );
    });

    it('leaves every key of a V3 use_regex entry out, and names an entry with no name, comment or plain key "Lore n"', () => {
        const result = plan(
            v3Card({
                character_book: {
                    entries: [
                        { keys: ['tide'], content: 'First.', enabled: true },
                        { keys: ['moon', 'tides?'], content: 'Regex entry.', enabled: true, use_regex: true },
                        { keys: [], content: 'Keyless.', enabled: true },
                    ],
                },
            }),
        );
        expect(result.lore.map((entry) => [entry.name, entry.keywords])).toEqual([
            ['tide', []],
            ['Lore 2', []],
            ['Lore 3', []],
        ]);
        expect(result.leftOut).toContain("2 regex keywords (patterns aren't supported yet).");
    });

    it('cleans keywords as the editor does and keeps at most 20 of at most 100 characters', () => {
        const keys = [' Harbour ', 'harbour', '', 'x'.repeat(101), ...Array.from({ length: 25 }, (_, index) => `key ${index}`)];
        const result = plan(v2Card({ character_book: { entries: [{ keys, content: 'Text.', enabled: true, name: 'Docks' }] } }));
        expect(result.lore[0].keywords).toEqual(['Harbour', ...Array.from({ length: 19 }, (_, index) => `key ${index}`)]);
        expect(result.leftOut).toContain('7 Lore keywords over 100 characters or past 20 on an entry.');
        const long = plan(v2Card({ character_book: { entries: [{ keys: [], content: 'Text.', enabled: true, name: 'n'.repeat(250) }] } }));
        expect(long.lore[0].name).toHaveLength(200);
    });

    it('brings at most 200 Lore entries and counts the rest', () => {
        const entries = Array.from({ length: 203 }, (_, index) => ({ keys: [`k${index}`], content: `Entry ${index}`, enabled: true }));
        const result = plan(v2Card({ character_book: { entries } }));
        expect(result.lore).toHaveLength(200);
        expect(result.lore[199].text).toBe('Entry 199');
        expect(result.leftOut).toContain('3 Lore entries past the 200 limit.');
    });

    it('cuts every text at 20,000 characters and lists each cut', () => {
        const long = 'y'.repeat(20_001);
        const result = plan(
            v2Card({
                scenario: long,
                description: long,
                mes_example: `<START>\n${long}`,
                character_book: { entries: [{ keys: [], content: long, enabled: true, name: 'Long' }] },
            }),
        );
        expect(result.story.setting).toHaveLength(20_000);
        expect(result.character.background).toHaveLength(20_000);
        expect(result.character.exampleLines[0]).toHaveLength(20_000);
        expect(result.lore[0].text).toHaveLength(20_000);
        expect(result.leftOut).toEqual(
            expect.arrayContaining([
                'The Setting was cut to 20,000 characters.',
                'Background was cut to 20,000 characters.',
                'Example line 1 was cut to 20,000 characters.',
                'Lore "Long" was cut to 20,000 characters.',
            ]),
        );
        expect(plan(v2Card({ scenario: 'y'.repeat(20_000) })).leftOut.filter((line) => line.includes('cut'))).toEqual([]);
    });

    it('takes the Character, the Role description and the Style from a Storytell block, with macros replaced', () => {
        const card = v2Card({
            name: 'Mira',
            description: 'Appearance: Tall.\n\nVoice: Short.',
            personality: 'Guarded.',
            mes_example: '<START>\n{{char}}: From the card.',
            scenario: 'The island, where {{user}} arrives.',
            extensions: {
                storytell: {
                    version: 1,
                    character: {
                        appearance: 'Tall, grey-green eyes.',
                        personality: 'Guarded and dry.',
                        voice: 'Short sentences; calls {{user}} "keeper".',
                        exampleLines: ['Boots off, {{user}}.', '  '],
                        background: 'Born on the island.',
                        secrets: 'She put the lamp out.',
                        arcDirections: 'Learns to trust.',
                    },
                    role: { name: 'Ash', description: '{{user}} is the new keeper.' },
                    style: { pov: 'first', tense: 'present', replyLength: 'long', imageStyle: 'ink wash' },
                },
            },
        });
        const result = plan(card, 'Bea');
        expect(result.character).toEqual({
            name: 'Mira',
            appearance: 'Tall, grey-green eyes.',
            personality: 'Guarded and dry.',
            voice: 'Short sentences; calls Bea "keeper".',
            exampleLines: ['Boots off, Bea.'],
            background: 'Born on the island.',
            secrets: 'She put the lamp out.',
            arcDirections: 'Learns to trust.',
        });
        expect(result.role).toEqual({ name: 'Bea', description: 'Bea is the new keeper.' });
        expect(result.story).toMatchObject({ setting: 'The island, where Bea arrives.', pov: 'first', tense: 'present', replyLength: 'long', imageStyle: 'ink wash' });
        // A Style value outside its set stays at the default (left unset).
        const odd = plan(v2Card({ extensions: { storytell: { version: 1, character: {}, style: { pov: 'fourth' } } } }));
        expect(odd.story.pov).toBeUndefined();
        // A block of another version is not read.
        expect(plan(v2Card({ extensions: { storytell: { version: 2, character: { appearance: 'X' } } } })).character.appearance).toBe('');
    });

    it('refuses a greeting the card does not have', () => {
        const card = cardFixtureJson('v2-lighthouse.json');
        expect(plan(card, 'Ash', 2).story.opening).toBe('Mira is mending nets on the jetty when Ash steps off the boat.');
        expect(codeOf(() => plan(card, 'Ash', 3))).toBe('422.007.005');
        expect(codeOf(() => plan(card, 'Ash', -1))).toBe('422.007.005');
    });
});

interface Story {
    id: number;
    title: string;
    setting: string;
    opening: string;
    style: { pov: string; tense: string; replyLength: string; imageStyle: string };
    role: { name: string; description: string };
    characters: Array<{ id: number; name: string; personality: string; background: string; exampleLines: string[]; referenceImagePath: string | null }>;
    lore: Array<{ name: string; keywords: string[]; text: string; alwaysOn: boolean }>;
    playable: boolean;
    missing: Array<{ field: string }>;
}

describe('Character cards: import through the API', () => {
    let t: TestApp;

    beforeAll(async () => {
        t = await startTestApp();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        t.gateway.reset();
    });

    afterAll(async () => {
        await t.close();
    });

    async function storyIds(): Promise<number[]> {
        const { body } = await t.http.get('/api/stories').expect(200);
        return (body.stories as Array<{ id: number }>).map((story) => story.id);
    }

    function importCard(file: Buffer, fields: Record<string, string> = { roleName: 'Ash' }, filename = 'card.json') {
        let req = t.http.post('/api/stories/from-card').attach('card', file, filename);
        for (const [key, value] of Object.entries(fields)) req = req.field(key, value);
        return req;
    }

    it('makes a new Story from a JSON card, with no model call', async () => {
        const response = await importCard(cardFixture('v2-lighthouse.json')).expect(201);
        const story = response.body as Story;
        expect(story.title).toBe('Mira');
        expect(story.setting).toBe('Ash arrives on the supply boat as the new assistant keeper.');
        expect(story.opening).toBe('Rain hammers the gallery windows. "You\'re Ash? You\'re late."');
        expect(story.role).toMatchObject({ name: 'Ash', description: '' });
        expect(story.style).toEqual({ pov: 'second', tense: 'past', replyLength: 'medium', imageStyle: '' });
        expect(story.characters).toHaveLength(1);
        expect(story.characters[0]).toMatchObject({
            name: 'Mira',
            personality: 'Guarded and dry, warms slowly to Ash.',
            background: 'Mira keeps the lighthouse on a storm-cut island. She is thirty-four.',
            exampleLines: ["Boots off. The floor's just been scrubbed."],
            referenceImagePath: null,
        });
        expect(story.lore.map((entry) => entry.name)).toEqual(['Lamp room', 'Gull Rock', 'Storms']);
        expect(story.lore[1].alwaysOn).toBe(true);
        // Not playable until Appearance, Voice and the Role's description are filled.
        expect(story.playable).toBe(false);
        expect(story.missing.map((item) => item.field).sort()).toEqual(['characters.0.appearance', 'characters.0.voice', 'role.description']);
        expect(t.gateway.calls).toHaveLength(0);
        const saved = await t.http.get(`/api/stories/${story.id}`).expect(200);
        expect(saved.body.lore).toHaveLength(3);
        const usage = await t.http.get('/api/usage').expect(200);
        expect(JSON.stringify(usage.body)).not.toContain(`"storyId":${story.id}`);
    });

    it('imports V1 and V3 cards, Thai text intact', async () => {
        const v1 = (await importCard(cardFixture('v1-flat.json'), { roleName: 'Jun' }).expect(201)).body as Story;
        expect(v1.opening).toBe("*Vela looks Jun up and down.* You're late, Jun.");
        expect(v1.characters[0].exampleLines).toEqual(['Keep your hands off the wheel.', 'Jun: Where are we headed?\nCaptain Vela: Wherever the wind pays best.']);
        const v3 = (await importCard(cardFixture('v3-thai.json'), { roleName: 'ต้น' }).expect(201)).body as Story;
        expect(v3.characters[0].name).toBe('มะลิ');
        expect(v3.opening).toBe('สวัสดีค่ะคุณต้น วันนี้รับมาลัยไหมคะ');
        expect(v3.lore).toEqual([expect.objectContaining({ name: 'ตลาดน้ำ', keywords: ['market'] })]);
    });

    it('takes the greeting asked for', async () => {
        const story = (await importCard(cardFixture('v2-lighthouse.json'), { roleName: 'Ash', greeting: '1' }).expect(201)).body as Story;
        expect(story.opening).toBe('The lamp has gone out. Mira is shouting from the top of the stairs.');
    });

    it.each([
        ['broken JSON', Buffer.from('{"name": "Mira",'), '422.007.004'],
        // Only text that opens with `{` is read as JSON: a JSON array is not a card file at all.
        ['a non-object', Buffer.from('["Mira"]'), '415.007.002'],
        ['an object that is not a card', Buffer.from('{"title": "Notes"}'), '422.007.004'],
        ['an unknown file kind', Buffer.from('PK\x03\x04charx', 'latin1'), '415.007.002'],
    ])('refuses %s and makes nothing', async (_label, file, code) => {
        const before = await storyIds();
        const response = await importCard(file);
        expect(response.body.error.code).toBe(code);
        expect(response.status).toBe(Number(code.slice(0, 3)));
        expect(await storyIds()).toEqual(before);
    });

    it('refuses a file over 15 MB before reading it', async () => {
        const before = await storyIds();
        const big = Buffer.concat([Buffer.from('{"name":"Big","description":"'), Buffer.alloc(15 * 1024 * 1024, 0x61), Buffer.from('"}')]);
        const response = await importCard(big).expect(413);
        expect(response.body.error.code).toBe('413.007.003');
        expect(await storyIds()).toEqual(before);
    });

    it('refuses an import with no file, no name or a greeting out of range', async () => {
        const noFile = await t.http.post('/api/stories/from-card').field('roleName', 'Ash').expect(400);
        expect(noFile.body.error.code).toBe('400.007.001');
        await importCard(cardFixture('v1-flat.json'), { roleName: '   ' }).expect(400);
        await importCard(cardFixture('v1-flat.json'), { roleName: 'x'.repeat(201) }).expect(400);
        const before = await storyIds();
        const greeting = await importCard(cardFixture('v1-flat.json'), { roleName: 'Ash', greeting: '1' }).expect(422);
        expect(greeting.body.error.code).toBe('422.007.005');
        expect(await storyIds()).toEqual(before);
    });

    it('leaves no Story behind when a write fails during the fill', async () => {
        const before = await storyIds();
        const stories = t.app.get(StoryManagerService);
        let calls = 0;
        const original = stories.addLoreEntry.bind(stories);
        vi.spyOn(stories, 'addLoreEntry').mockImplementation(async (...args) => {
            if (++calls === 2) throw new Error('The database went away.');
            return original(...args);
        });
        await importCard(cardFixture('v2-lighthouse.json')).expect(500);
        expect(calls).toBe(2);
        expect(await storyIds()).toEqual(before);
    });

    it('leaves no Story behind when the Character cannot be added', async () => {
        const before = await storyIds();
        vi.spyOn(t.app.get(StoryManagerService), 'addCharacter').mockRejectedValueOnce(new Error('No.'));
        await importCard(jsonFile(v2Card())).expect(500);
        expect(await storyIds()).toEqual(before);
    });
});

// --- Ticket 02: PNG cards and their picture ---

const v2Named = (name: string) => v2Card({ name });
const v3Named = (name: string) => v3Card({ name });

describe('Character cards: the PNG codec and PNG cards (pure)', () => {
    it('reads `chara` only, `ccv3` only, and prefers `ccv3` when a card has both', () => {
        expect(readCard(pngCard({ chara: v2Named('Old') })).card.name).toBe('Old');
        expect(readCard(pngCard({ chara: v2Named('Old') })).format).toBe('v2');
        expect(readCard(pngCard({ ccv3: v3Named('New') })).card.name).toBe('New');
        const both = readCard(pngCard({ chara: v2Named('Old'), ccv3: v3Named('New') }));
        expect(both.card.name).toBe('New');
        expect(both.format).toBe('v3');
        // With the V2 chunk written after the V3 one, V3 still wins.
        const later = pngCard({ ccv3: v3Named('New'), keywords: {}, extraText: [] });
        const v2After = replaceText(later, () => false, [{ keyword: 'chara', text: Buffer.from(JSON.stringify(v2Named('Later'))).toString('base64') }]);
        expect(readCard(v2After).card.name).toBe('New');
    });

    it('matches the chunk keywords ignoring case, and decodes base64 as UTF-8', () => {
        expect(readCard(pngCard({ chara: v2Named('Upper'), keywords: { chara: 'Chara' } })).card.name).toBe('Upper');
        expect(readCard(pngCard({ ccv3: v3Named('มะลิ'), keywords: { ccv3: 'CCV3' } })).card.name).toBe('มะลิ');
        expect(readCard(cardFixture('lighthouse-card.png')).card.alternate_greetings).toHaveLength(2);
    });

    it('refuses a PNG with no card in it, a PNG cut short, and broken card text', () => {
        expect(codeOf(() => readCard(pngImage()))).toBe('422.007.006');
        const card = pngCard({ chara: v2Named('Cut') });
        expect(codeOf(() => readCard(card.subarray(0, card.length - 20)))).toBe('422.007.004');
        expect(codeOf(() => readCard(pngCard({ extraText: [{ keyword: 'chara', text: 'not base64 json' }] })))).toBe('422.007.004');
    });

    it('keeps the picture without any text chunk and with the same image data', () => {
        const image = pngImage(8, 12);
        const card = pngCard({ chara: v2Named('Pic'), ccv3: v3Named('Pic'), image, extraText: [{ keyword: 'Comment', text: 'big' }] });
        // A zTXt and an iTXt chunk too, which a card picture must not keep either.
        const withMore = writeChunks([
            ...readChunks(card).slice(0, -1),
            { type: 'zTXt', data: Buffer.from('k\0\0x') },
            { type: 'iTXt', data: Buffer.from('k\0\0\0\0\0x') },
            { type: 'IEND', data: Buffer.alloc(0) },
        ]);
        const { picture } = readCard(withMore);
        expect(picture?.mimeType).toBe('image/png');
        expect(chunkTypes(picture!.bytes)).toEqual(['IHDR', 'IDAT', 'IEND']);
        expect(chunksOf(picture!.bytes)).toEqual(chunksOf(image));
        expect(picture!.bytes.equals(image)).toBe(true);
    });

    it('writes chunks with valid CRCs, and replaces text chunks rather than adding a second one', () => {
        const card = pngCard({ chara: v2Named('One') });
        const both = (keyword: string) => keyword === 'chara' || keyword === 'ccv3';
        const replaced = replaceText(card, both, [
            { keyword: 'chara', text: 'abc' },
            { keyword: 'ccv3', text: 'def' },
        ]);
        expect(chunkTypes(replaced)).toEqual(['IHDR', 'IDAT', 'tEXt', 'tEXt', 'IEND']);
        const again = replaceText(replaced, both, [{ keyword: 'chara', text: 'ghi' }]);
        const chunks = readChunks(again);
        expect(chunks.filter((c) => c.type === 'tEXt').map((c) => textOf(c))).toEqual([{ keyword: 'chara', text: 'ghi' }]);
        // Every CRC is the CRC-32 of the type and data.
        let offset = 8;
        while (offset < again.length) {
            const length = again.readUInt32BE(offset);
            const crc = again.readUInt32BE(offset + 8 + length);
            expect(crc).toBe(crc32(again.subarray(offset + 4, offset + 8 + length)) >>> 0);
            offset += 12 + length;
        }
        expect(readText(chunks, 'CHARA')).toBe('ghi');
        expect(() => readChunks(Buffer.from('not a png'))).toThrow();
    });

    it("takes a V3 JSON card's picture from a data: icon, and never from a URL", () => {
        const image = pngImage(4, 4);
        const dataIcon = v3Card({ assets: [{ type: 'icon', uri: `data:image/png;base64,${image.toString('base64')}`, name: 'main', ext: 'png' }] });
        expect(readJsonCard(jsonFile(dataIcon)).picture?.bytes.equals(image)).toBe(true);
        const remote = v3Card({ assets: [{ type: 'icon', uri: 'https://example.invalid/mira.png', name: 'main', ext: 'png' }] });
        expect(readJsonCard(jsonFile(remote)).picture).toBeNull();
        const notAPicture = v3Card({ assets: [{ type: 'icon', uri: `data:image/png;base64,${Buffer.from('hello').toString('base64')}`, name: 'main', ext: 'png' }] });
        expect(readJsonCard(jsonFile(notAPicture)).picture).toBeNull();
    });
});

describe('Character cards: PNG import through the API', () => {
    let t: TestApp;

    beforeAll(async () => {
        t = await startTestApp();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        t.gateway.reset();
    });

    afterAll(async () => {
        await t.close();
    });

    async function storyIds(): Promise<number[]> {
        const { body } = await t.http.get('/api/stories').expect(200);
        return (body.stories as Array<{ id: number }>).map((story) => story.id);
    }

    async function files(): Promise<string[]> {
        const entries = await readdir(t.imageDir, { recursive: true, withFileTypes: true });
        return entries
            .filter((entry) => entry.isFile())
            .map((entry) => path.relative(t.imageDir, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'))
            .sort();
    }

    const importPng = (file: Buffer) => t.http.post('/api/stories/from-card').attach('card', file, 'card.png').field('roleName', 'Ash');

    it("makes the picture the Character's Reference image, with no Portrait crop, and the Cover", async () => {
        const story = (await importPng(cardFixture('lighthouse-card.png')).expect(201)).body as Story & {
            characters: Array<{ portraitCrop: unknown }>;
            cover: { source: string; characterId: number | null; imagePath: string } | null;
        };
        const mira = story.characters[0];
        expect(mira.referenceImagePath).toMatch(new RegExp(`^reference-images/story-${story.id}/character-${mira.id}-[0-9a-f]+\\.png$`));
        expect(mira.portraitCrop).toBeNull();
        expect(story.cover).toMatchObject({ source: 'reference_image', characterId: mira.id, imagePath: mira.referenceImagePath });
        const stored = await readFile(path.join(t.imageDir, mira.referenceImagePath!));
        expect(chunkTypes(stored)).toEqual(['IHDR', 'IDAT', 'IEND']);
        expect(story.lore).toHaveLength(3);
        expect(t.gateway.calls).toHaveLength(0);
        const { body } = await t.http.get('/api/stories').expect(200);
        expect(body.stories.find((card: { id: number }) => card.id === story.id).coverImagePath).toBe(mira.referenceImagePath);
    });

    it('gives a V3 JSON card its data: icon, and an https: icon none', async () => {
        const image = pngImage(4, 4);
        const withIcon = v3Card({ assets: [{ type: 'icon', uri: `data:image/png;base64,${image.toString('base64')}`, name: 'main', ext: 'png' }] });
        const iconStory = (await importPng(jsonFile(withIcon)).expect(201)).body as Story;
        expect(iconStory.characters[0].referenceImagePath).toMatch(/\.png$/);
        const remote = v3Card({ assets: [{ type: 'icon', uri: 'https://example.invalid/rowan.png', name: 'main', ext: 'png' }] });
        const remoteStory = (await importPng(jsonFile(remote)).expect(201)).body as Story & { cover: unknown };
        expect(remoteStory.characters[0].referenceImagePath).toBeNull();
        expect(remoteStory.cover).toBeNull();
        // The test app has no network: a fetch would have failed the import.
        expect(t.gateway.calls).toHaveLength(0);
    });

    it('refuses a plain picture and makes nothing', async () => {
        const before = await storyIds();
        const response = await importPng(pngImage()).expect(422);
        expect(response.body.error.code).toBe('422.007.006');
        expect(await storyIds()).toEqual(before);
    });

    it('deletes the Story and the picture when the Cover fails after the picture was written', async () => {
        const before = await storyIds();
        const filesBefore = await files();
        vi.spyOn(t.app.get(StoryManagerService), 'chooseCover').mockRejectedValueOnce(new Error('Cover failed.'));
        await importPng(cardFixture('lighthouse-card.png')).expect(500);
        expect(await storyIds()).toEqual(before);
        expect(await files()).toEqual(filesBefore);
    });

    it('deletes the picture and the Story when the Character cannot record the picture', async () => {
        const before = await storyIds();
        const filesBefore = await files();
        const model = t.app.get(StoryModelService);
        const original = model.saveCharacter.bind(model);
        let written = false;
        vi.spyOn(model, 'saveCharacter').mockImplementation(async (character) => {
            if (character.referenceImagePath) {
                // The file is on disk at this point, and not yet recorded on the Character.
                written = (await files()).includes(character.referenceImagePath);
                throw new Error('The database went away.');
            }
            return original(character);
        });
        await importPng(cardFixture('lighthouse-card.png')).expect(500);
        expect(written).toBe(true);
        expect(await storyIds()).toEqual(before);
        expect(await files()).toEqual(filesBefore);
    });
});

// --- Ticket 03: preview a card and choose its greeting ---

describe('Character cards: what won\'t come along (pure)', () => {
    it('lists each thing a full card leaves behind, in plain words', () => {
        const entries = [
            { keys: ['/regex/i', 'plain'], content: 'One.', enabled: true, insertion_order: 0 },
            { keys: ['off'], content: 'Off.', enabled: false },
            ...Array.from({ length: 201 }, (_, index) => ({ keys: [`k${index}`], content: `E${index}`, enabled: true })),
        ];
        const result = plan(
            v2Card({
                system_prompt: 'You are {{char}}.',
                post_history_instructions: 'Stay in character.',
                tags: ['river', 'slow burn'],
                alternate_greetings: ['Second.', 'Third.'],
                creator_notes: 'Tips.',
                scenario: 'z'.repeat(20_001),
                character_book: { scan_depth: 3, entries },
            }),
        );
        expect(result.leftOut).toEqual([
            "The card's system prompt (Storytell writes its own).",
            "The card's post-history instructions (Storytell writes its own).",
            "The creator's notes (shown here, not kept).",
            'Tags: river, slow burn.',
            "The greetings you don't choose (2 of 3).",
            '1 disabled Lore entry.',
            '2 Lore entries past the 200 limit.',
            "1 regex keyword (patterns aren't supported yet).",
            'Lorebook settings: scan depth.',
            'Lore entry settings: insertion order.',
            'The Setting was cut to 20,000 characters.',
        ]);
    });

    it('lists nothing for a bare V1 card', () => {
        expect(plan(cardFixtureJson('v1-flat.json')).leftOut).toEqual([]);
    });
});

describe('Character cards: preview and greeting through the API', () => {
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

    async function storyIds(): Promise<number[]> {
        const { body } = await t.http.get('/api/stories').expect(200);
        return (body.stories as Array<{ id: number }>).map((story) => story.id);
    }

    async function fileCount(): Promise<number> {
        const entries = await readdir(t.imageDir, { recursive: true, withFileTypes: true });
        return entries.filter((entry) => entry.isFile()).length;
    }

    const preview = (file: Buffer, name = 'card.png') => t.http.post('/api/stories/from-card/preview').attach('card', file, name);

    it('previews V1, V2 and V3 cards and writes nothing', async () => {
        const before = await storyIds();
        const files = await fileCount();

        const v1 = (await preview(cardFixture('v1-flat.json'), 'vela.json').expect(200)).body;
        expect(v1).toEqual({
            format: 'v1',
            title: 'Captain Vela',
            characterName: 'Captain Vela',
            creator: '',
            creatorNotes: '',
            greetings: ["*Vela looks {{user}} up and down.* You're late, <user>."],
            loreEntries: 0,
            hasPicture: false,
            roleName: null,
            leftOut: [],
        });

        const v2 = (await preview(cardFixture('lighthouse-card.png')).expect(200)).body;
        expect(v2).toMatchObject({
            format: 'v3',
            title: 'Mira',
            characterName: 'Mira',
            creator: 'tester',
            creatorNotes: 'Works best with slow-burn openings.',
            greetings: [
                'Rain hammers the gallery windows. "You\'re {{user}}? You\'re late."',
                'The lamp has gone out. {{char}} is shouting from the top of the stairs.',
                '{{char}} is mending nets on the jetty when {{user}} steps off the boat.',
            ],
            loreEntries: 3,
            hasPicture: true,
            roleName: null,
        });
        expect(v2.leftOut).toContain("The card's system prompt (Storytell writes its own).");
        expect((await preview(cardFixture('v2-lighthouse.json'), 'mira.json').expect(200)).body.format).toBe('v2');

        const v3 = (await preview(cardFixture('v3-thai.json'), 'mali.json').expect(200)).body;
        expect(v3).toMatchObject({ format: 'v3', title: 'นางฟ้าแห่งตลาดน้ำ', characterName: 'มะลิ', loreEntries: 1, hasPicture: false });

        expect(await storyIds()).toEqual(before);
        expect(await fileCount()).toBe(files);
        expect(t.gateway.calls).toHaveLength(0);
    });

    it('cuts the creator\'s notes to 2,000 characters and each greeting to 300', async () => {
        const body = (await preview(jsonFile(v2Card({ creator_notes: 'n'.repeat(2_500), first_mes: 'g'.repeat(400) })), 'long.json').expect(200)).body;
        expect(body.creatorNotes).toHaveLength(2_000);
        expect(body.creatorNotes.endsWith('…')).toBe(true);
        expect(body.greetings[0]).toHaveLength(300);
    });

    it('answers the Role name of a Storytell card from its own block', async () => {
        const card = v2Card({ extensions: { storytell: { version: 1, character: {}, role: { name: 'Ash', description: '' }, style: {} } } });
        expect((await preview(jsonFile(card), 'own.json').expect(200)).body.roleName).toBe('Ash');
    });

    it('refuses what an import refuses: no file, a plain picture, broken JSON', async () => {
        const noFile = await t.http.post('/api/stories/from-card/preview').expect(400);
        expect(noFile.body.error.code).toBe('400.007.001');
        expect((await preview(pngImage()).expect(422)).body.error.code).toBe('422.007.006');
        expect((await preview(Buffer.from('{"name":'), 'broken.json').expect(422)).body.error.code).toBe('422.007.004');
    });

    it('takes the second alternate greeting as the Opening for greeting 2, and refuses one out of range', async () => {
        const story = (await t.http.post('/api/stories/from-card').attach('card', cardFixture('lighthouse-card.png'), 'card.png').field('roleName', 'Ash').field('greeting', '2').expect(201)).body as Story;
        expect(story.opening).toBe('Mira is mending nets on the jetty when Ash steps off the boat.');

        const before = await storyIds();
        const files = await fileCount();
        const refused = await t.http.post('/api/stories/from-card').attach('card', cardFixture('lighthouse-card.png'), 'card.png').field('roleName', 'Ash').field('greeting', '3').expect(422);
        expect(refused.body.error.code).toBe('422.007.005');
        expect(await storyIds()).toEqual(before);
        expect(await fileCount()).toBe(files);
    });
});

// --- Ticket 04: export a Character as a card PNG ---

type StoryForCard = Parameters<typeof writeCard>[0];

function storyForCard(overrides: Partial<StoryForCard> = {}): StoryForCard {
    const mira = {
        id: 11,
        name: 'Mira',
        appearance: 'Tall, grey-green eyes.',
        personality: 'Guarded and dry; teases Ash.',
        voice: 'Short sentences.',
        exampleLines: ['Boots off.', 'Ash: Where do I sleep?\nMira: Wherever you fall, Ash.'],
        background: 'Born on the island; thirty-four.',
        secrets: '',
        arcDirections: 'Learns to trust Ash.',
        referenceImagePath: null,
        portraitCrop: null,
    };
    return {
        id: 7,
        title: 'The Lighthouse',
        createdAt: '2026-11-01T10:00:00.000Z',
        updatedAt: '2026-11-02T12:30:00.000Z',
        setting: 'A lighthouse where Ash, not Ashley, keeps the lamp.',
        opening: 'Rain hammers the glass. "Ash? You\'re late."',
        style: { pov: 'first', tense: 'present', replyLength: 'long', imageStyle: 'ink wash' },
        role: { id: 3, name: 'Ash', description: "Ash is the new keeper. Ash's boots are wet." },
        characters: [mira],
        startingBonds: [],
        scenes: [],
        lore: [
            { id: 21, name: 'Lamp room', keywords: ['lamp', 'lens'], text: 'At the top of 112 steps.', alwaysOn: false },
            { id: 22, name: 'Empty', keywords: [], text: '   ', alwaysOn: true },
            { id: 23, name: 'Gull Rock', keywords: [], text: 'Where Ash first landed.', alwaysOn: true },
        ],
        cover: null,
        ...overrides,
    } as unknown as StoryForCard;
}

describe('Character cards: the writer (pure)', () => {
    it('writes the V2 shape, with the Role\'s name as {{user}} and the labelled description', () => {
        const story = storyForCard();
        const { v2 } = writeCard(story, story.characters[0]);
        expect(v2).toMatchObject({ spec: 'chara_card_v2', spec_version: '2.0' });
        const data = (v2 as { data: Record<string, unknown> }).data;
        expect(data).toMatchObject({
            name: 'Mira',
            description: 'Appearance: Tall, grey-green eyes.\n\nVoice: Short sentences.\n\nBackground: Born on the island; thirty-four.',
            personality: 'Guarded and dry; teases {{user}}.',
            scenario: 'A lighthouse where {{user}}, not Ashley, keeps the lamp.',
            first_mes: 'Rain hammers the glass. "{{user}}? You\'re late."',
            mes_example: '<START>\n{{char}}: Boots off.\n<START>\n{{user}}: Where do I sleep?\n{{char}}: Wherever you fall, {{user}}.',
            creator_notes: 'Exported from Storytell AI.',
            system_prompt: '',
            post_history_instructions: '',
            creator: '',
            character_version: '',
            alternate_greetings: [],
            tags: [],
        });
        expect(data).not.toHaveProperty('nickname');
        expect(data.character_book).toEqual({
            name: 'The Lighthouse',
            extensions: {},
            entries: [
                { keys: ['Lamp room', 'lamp', 'lens'], content: 'At the top of 112 steps.', extensions: {}, enabled: true, insertion_order: 0, constant: false, selective: false, name: 'Lamp room', comment: 'Lamp room' },
                { keys: ['Gull Rock'], content: 'Where {{user}} first landed.', extensions: {}, enabled: true, insertion_order: 1, constant: true, selective: false, name: 'Gull Rock', comment: 'Gull Rock' },
            ],
        });
        expect((data.extensions as { storytell: unknown }).storytell).toEqual({
            version: 1,
            character: {
                appearance: 'Tall, grey-green eyes.',
                personality: 'Guarded and dry; teases {{user}}.',
                voice: 'Short sentences.',
                exampleLines: ['Boots off.', '{{user}}: Where do I sleep?\nMira: Wherever you fall, {{user}}.'],
                background: 'Born on the island; thirty-four.',
                secrets: '',
                arcDirections: 'Learns to trust {{user}}.',
            },
            role: { name: 'Ash', description: "{{user}} is the new keeper. {{user}}'s boots are wet." },
            style: { pov: 'first', tense: 'present', replyLength: 'long', imageStyle: 'ink wash' },
        });
    });

    it('writes the V3 shape: the same data plus its own fields, dates in Unix seconds, use_regex false', () => {
        const story = storyForCard();
        const { v2, v3 } = writeCard(story, story.characters[0]);
        expect(v3).toMatchObject({ spec: 'chara_card_v3', spec_version: '3.0' });
        const data = (v3 as { data: Record<string, any> }).data;
        expect(data).toMatchObject({
            ...(v2 as { data: Record<string, unknown> }).data,
            character_book: expect.anything(),
            nickname: '',
            group_only_greetings: [],
            creation_date: Date.parse('2026-11-01T10:00:00.000Z') / 1000,
            modification_date: Date.parse('2026-11-02T12:30:00.000Z') / 1000,
            assets: [{ type: 'icon', uri: 'ccdefault:', name: 'main', ext: 'png' }],
        });
        expect(data.character_book.entries.map((entry: { use_regex: boolean }) => entry.use_regex)).toEqual([false, false]);
    });

    it('leaves the lorebook out when no Lore has text, and blank paragraphs out of the description', () => {
        const story = storyForCard({ lore: [] } as Partial<StoryForCard>);
        const character = { ...story.characters[0], appearance: '', voice: '  ', background: '', secrets: 'Put the lamp out.' };
        const data = (writeCard(story, character).v2 as { data: Record<string, unknown> }).data;
        expect(data).not.toHaveProperty('character_book');
        expect(data.description).toBe('Secrets: Put the lamp out.');
    });

    it('writes the Role\'s name as {{user}} only as a whole word', () => {
        expect(userMacro('Ash, Ashley, Cash, ash-grey, Ash\'s, (Ash)', 'Ash')).toBe('{{user}}, Ashley, Cash, ash-grey, {{user}}\'s, ({{user}})');
        expect(userMacro('Nothing to change', '  ')).toBe('Nothing to change');
        expect(userMacro('Ask Dr. K.', 'Dr. K.')).toBe('Ask {{user}}');
    });

    it('writes Example lines as <START> blocks, labelled or not', () => {
        expect(exampleBlocks(['Hello.', '  ', 'mira: Lower case label.', 'Ash: Hi?\nNarration line.\nMira: Hi.'], 'Mira', 'Ash')).toBe(
            '<START>\n{{char}}: Hello.\n<START>\n{{char}}: Lower case label.\n<START>\n{{user}}: Hi?\nNarration line.\n{{char}}: Hi.',
        );
        expect(labelledDescription({ appearance: 'A', voice: '', background: 'B', secrets: '' })).toBe('Appearance: A\n\nBackground: B');
    });

    it('gives back the same Character, Role, Style, Setting, Opening and Lore through the reader and the mapping', () => {
        const story = storyForCard();
        const { v2, v3 } = writeCard(story, story.characters[0]);
        for (const definition of [v2, v3]) {
            const png = replaceText(pngImage(), () => false, [{ keyword: 'chara', text: Buffer.from(JSON.stringify(definition)).toString('base64') }]);
            const read = readCard(png);
            const back = mapCard(read.card, { roleName: 'Ash', greeting: 0 });
            const mira = story.characters[0];
            expect(back.character).toEqual({
                name: mira.name,
                appearance: mira.appearance,
                personality: mira.personality,
                voice: mira.voice,
                exampleLines: mira.exampleLines,
                background: mira.background,
                secrets: mira.secrets,
                arcDirections: mira.arcDirections,
            });
            expect(back.role).toEqual({ name: 'Ash', description: story.role.description });
            expect(back.story).toEqual({ title: 'Mira', setting: story.setting, opening: story.opening, ...story.style });
            expect(back.lore).toEqual(
                story.lore.filter((entry) => entry.text.trim() !== '').map(({ name, keywords, text, alwaysOn }) => ({ name, keywords, text, alwaysOn })),
            );
        }
    });
});

describe('Character cards: export through the API', () => {
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

    /** A playable Story made through the authoring routes, with a Chat and a Memory in it. */
    async function playedStory(): Promise<{ storyId: number; characterId: number; chatId: number }> {
        const storyId = (await t.http.post('/api/stories').send({ title: 'The Lighthouse' }).expect(201)).body.id as number;
        await t.http.patch(`/api/stories/${storyId}`).send({ setting: 'A lighthouse on a storm-cut island.', opening: 'Rain hammers the glass.' }).expect(200);
        await t.http.patch(`/api/stories/${storyId}/role`).send({ name: 'Ash', description: 'The new keeper.' }).expect(200);
        const withCast = await t.http
            .post(`/api/stories/${storyId}/characters`)
            .send({ name: 'Mira Bélanger', appearance: 'Tall.', personality: 'Dry; watches Ash.', voice: 'Short.', exampleLines: ['Boots off.'] })
            .expect(201);
        await t.http.post(`/api/stories/${storyId}/lore`).send({ name: 'Lamp room', keywords: ['lamp'], text: 'At the top.' }).expect(201);
        const characterId = withCast.body.characters[0].id as number;
        const chatId = (await t.http.post(`/api/stories/${storyId}/chats`).expect(201)).body.id as number;
        await t.http.patch(`/api/stories/${storyId}/chats/${chatId}`).send({ title: 'Secret chat title' }).expect(200);
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/memories`).send({ text: 'A memory that never leaves.' }).expect(201);
        return { storyId, characterId, chatId };
    }

    const exportCard = (storyId: number, characterId: number, image: Buffer, name = 'card.png') =>
        t.http
            .post(`/api/stories/${storyId}/characters/${characterId}/card`)
            .attach('image', image, name)
            .buffer(true)
            .parse((res, done) => {
                const parts: Buffer[] = [];
                res.on('data', (part: Buffer) => parts.push(part));
                res.on('end', () => done(null, Buffer.concat(parts)));
            });

    it('answers a PNG named after the Character whose chunks hold both definitions, and nothing else of the Story', async () => {
        const { storyId, characterId, chatId } = await playedStory();
        // An old card's chunks in the picture are replaced, never kept beside the new ones.
        const picture = pngCard({ chara: v2Named('Old'), ccv3: v3Named('Old'), extraText: [{ keyword: 'chara-ext-asset_:1', text: 'x' }] });
        t.gateway.reset();
        const response = await exportCard(storyId, characterId, picture).expect(200);
        expect(response.headers['content-type']).toBe('image/png');
        expect(response.headers['content-disposition']).toBe(
            `attachment; filename="mira-belanger.png"; filename*=UTF-8''${encodeURIComponent('Mira Bélanger.png')}`,
        );
        const png = response.body as Buffer;
        expect(chunkTypes(png)).toEqual(['IHDR', 'IDAT', 'tEXt', 'tEXt', 'IEND']);
        const chunks = readChunks(png);
        const v2 = JSON.parse(Buffer.from(readText(chunks, 'chara')!, 'base64').toString('utf8'));
        const v3 = JSON.parse(Buffer.from(readText(chunks, 'ccv3')!, 'base64').toString('utf8'));
        expect(v2.spec).toBe('chara_card_v2');
        expect(v3.spec).toBe('chara_card_v3');
        expect(v2.data.name).toBe('Mira Bélanger');
        expect(v2.data.personality).toBe('Dry; watches {{user}}.');
        expect(v3.data.character_book.entries[0].keys).toEqual(['Lamp room', 'lamp']);

        // No ids, Chats or Memories anywhere in the definitions.
        const text = JSON.stringify([v2, v3]);
        expect(text).not.toMatch(/"(id|storyId|characterId|chatId)"\s*:/);
        expect(text).not.toContain('Secret chat title');
        expect(text).not.toContain('A memory that never leaves.');
        expect(text).not.toContain(`/chats/${chatId}`);
        expect(t.gateway.calls).toHaveLength(0);

        // Storytell reads its own card back.
        const reimported = (await t.http.post('/api/stories/from-card').attach('card', png, 'mira.png').field('roleName', 'Ash').expect(201)).body as Story;
        expect(reimported.characters[0]).toMatchObject({ name: 'Mira Bélanger', personality: 'Dry; watches Ash.', exampleLines: ['Boots off.'] });
        expect(reimported.role).toMatchObject({ name: 'Ash', description: 'The new keeper.' });
        expect(reimported.playable).toBe(true);
    });

    it('refuses a JPEG, a missing file, and an unknown Story or Character', async () => {
        const { storyId, characterId } = await playedStory();
        const jpeg = await exportCard(storyId, characterId, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]), 'card.jpg').expect(415);
        expect(JSON.parse(jpeg.body.toString()).error.code).toBe('415.007.007');
        const cut = await exportCard(storyId, characterId, pngImage().subarray(0, 30)).expect(415);
        expect(JSON.parse(cut.body.toString()).error.code).toBe('415.007.007');
        const noFile = await t.http.post(`/api/stories/${storyId}/characters/${characterId}/card`).expect(400);
        expect(noFile.body.error.code).toBe('400.002.008');
        const noCharacter = await exportCard(storyId, characterId + 999, pngImage()).expect(404);
        expect(JSON.parse(noCharacter.body.toString()).error.code).toBe('404.003.002');
        const noStory = await exportCard(storyId + 999, characterId, pngImage()).expect(404);
        expect(JSON.parse(noStory.body.toString()).error.code).toBe('404.003.001');
    });

    it('refuses a picture over 15 MB', async () => {
        const { storyId, characterId } = await playedStory();
        const big = pngCard({ extraText: [{ keyword: 'Comment', text: 'a'.repeat(15 * 1024 * 1024 + 10) }] });
        const response = await exportCard(storyId, characterId, big).expect(413);
        expect(JSON.parse(response.body.toString()).error.code).toBe('413.002.010');
    });
});

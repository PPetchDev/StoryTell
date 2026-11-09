import { mapCard } from '../src/manager/character-card/card-mapping.js';
import { readChunks, readText, replaceText } from '../src/manager/character-card/card-png.js';
import { readCard, readCardJson } from '../src/manager/character-card/card-reader.js';
import { writeCard } from '../src/manager/character-card/card-writer.js';
import { FAKE_SPEECH_VOICES } from '../src/service/model-gateway/fake-model-gateway.js';
import { pngImage, v2Card } from './harness/card-files.js';
import { startTestApp, TestApp } from './harness/test-app.js';

// .scratch/character-cards/issues/06-cards-carry-voices-and-backdrop.md: Storytell's own block
// carries the Narration voice, the Speaking voice and the Backdrop choice, each only when set.

const KNOWN = new Set(['bm_george', 'bf_emma', 'af_sky']);
const known = (voice: string) => KNOWN.has(voice);

type StoryForCard = Parameters<typeof writeCard>[0];

function storyForCard(looks: { narrationVoice?: string | null; backdrop?: string; speakingVoice?: string | null } = {}): StoryForCard {
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
        speakingVoice: looks.speakingVoice ?? null,
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
        lore: [],
        documents: [],
        savedReplies: [],
        replaceRules: [],
        cover: null,
        narrationVoice: looks.narrationVoice ?? null,
        backdrop: looks.backdrop ?? 'none',
    } as unknown as StoryForCard;
}

const blockOf = (definition: unknown) => (definition as { data: { extensions: { storytell: Record<string, Record<string, unknown>> } } }).data.extensions.storytell;

/** A Storytell card whose block has the given style and character keys over the writer's own. */
function storytellCard(style: Record<string, unknown>, character: Record<string, unknown>) {
    const story = storyForCard();
    const { v2 } = writeCard(story, story.characters[0]);
    const block = blockOf(v2);
    Object.assign(block.style, style);
    Object.assign(block.character, character);
    return v2;
}

describe('Character cards: voices and the Backdrop in Storytell\'s block (pure)', () => {
    it('writes the three keys only when set, and keeps version 1', () => {
        const plain = storyForCard();
        const bare = blockOf(writeCard(plain, plain.characters[0]).v2);
        expect(bare.version).toBe(1);
        expect(bare.style).not.toHaveProperty('narrationVoice');
        expect(bare.style).not.toHaveProperty('backdrop');
        expect(bare.character).not.toHaveProperty('speakingVoice');

        const set = storyForCard({ narrationVoice: 'bm_george', backdrop: 'snapshot', speakingVoice: 'bf_emma' });
        const { v2, v3 } = writeCard(set, set.characters[0]);
        for (const definition of [v2, v3]) {
            expect(blockOf(definition).style).toMatchObject({ narrationVoice: 'bm_george', backdrop: 'snapshot' });
            expect(blockOf(definition).character).toMatchObject({ speakingVoice: 'bf_emma' });
        }
    });

    it('reads them back; a block without the keys gives the defaults', () => {
        const back = mapCard(readCardJson(JSON.stringify(storytellCard({ narrationVoice: 'bm_george', backdrop: 'cover' }, { speakingVoice: 'bf_emma' }))).card, { roleName: 'Ash', greeting: 0 }, known);
        expect(back.story).toMatchObject({ narrationVoice: 'bm_george', backdrop: 'cover' });
        expect(back.character.speakingVoice).toBe('bf_emma');

        const bare = mapCard(readCardJson(JSON.stringify(storytellCard({}, {}))).card, { roleName: 'Ash', greeting: 0 }, known);
        expect(bare.story).toMatchObject({ narrationVoice: null, backdrop: 'none' });
        expect(bare.character.speakingVoice).toBeNull();
        expect(bare.leftOut.filter((line) => /voice|backdrop/.test(line))).toEqual([]);
    });

    it('leaves an unknown voice id and an unknown Backdrop value at the default, and lists each', () => {
        const back = mapCard(
            readCardJson(JSON.stringify(storytellCard({ narrationVoice: 'zz_nobody', backdrop: 'video' }, { speakingVoice: 'xx_gone' }))).card,
            { roleName: 'Ash', greeting: 0 },
            known,
        );
        expect(back.story).toMatchObject({ narrationVoice: null, backdrop: 'none' });
        expect(back.character.speakingVoice).toBeNull();
        expect(back.leftOut.filter((line) => /voice|backdrop/.test(line))).toEqual([
            'The Narration voice "zz_nobody" (not in the voice list).',
            'The Speaking voice "xx_gone" (not in the voice list).',
            'The Chat backdrop "video" (not one Storytell has).',
        ]);
    });

    it('never reads these keys from a card that is not Storytell\'s own', () => {
        const other = v2Card({ extensions: { narrationVoice: 'bm_george', backdrop: 'cover' } });
        const back = mapCard(readCardJson(JSON.stringify(other)).card, { roleName: 'Ash', greeting: 0 }, known);
        expect(back.story).toMatchObject({ narrationVoice: null, backdrop: 'none' });
    });

    it('export then import keeps the Narration voice, the Speaking voice and the Backdrop choice', () => {
        const story = storyForCard({ narrationVoice: 'bm_george', backdrop: 'snapshot', speakingVoice: 'bf_emma' });
        const { v2, v3 } = writeCard(story, story.characters[0]);
        for (const definition of [v2, v3]) {
            const png = replaceText(pngImage(), () => false, [{ keyword: 'chara', text: Buffer.from(JSON.stringify(definition)).toString('base64') }]);
            const back = mapCard(readCard(png).card, { roleName: 'Ash', greeting: 0 }, known);
            expect(back.story).toMatchObject({ narrationVoice: 'bm_george', backdrop: 'snapshot' });
            expect(back.character.speakingVoice).toBe('bf_emma');
        }
    });
});

describe('Character cards: voices and the Backdrop through the API', () => {
    let t: TestApp;

    beforeAll(async () => {
        t = await startTestApp();
    });

    afterAll(async () => {
        await t.close();
    });

    const exportCard = (storyId: number, characterId: number) =>
        t.http
            .post(`/api/stories/${storyId}/characters/${characterId}/card`)
            .attach('image', pngImage(), 'card.png')
            .buffer(true)
            .parse((res, done) => {
                const parts: Buffer[] = [];
                res.on('data', (part: Buffer) => parts.push(part));
                res.on('end', () => done(null, Buffer.concat(parts)));
            })
            .expect(200);

    it('a round trip keeps the voices and the Backdrop, and no Documents, Expressions, Saved replies or Replace rules travel', async () => {
        const [narration, speaking] = [FAKE_SPEECH_VOICES[0].id, FAKE_SPEECH_VOICES[1].id];
        const storyId = (await t.http.post('/api/stories').send({ title: 'The Lighthouse' }).expect(201)).body.id as number;
        await t.http
            .patch(`/api/stories/${storyId}`)
            .send({ setting: 'A lighthouse.', opening: 'Rain hammers the glass.', narrationVoice: narration, backdrop: 'cover' })
            .expect(200);
        await t.http.patch(`/api/stories/${storyId}/role`).send({ name: 'Ash', description: 'The new keeper.' }).expect(200);
        const withMira = await t.http
            .post(`/api/stories/${storyId}/characters`)
            .send({ name: 'Mira', appearance: 'Tall.', personality: 'Dry.', voice: 'Short.' })
            .expect(201);
        const miraId = withMira.body.characters[0].id as number;
        await t.http.patch(`/api/stories/${storyId}/characters/${miraId}`).send({ speakingVoice: speaking }).expect(200);
        // Story-wide tools and extra pictures that must never travel in a card.
        await t.http.post(`/api/stories/${storyId}/saved-replies`).send({ text: 'A saved reply that stays home.' }).expect(201);
        await t.http.post(`/api/stories/${storyId}/replace-rules`).send({ find: 'stays-home-find', replace: 'stays-home-replace' }).expect(201);
        await t.http
            .put(`/api/stories/${storyId}/characters/${miraId}/expressions/joy`)
            .attach('image', pngImage(), 'joy.png')
            .expect(200);
        await t.http
            .post(`/api/stories/${storyId}/documents`)
            .send({ title: 'A document that stays home', text: 'Its words stay home too.', source: 'pasted' })
            .expect(201);

        const png = (await exportCard(storyId, miraId)).body as Buffer;
        const chunks = readChunks(png);
        const definitions = ['chara', 'ccv3'].map((keyword) => JSON.parse(Buffer.from(readText(chunks, keyword)!, 'base64').toString('utf8')));
        for (const definition of definitions) {
            expect(blockOf(definition).style).toMatchObject({ narrationVoice: narration, backdrop: 'cover' });
            expect(blockOf(definition).character).toMatchObject({ speakingVoice: speaking });
        }
        const text = JSON.stringify(definitions);
        for (const stayingHome of ['A saved reply that stays home.', 'stays-home-find', 'stays-home-replace', 'A document that stays home', 'Its words stay home too.', 'expressions/']) {
            expect(text).not.toContain(stayingHome);
        }

        const { body: back } = await t.http.post('/api/stories/from-card').attach('card', png, 'mira.png').field('roleName', 'Ash').expect(201);
        expect(back).toMatchObject({ narrationVoice: narration, backdrop: 'cover' });
        expect(back.characters[0].speakingVoice).toBe(speaking);
        expect(back.savedReplies).toEqual([]);
        expect(back.replaceRules).toEqual([]);
        expect(back.documents).toEqual([]);
        expect(back.characters[0].expressions).toEqual([]);
    });

    it('previews an unknown voice in "Won\'t come along" and imports it at the default', async () => {
        const card = storytellCard({ narrationVoice: 'zz_nobody' }, {});
        const { body: preview } = await t.http.post('/api/stories/from-card/preview').attach('card', Buffer.from(JSON.stringify(card)), 'mira.json').expect(200);
        expect(preview.leftOut).toContain('The Narration voice "zz_nobody" (not in the voice list).');
        const { body: story } = await t.http
            .post('/api/stories/from-card')
            .attach('card', Buffer.from(JSON.stringify(card)), 'mira.json')
            .field('roleName', 'Ash')
            .expect(201);
        expect(story.narrationVoice).toBeNull();
    });
});

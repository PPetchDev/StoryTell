import { historyPartsText, parseReply, splitQuotedSpeech } from '../src/manager/chat/turn/reply-parser.js';
import { startTestApp, TestApp } from './harness/test-app.js';

/**
 * Speech written as prose (.scratch/quoted-speech/spec.md): a speech line that opens with a
 * quotation mark and puts narration between its quotes is split into speech and narration, so the
 * action leaves the bubble and the next turn's history no longer shows the habit.
 */

const CAST = [
    { id: 1, name: 'Tamsin Valmont' },
    { id: 2, name: 'Ines Varro' },
];

describe('Speech written as prose: splitting a line (pure)', () => {
    it('takes the quoted words as speech and the text between them as narration', () => {
        expect(splitQuotedSpeech('"Going, going." She leans on the fence post, unbothered. "Sleep well, Rin."')).toEqual([
            { kind: 'speech', text: 'Going, going.' },
            { kind: 'narration', text: 'She leans on the fence post, unbothered.' },
            { kind: 'speech', text: 'Sleep well, Rin.' },
        ]);
    });

    it('makes each piece stand on its own: a trailing comma ends it, narration starts with a capital', () => {
        expect(splitQuotedSpeech('"Cookies," she says, "in the morning."')).toEqual([
            { kind: 'speech', text: 'Cookies.' },
            { kind: 'narration', text: 'She says.' },
            { kind: 'speech', text: 'in the morning.' },
        ]);
    });

    it('reads curly quotes, takes the quotes off a line that is all speech, and keeps an unclosed quote as speech', () => {
        expect(splitQuotedSpeech('“Still awake?” A pause. “Heal the leg.”')).toEqual([
            { kind: 'speech', text: 'Still awake?' },
            { kind: 'narration', text: 'A pause.' },
            { kind: 'speech', text: 'Heal the leg.' },
        ]);
        expect(splitQuotedSpeech('"I heard nothing, little fox. Officially."')).toEqual([{ kind: 'speech', text: 'I heard nothing, little fox. Officially.' }]);
        expect(splitQuotedSpeech('"Going." She turns. "Sleep we')).toEqual([
            { kind: 'speech', text: 'Going.' },
            { kind: 'narration', text: 'She turns.' },
            { kind: 'speech', text: 'Sleep we' },
        ]);
    });

    it('leaves a line that does not open with a quote, and drops punctuation between two quotes', () => {
        expect(splitQuotedSpeech('She told me, "Wear them," and I did.')).toBeNull();
        expect(splitQuotedSpeech('Doomed is just his word for "about to learn something."')).toBeNull();
        expect(splitQuotedSpeech('"Wait—" — "No."')).toEqual([{ kind: 'speech', text: 'Wait— No.' }]);
    });

    it('leaves a line whose text between quotes is the Character still talking, as seen on live', () => {
        expect(splitQuotedSpeech('"Can\'t give you both." Listen to you. Four days ago you couldn\'t say "tail" without staring at your shoes.', 'Nara')).toBeNull();
        expect(splitQuotedSpeech('"First wife\'s decision." You put that exactly where it belongs.', 'Nara')).toBeNull();
        expect(splitQuotedSpeech('"IT\'S HUGE"! He said — Nara — he said it to your *face* —', 'Dulcie')).toBeNull();
    });

    it('takes narration that opens with the speaker’s name as narration', () => {
        expect(splitQuotedSpeech('"Moonfox." Ines turns. "Sleep."', 'Ines Varro')).toEqual([
            { kind: 'speech', text: 'Moonfox.' },
            { kind: 'narration', text: 'Ines turns.' },
            { kind: 'speech', text: 'Sleep.' },
        ]);
    });
});

describe('Speech written as prose: the parser and the history (pure)', () => {
    it('splits a reply’s prose speech lines, keeping the speaker, and merges narration that ends up side by side', () => {
        const reply = [
            'Tamsin stops at the fence line.',
            '',
            '@Tamsin Valmont: "Going, going." She leans on the fence post. "Sleep well, Rin."',
            '@Ines Varro: "Shout if the roots win." She tips two fingers off her sheath.',
            '',
            'The valley goes quiet.',
        ].join('\n');
        expect(parseReply(reply, CAST, 'Rin').parts).toEqual([
            { kind: 'narration', text: 'Tamsin stops at the fence line.' },
            { kind: 'speech', characterId: 1, speakerName: 'Tamsin Valmont', text: 'Going, going.' },
            { kind: 'narration', text: 'She leans on the fence post.' },
            { kind: 'speech', characterId: 1, speakerName: 'Tamsin Valmont', text: 'Sleep well, Rin.' },
            { kind: 'speech', characterId: 2, speakerName: 'Ines Varro', text: 'Shout if the roots win.' },
            { kind: 'narration', text: 'She tips two fingers off her sheath.\n\nThe valley goes quiet.' },
        ]);
    });

    it('leaves a plain speech line, and one that only quotes someone, as written', () => {
        const reply = '@Ines Varro: Doomed is just his word for "about to learn something."\n@Tamsin Valmont: Fine.';
        expect(parseReply(reply, CAST, 'Rin').parts).toEqual([
            { kind: 'speech', characterId: 2, speakerName: 'Ines Varro', text: 'Doomed is just his word for "about to learn something."' },
            { kind: 'speech', characterId: 1, speakerName: 'Tamsin Valmont', text: 'Fine.' },
        ]);
    });

    it('gives a stored prose speech line to the history split, so it no longer teaches the habit', () => {
        expect(
            historyPartsText([
                { kind: 'speech', characterId: 2, speakerName: 'Ines Varro', text: '"Still awake?" A pause, and the drawl softens. "Heal the leg."' },
                { kind: 'narration', text: 'The fire gutters.' },
            ]),
        ).toBe('@Ines Varro: Still awake?\n\nA pause, and the drawl softens.\n\n@Ines Varro: Heal the leg.\n\nThe fire gutters.');
    });
});

describe('Speech written as prose: the turn (HTTP)', () => {
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

    it('stores a prose speech line as speech and narration, and tells the model to keep narration out of speech', async () => {
        const created = await t.http.post('/api/stories').send({ title: 'The Valley' }).expect(201);
        const storyId = created.body.id as number;
        await t.http.patch(`/api/stories/${storyId}`).send({ setting: 'A quiet valley.', opening: 'The moon is up.' }).expect(200);
        await t.http.patch(`/api/stories/${storyId}/role`).send({ name: 'Rin', description: 'A fox.' }).expect(200);
        await t.http.post(`/api/stories/${storyId}/characters`).send({ name: 'Ines Varro', appearance: 'Tall.', personality: 'Dry.', voice: 'Drawls.' }).expect(201);
        const chat = (await t.http.post(`/api/stories/${storyId}/chats`).expect(201)).body;

        t.gateway.scriptText('turn', { text: '@Ines Varro: "Still awake, little fox?" A pause by the fence. "Heal the leg."', model: 'glm-5.3' });
        t.gateway.scriptText('judge', JSON.stringify({ bond_changes: [], arc_steps: [], scene: { move_on: false, reason: 'not yet' } }));
        t.gateway.scriptText('memory_extraction', '{"operations":[]}');
        await t.http.post(`/api/stories/${storyId}/chats/${chat.id}/messages`).send({ text: 'Ow.' }).expect(201);

        const reply = (await t.http.get(`/api/stories/${storyId}/chats/${chat.id}`).expect(200)).body.messages.at(-1);
        const parts = reply.parts.map((part: { kind: string; speakerName?: string; text: string }) => [part.kind, part.text]);
        expect(parts).toEqual([
            ['speech', 'Still awake, little fox?'],
            ['narration', 'A pause by the fence.'],
            ['speech', 'Heal the leg.'],
        ]);
        const turn = t.gateway.textCalls('turn').at(-1)!;
        expect(turn.messages[0].content).toContain('- A speech line holds only what the Character says aloud, with no quotation marks around it.');
        expect(turn.messages.at(-1)!.content).toContain('spoken words only, with no quotation marks: no parentheses, *(stage directions)* or narration inside them');
    });
});

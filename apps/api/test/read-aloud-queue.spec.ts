import { readAloudQueue, ReadAloudVoices } from '../src/manager/read-aloud/read-aloud-queue.js';
import type { MessagePartResponse } from '../src/model/chat/entities/message-part.entity.js';

const voices: ReadAloudVoices = { narration: 'bm_george', byCharacterId: new Map([[1, 'bf_emma'], [2, null]]) };

const narration = (text: string): MessagePartResponse => ({ kind: 'narration', text });
const speech = (characterId: number | null, text: string, speakerName = 'Mira'): MessagePartResponse => ({
    kind: 'speech',
    characterId,
    speakerName,
    text,
});

// .scratch/read-aloud/spec.md, "The play queue".
describe('readAloudQueue', () => {
    it('reads narration one paragraph per item, in the Narration voice, with each paragraph index', () => {
        const queue = readAloudQueue([narration('The lamp went out.\n\nThe sea kept talking.\n  \n\nRain.')], voices);

        expect(queue).toEqual([
            { index: 0, partIndex: 0, paragraph: 0, voice: 'bm_george', text: 'The lamp went out.' },
            { index: 1, partIndex: 0, paragraph: 1, voice: 'bm_george', text: 'The sea kept talking.' },
            { index: 2, partIndex: 0, paragraph: 2, voice: 'bm_george', text: 'Rain.' },
        ]);
    });

    it("reads a line in its speaker's Speaking voice, and its *actions* in the Narration voice", () => {
        const queue = readAloudQueue(
            [narration('Wind.'), speech(1, '*smiles* You came back. *sets the lamp down* Sit.')],
            voices,
        );

        expect(queue).toEqual([
            { index: 0, partIndex: 0, paragraph: 0, voice: 'bm_george', text: 'Wind.' },
            { index: 1, partIndex: 1, paragraph: null, voice: 'bm_george', text: 'smiles' },
            { index: 2, partIndex: 1, paragraph: null, voice: 'bf_emma', text: 'You came back.' },
            { index: 3, partIndex: 1, paragraph: null, voice: 'bm_george', text: 'sets the lamp down' },
            { index: 4, partIndex: 1, paragraph: null, voice: 'bf_emma', text: 'Sit.' },
        ]);
    });

    it.each([
        ['a Character with no Speaking voice', 2],
        ['a line with no Character link', null],
        ['a Character who has been removed', 99],
    ])('reads %s in the Narration voice', (_case, characterId) => {
        const [item] = readAloudQueue([speech(characterId, 'Boots off, keeper.')], voices);

        expect(item).toMatchObject({ voice: 'bm_george', text: 'Boots off, keeper.' });
    });

    it('drops items with no letter or digit, keeping the indexes in order', () => {
        const queue = readAloudQueue(
            [narration('…\n\nShe waits.'), speech(1, '*…* — ! *nods*'), speech(1, '...'), narration('42.')],
            voices,
        );

        expect(queue.map(({ index, partIndex, paragraph, text }) => ({ index, partIndex, paragraph, text }))).toEqual([
            { index: 0, partIndex: 0, paragraph: 1, text: 'She waits.' },
            { index: 1, partIndex: 1, paragraph: null, text: 'nods' },
            { index: 2, partIndex: 3, paragraph: 0, text: '42.' },
        ]);
    });

    it('reads Thai and other letters as letters', () => {
        expect(readAloudQueue([narration('ฝนตก')], voices)).toHaveLength(1);
    });

    it('splits an item over 4,000 characters at the last sentence end before the limit', () => {
        const sentence = 'The sea kept talking. ';
        const long = sentence.repeat(200).trim(); // 4,399 characters
        const queue = readAloudQueue([narration(long)], voices);

        expect(queue.length).toBe(2);
        expect(queue.every((item) => item.text.length <= 4000)).toBe(true);
        expect(queue[0].text.endsWith('talking.')).toBe(true);
        expect(queue[1].text.startsWith('The sea')).toBe(true);
        expect(`${queue[0].text} ${queue[1].text}`).toBe(long);
        expect(queue.map((item) => [item.index, item.partIndex, item.paragraph])).toEqual([
            [0, 0, 0],
            [1, 0, 0],
        ]);
    });

    it('splits at the last space when there is no sentence end before the limit', () => {
        const long = 'wave '.repeat(1000).trim(); // 4,999 characters, no sentence end
        const queue = readAloudQueue([speech(1, long)], voices);

        expect(queue.length).toBe(2);
        expect(queue[0].text.length).toBeLessThanOrEqual(4000);
        expect(queue[0].text.endsWith('wave')).toBe(true);
        expect(`${queue[0].text} ${queue[1].text}`).toBe(long);
        expect(queue.every((item) => item.voice === 'bf_emma')).toBe(true);
    });

    it('cuts a run with no space at the limit', () => {
        const long = 'a'.repeat(9000);
        const queue = readAloudQueue([narration(long)], voices);

        expect(queue.map((item) => item.text.length)).toEqual([4000, 4000, 1000]);
    });

    it('has no items for a Message with no parts', () => {
        expect(readAloudQueue([], voices)).toEqual([]);
    });
});

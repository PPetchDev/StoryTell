import { parseReply } from '../src/manager/chat/turn/reply-parser.js';

/**
 * A speaker's name alone on its line (.scratch/prompt-evals/spec.md, "First real run of the
 * upgraded set"): GLM-5.3 wrote `@Mira:`, a blank line, then her words, four times in one reply.
 * The name with nothing after it was dropped as an empty speech line and her words became
 * narration, so in a Chat she said nothing and the Narrator spoke her lines.
 */

const CAST = [
    { id: 1, name: 'Mira Vance' },
    { id: 2, name: 'Tobias Hale' },
];

const mira = (text: string) => ({ kind: 'speech', characterId: 1, speakerName: 'Mira Vance', text });
const narration = (text: string) => ({ kind: 'narration', text });

describe('A speaker’s name alone on its line: the reply parser (pure)', () => {
    it('gives the paragraph after the blank line to that speaker, and the one after it back to the narration, as the real reply was written', () => {
        const reply = [
            'She looked at the bag, then at him, and leaned against the doorframe.',
            '@Mira:',
            'Too much for one person. That’s a strange problem to bring to my door.',
            'She didn’t move out of the way, but she didn’t shut the door either.',
            '@Mira:',
            'Let me guess. Two of those sticky almond things.',
        ].join('\n\n');

        expect(parseReply(reply, CAST, 'Ash').parts).toEqual([
            narration('She looked at the bag, then at him, and leaned against the doorframe.'),
            mira('Too much for one person. That’s a strange problem to bring to my door.'),
            narration('She didn’t move out of the way, but she didn’t shut the door either.'),
            mira('Let me guess. Two of those sticky almond things.'),
        ]);
    });

    it('takes the lines right under those words as the same speech', () => {
        const reply = '@Mira Vance:\n\nBoots off.\nAnd sit where I can see you.\n\nShe was already turning toward the kitchen.';

        expect(parseReply(reply, CAST, 'Ash').parts).toEqual([mira('Boots off.\nAnd sit where I can see you.'), narration('She was already turning toward the kitchen.')]);
    });

    it('reads words right under the name, with no blank line, as it always has', () => {
        expect(parseReply('@Mira Vance:\nBoots off.', CAST, 'Ash').parts).toEqual([mira('Boots off.')]);
    });

    it('drops a name with no words after it: another speaker follows, or the reply ends', () => {
        const parsed = parseReply('@Mira Vance:\n\n@Tobias Hale: I would not presume to say.\n\n@Mira Vance:', CAST, 'Ash');

        expect(parsed.parts).toEqual([{ kind: 'speech', characterId: 2, speakerName: 'Tobias Hale', text: 'I would not presume to say.' }]);
    });

    it('leaves a speech line that has its words on it as it was: the paragraph after a blank line is narration', () => {
        expect(parseReply('@Mira Vance: Boots off.\n\nShe held the door wide.', CAST, 'Ash').parts).toEqual([mira('Boots off.'), narration('She held the door wide.')]);
    });

    it('drops the words of a Character sitting out whose name stood alone, and keeps the narration after them', () => {
        const reply = '@Tobias Hale:\n\nI would not presume to say.\nThough I have my view.\n\nMira laughed.\n\n@Mira Vance: He says that every week.';

        const parsed = parseReply(reply, CAST, 'Ash', { sittingOut: [2] });

        expect(parsed.parts).toEqual([narration('Mira laughed.'), mira('He says that every week.')]);
        expect(parsed.droppedSpeakers).toEqual(['Tobias Hale']);
    });

    it('still cuts the reply at the worn identity’s name alone on a line', () => {
        const parsed = parseReply('@Mira Vance: Well?\n\n@Ash:\n\nI came to ask you out.', CAST, 'Ash');

        expect(parsed.parts).toEqual([mira('Well?')]);
        expect(parsed.cutAtUserLine).toBe(true);
    });
});

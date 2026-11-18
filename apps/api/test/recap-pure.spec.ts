import {
    newestThatFit,
    parseRecap,
    RECAP_GAP_MS,
    recapDue,
    recapFingerprint,
    recapPromptMessages,
    RecapPromptInput,
    recapRejection,
    tailThatFits,
} from '../src/manager/recap/recap.js';

// "Previously on…" (.scratch/previously-on/spec.md), the pure parts.

const NOW = new Date('2026-11-18T12:00:00Z');
const at = (msAgo: number) => new Date(NOW.getTime() - msAgo);

const INPUT: RecapPromptInput = {
    storyTitle: 'The Steppe',
    identityName: 'Ash',
    identityDescription: 'A trader passing through.',
    castNames: ['Nara', 'Temur'],
    storySoFar: 'Ash arrived at the camp at dusk.',
    chapters: [{ sceneName: "Mare's milk", summary: 'Ash drank the milk.' }],
    sceneName: 'The guest tent',
    moment: 'Night, the guest tent',
    bonds: [{ fromName: 'Nara', towardName: 'Ash', label: 'Wary warmth', description: 'Likes Ash.' }],
    nowNotes: [{ name: 'Nara', note: 'Calls Ash "milk-thief".' }],
    messages: [
        { speaker: 'Story', text: 'Smoke curls.' },
        { speaker: 'Ash', text: 'I sip the milk.' },
    ],
};

describe('"Previously on…": when it is due', () => {
    it('needs six hours since the newest Message', () => {
        expect(recapDue({ newestAt: at(RECAP_GAP_MS - 1), messageCount: 3, stored: null, now: NOW })).toBe(false);
        expect(recapDue({ newestAt: at(RECAP_GAP_MS), messageCount: 3, stored: null, now: NOW })).toBe(true);
    });

    it('needs a Message after the Opening', () => {
        expect(recapDue({ newestAt: at(RECAP_GAP_MS * 10), messageCount: 1, stored: null, now: NOW })).toBe(false);
        expect(recapDue({ newestAt: at(RECAP_GAP_MS * 10), messageCount: 2, stored: null, now: NOW })).toBe(true);
    });

    it('stops once the Recap for the newest Message is dismissed', () => {
        expect(recapDue({ newestAt: at(RECAP_GAP_MS * 2), messageCount: 3, stored: { dismissed: false }, now: NOW })).toBe(true);
        expect(recapDue({ newestAt: at(RECAP_GAP_MS * 2), messageCount: 3, stored: { dismissed: true }, now: NOW })).toBe(false);
    });
});

describe('"Previously on…": the fingerprint', () => {
    it('changes with the text and the kind', () => {
        expect(recapFingerprint('ai', 'Hm.')).toBe(recapFingerprint('ai', 'Hm.'));
        expect(recapFingerprint('ai', 'Hm.')).not.toBe(recapFingerprint('ai', 'Hm!'));
        expect(recapFingerprint('ai', 'Hm.')).not.toBe(recapFingerprint('user', 'Hm.'));
    });
});

describe('"Previously on…": the prompt', () => {
    it('holds the Story so far, Chapters, Scene name, Bonds, Now notes and newest Messages', () => {
        const [system, user] = recapPromptMessages(INPUT);
        expect(system.content).toContain('3 to 5 sentences, 50 to 110 words');
        expect(system.content).toContain('never guess Ash\'s gender');
        expect(system.content).toContain('Everyone in the story is an adult');
        expect(system.content).toContain('The characters are: Nara, Temur.');
        expect(user.content).toContain('The story so far, from the beginning:\nAsh arrived at the camp at dusk.');
        expect(user.content).toContain("- Mare's milk: Ash drank the milk.");
        expect(user.content).toContain('Scene: The guest tent\nIt is now: Night, the guest tent');
        expect(user.content).toContain('- Nara toward Ash: "Wary warmth" — Likes Ash.');
        expect(user.content).toContain('- Nara: Calls Ash "milk-thief".');
        expect(user.content).toContain('[Story]\nSmoke curls.\n\n[Ash]\nI sip the milk.');
        expect(user.content.trim().endsWith('Write the recap now.')).toBe(true);
    });

    it('leaves out what it has none of', () => {
        const [, user] = recapPromptMessages({ ...INPUT, storySoFar: null, chapters: [], sceneName: null, moment: null, bonds: [], nowNotes: [] });
        expect(user.content).not.toContain('The story so far');
        expect(user.content).not.toContain('chapters');
        expect(user.content).not.toContain('Scene:');
        expect(user.content).not.toContain('How the characters feel');
        expect(user.content).not.toContain('lastingly changed');
    });

    it('keeps the newest Messages that fit, the newest always', () => {
        const long = 'x'.repeat(400);
        const messages = Array.from({ length: 10 }, (_, index) => ({ speaker: 'Story', text: `${index}${long}` }));
        const { kept, cut } = newestThatFit(messages, 300);
        expect(cut).toBe(true);
        expect(kept.at(-1)!.text.startsWith('9')).toBe(true);
        expect(kept.length).toBeLessThan(10);
        expect(newestThatFit([{ speaker: 'Story', text: 'y'.repeat(10_000) }], 10).kept).toHaveLength(1);
    });

    it('reads the end of a long Story so far', () => {
        const text = `${'Early days. '.repeat(1_000)}The raid came at dawn.`;
        const tail = tailThatFits(text, 50);
        expect(tail.length).toBeLessThanOrEqual(201);
        expect(tail.endsWith('The raid came at dawn.')).toBe(true);
        expect(tailThatFits('Short.', 50)).toBe('Short.');
    });
});

describe('"Previously on…": reading the answer', () => {
    it('drops a label, a heading and wrapping quotes', () => {
        expect(parseRecap('Previously on…: Ash came.')).toBe('Ash came.');
        expect(parseRecap('Previously on... Ash came.')).toBe('Ash came.');
        expect(parseRecap('**Recap:** Ash came.')).toBe('Ash came.');
        expect(parseRecap('# Recap: Ash came.')).toBe('Ash came.');
        expect(parseRecap('"Ash came."')).toBe('Ash came.');
        expect(parseRecap('  ')).toBeNull();
    });

    it('rejects an answer cut off at the cap, or one that goes on with the story', () => {
        expect(recapRejection('Ash came.', 400, ['Story', 'Ash'])).toMatch(/cut off/);
        expect(recapRejection('[Story]\nMore smoke.', 20, ['Story', 'Ash'])).toMatch(/went on with the story/);
        expect(recapRejection('Ash came. [Nara] smiled.', 20, ['Story', 'Ash'])).toBeNull();
    });
});

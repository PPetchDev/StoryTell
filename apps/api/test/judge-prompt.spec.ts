import { buildJudgePrompt, JudgePromptInput } from '../src/manager/chat/judge/judge-prompt.js';

function input(overrides: Partial<JudgePromptInput> = {}): JudgePromptInput {
    return {
        cast: [{ name: 'Tavri', personality: 'Shy.', arcDirection: '' }],
        identityName: 'Petch',
        bonds: [],
        arcs: [{ name: 'Tavri', steps: [] }],
        scene: { name: 'A Name Said Like That', moveOnCondition: 'Tavri tells the truth in her own words to someone she chose.' },
        recent: [],
        userText: 'I wait.',
        aiText: '@Tavri: I could tell you. The real answer.',
        ...overrides,
    };
}

// Seen in play on 2026-11-08: a Scene moved on when a Character only said she could do what the
// condition asked, and another when someone else revealed what the user was meant to tell.
describe('Judge prompt: the Scene rule', () => {
    it('counts a move-on condition only once it has fully happened, by the one it names, every part of it', () => {
        const system = buildJudgePrompt(input()).messages[0].content;
        expect(system).toContain('met means it has fully HAPPENED in the story by the end of the latest exchange');
        expect(system).toContain('Not met: getting closer, someone about to do it, saying they could or will do it, agreeing to do it later');
        expect(system).toContain('only that one doing it counts. Someone else revealing or doing it instead does not.');
        expect(system).toContain('every part must have happened');
        expect(system).toContain('When in doubt, move_on is false. A Scene is meant to last many exchanges.');
        // The reason comes before the verdict, so the model reasons first and decides from it.
        expect(system).toContain('Write the reason first, saying what has and has not happened yet, then decide move_on from it.');
        expect(system).toContain('"scene":{"reason":"...","move_on":false}');
    });

    it('still shows the current Scene and its condition to judge', () => {
        const user = buildJudgePrompt(input()).messages[1].content;
        expect(user).toContain('A Name Said Like That. Move-on condition: Tavri tells the truth in her own words to someone she chose.');
    });
});

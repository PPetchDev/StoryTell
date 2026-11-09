import { JudgePromptInput } from '../src/manager/chat/judge/judge-prompt.js';

/**
 * Judge prompt inputs whose prompts were recorded before Expressions
 * (test/fixtures/judge/prompts-before-expressions.json), so a Story without Expressions can be
 * shown to send exactly the prompt it sent before (.scratch/expressions/spec.md).
 */
export const JUDGE_FIXTURE_INPUTS: JudgePromptInput[] = [
    {
        cast: [
            { name: 'Mira', personality: 'Guarded and dry.', arcDirection: 'If trusted, her coldness thaws.' },
            { name: 'Kai', personality: 'Cheerful, nosy.', arcDirection: '', sittingOut: true },
        ],
        identityName: 'Ash',
        bonds: [{ fromName: 'Mira', toName: null, label: 'Wary', description: 'She expects Ash to leave by spring.' }],
        arcs: [
            { name: 'Mira', steps: ['Lets Ash carry the oil.'] },
            { name: 'Kai', steps: [] },
        ],
        scene: { name: 'Arrival', moveOnCondition: 'Mira lets Ash up the stairs.' },
        timeOfDay: 'evening',
        recent: ['Ash: I knock.', '@Mira: You are late.'],
        userText: 'I set my boots by the door.',
        aiText: 'Mira watches the boots.\n\n@Mira: Better.\n\n@Kai: She means thank you.',
    },
    {
        cast: [{ name: 'Mira', personality: 'Guarded.', arcDirection: '' }],
        identityName: 'Ash',
        bonds: [],
        arcs: [{ name: 'Mira', steps: [] }],
        scene: null,
        recent: [],
        userText: null,
        aiText: 'The lamp hums.',
    },
];

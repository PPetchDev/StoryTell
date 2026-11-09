import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { emotionsOfParts } from '../src/manager/chat/judge/apply-judgement.js';
import { buildJudgePrompt, JUDGE_MAX_TOKENS, parseJudgement } from '../src/manager/chat/judge/judge-prompt.js';
import { JUDGE_FIXTURE_INPUTS } from './judge-prompt-inputs.js';

const RECORDED = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/judge/prompts-before-expressions.json');

const PARTS = [
    { kind: 'narration' as const, text: 'Mira watches the boots.' },
    { kind: 'speech' as const, characterId: 1, speakerName: 'Mira', text: 'Better.' },
    { kind: 'narration' as const, text: 'Kai laughs.' },
    { kind: 'speech' as const, characterId: 2, speakerName: 'Kai', text: 'She means thank you.' },
    { kind: 'speech' as const, characterId: 1, speakerName: 'Mira', text: 'I do not.' },
];

// .scratch/expressions/issues/03-judge-tags-emotions.md
describe('The judge tags emotions only when the Story has an Expression', () => {
    it('without Expressions, sends byte for byte the prompt it sent before Expressions, with the same token cap', () => {
        const recorded = JSON.parse(readFileSync(RECORDED, 'utf8')) as unknown[];
        expect(JUDGE_FIXTURE_INPUTS.map((input) => buildJudgePrompt(input))).toEqual(recorded);
        expect(buildJudgePrompt(JUDGE_FIXTURE_INPUTS[0]).maxTokens).toBe(JUDGE_MAX_TOKENS);
    });

    it('with Expressions, numbers the speech lines of the latest exchange only, and leaves narration and context as they were', () => {
        const prompt = buildJudgePrompt({ ...JUDGE_FIXTURE_INPUTS[0], expressionParts: PARTS });
        const user = prompt.messages[1].content;

        const latest = user.slice(user.indexOf('# LATEST EXCHANGE'));
        expect(latest).toContain(
            'Mira watches the boots.\n\n[1] @Mira: Better.\n\nKai laughs.\n\n[2] @Kai: She means thank you.\n\n[3] @Mira: I do not.',
        );
        // The context Messages are not numbered.
        expect(user).toContain('# Recent story (context)\nAsh: I knock.\n\n@Mira: You are late.');
        expect(user.slice(0, user.indexOf('# LATEST EXCHANGE'))).not.toContain('[1]');
        // Everything else is as it was.
        const before = buildJudgePrompt(JUDGE_FIXTURE_INPUTS[0]).messages[1].content;
        expect(user.slice(0, user.indexOf('# LATEST EXCHANGE'))).toBe(before.slice(0, before.indexOf('# LATEST EXCHANGE')));
    });

    it('with Expressions, carries the Expression rule with every emotion\'s meaning, the JSON field, and 200 more tokens', () => {
        const prompt = buildJudgePrompt({ ...JUDGE_FIXTURE_INPUTS[0], expressionParts: PARTS });
        const system = prompt.messages[0].content;

        expect(system).toContain('Expression rule:');
        expect(system).toContain('For each numbered line in the latest exchange');
        for (const meaning of [
            '"neutral": calm, plain talk, no strong feeling',
            '"joy": happy, amused, laughing, pleased, excited',
            '"love": tender, affectionate, flirtatious, aroused, longing',
            '"embarrassment": shy, embarrassed, ashamed, awkward',
            '"sadness": sad, hurt, grieving, disappointed',
            '"anger": angry, annoyed, disgusted, contemptuous',
            '"fear": afraid, nervous, anxious',
            '"surprise": surprised, shocked, confused, realising',
        ]) {
            expect(system).toContain(meaning);
        }
        expect(system).toContain('When unsure, "neutral".');
        expect(system).toContain('"expressions":[{"line":1,"emotion":"joy"}]');
        // The rest of the rules are untouched.
        const base = buildJudgePrompt(JUDGE_FIXTURE_INPUTS[0]).messages[0].content;
        expect(system.slice(0, system.indexOf('Expression rule:'))).toBe(base.slice(0, base.indexOf('Reply with JSON only:')));
        expect(prompt.maxTokens).toBe(JUDGE_MAX_TOKENS + 200);
    });
});

describe('Reading the judge\'s emotion tags', () => {
    const judged = (expressions: unknown) =>
        parseJudgement(JSON.stringify({ bond_changes: [], arc_steps: [], scene: { move_on: false, reason: 'no' }, expressions })).expressions;

    it('reads each line and emotion, in any case', () => {
        expect(judged([{ line: 1, emotion: 'joy' }, { line: 2, emotion: 'SADNESS' }, { line: 3, emotion: ' Neutral ' }])).toEqual([
            { line: 1, emotion: 'joy' },
            { line: 2, emotion: 'sadness' },
            { line: 3, emotion: 'neutral' },
        ]);
    });

    it('drops unknown emotions and lines that are not whole numbers', () => {
        expect(
            judged([
                { line: 1, emotion: 'bored' },
                { line: 1.5, emotion: 'joy' },
                { line: '2', emotion: 'joy' },
                { emotion: 'joy' },
                { line: 4 },
                'joy',
                null,
                { line: 5, emotion: 'fear' },
            ]),
        ).toEqual([{ line: 5, emotion: 'fear' }]);
    });

    it('reads a missing or malformed field as no tags', () => {
        expect(parseJudgement('{"bond_changes":[],"arc_steps":[],"scene":null}').expressions).toEqual([]);
        expect(judged('joy')).toEqual([]);
        expect(judged(null)).toEqual([]);
    });
});

describe('Mapping tagged lines to speech parts', () => {
    const parts = [
        { id: 10, kind: 'narration' as const },
        { id: 11, kind: 'speech' as const },
        { id: 12, kind: 'narration' as const },
        { id: 13, kind: 'speech' as const },
        { id: 14, kind: 'speech' as const },
    ];

    it('maps line n to the n-th speech part', () => {
        expect(
            emotionsOfParts(parts, [
                { line: 1, emotion: 'joy' },
                { line: 3, emotion: 'anger' },
                { line: 2, emotion: 'neutral' },
            ]),
        ).toEqual([
            { partId: 11, emotion: 'joy' },
            { partId: 14, emotion: 'anger' },
            { partId: 13, emotion: 'neutral' },
        ]);
    });

    it('drops lines outside 1 to the number of speech parts', () => {
        expect(
            emotionsOfParts(parts, [
                { line: 0, emotion: 'joy' },
                { line: 4, emotion: 'joy' },
                { line: -1, emotion: 'joy' },
                { line: 2, emotion: 'fear' },
            ]),
        ).toEqual([{ partId: 13, emotion: 'fear' }]);
    });

    it('keeps the first tag of a repeated line, and leaves untagged parts out', () => {
        expect(
            emotionsOfParts(parts, [
                { line: 1, emotion: 'love' },
                { line: 1, emotion: 'anger' },
            ]),
        ).toEqual([{ partId: 11, emotion: 'love' }]);
        expect(emotionsOfParts(parts, [])).toEqual([]);
        expect(emotionsOfParts([{ id: 1, kind: 'narration' }], [{ line: 1, emotion: 'joy' }])).toEqual([]);
    });
});

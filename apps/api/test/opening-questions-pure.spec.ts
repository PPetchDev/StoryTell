import { cleanOpeningQuestions, fillPlaceholders, resolveOpeningAnswers } from '../src/manager/story/opening-questions.js';

// .scratch/opening-questions/spec.md: the fill and the answers, without a database.

const QUESTIONS = [
    { key: 'name', question: 'What is your name?', defaultAnswer: 'Ash' },
    { key: 'trade', question: 'What is your trade?', defaultAnswer: 'keeper' },
];

describe('Opening questions: filling placeholders', () => {
    it('fills each asked key with the answer, or the default when there is none', () => {
        expect(fillPlaceholders('{name} the {trade}, {name}.', QUESTIONS, { name: 'Petch', trade: 'herder' })).toBe('Petch the herder, Petch.');
        expect(fillPlaceholders('{name} the {trade}.', QUESTIONS, { name: 'Petch' })).toBe('Petch the keeper.');
        expect(fillPlaceholders('{name} the {trade}.', QUESTIONS, null)).toBe('Ash the keeper.');
    });

    it('leaves every other brace as written, and changes nothing for a Story without questions', () => {
        expect(fillPlaceholders('{user} meets {Name}, { name }, {{name}} and {boat}.', QUESTIONS, { name: 'Petch' })).toBe('{user} meets {Name}, { name }, {Petch} and {boat}.');
        expect(fillPlaceholders('{name} stays.', [], { name: 'Petch' })).toBe('{name} stays.');
        expect(fillPlaceholders('{name} stays.', undefined, undefined)).toBe('{name} stays.');
    });

    it('takes an answer literally, `$` and all', () => {
        expect(fillPlaceholders('{name}', QUESTIONS, { name: "$& $1 Petch's" })).toBe("$& $1 Petch's");
    });
});

describe('Opening questions: answers and rules', () => {
    it('resolves one answer per question, defaults for blank, missing and non-text ones', () => {
        expect(resolveOpeningAnswers(QUESTIONS, { name: ' Petch\n', trade: '  ', boat: 'Gull' })).toEqual({ name: 'Petch', trade: 'keeper' });
        expect(resolveOpeningAnswers(QUESTIONS, { name: 7 })).toEqual({ name: 'Ash', trade: 'keeper' });
        expect(resolveOpeningAnswers(QUESTIONS, undefined)).toEqual({ name: 'Ash', trade: 'keeper' });
        expect(resolveOpeningAnswers([], { name: 'Petch' })).toEqual({});
    });

    it('cleans a good list and names the first rule a bad one breaks', () => {
        expect(cleanOpeningQuestions([{ key: ' NAME ', question: ' Who? ', defaultAnswer: ' Ash ' }])).toEqual([{ key: 'name', question: 'Who?', defaultAnswer: 'Ash' }]);
        expect(cleanOpeningQuestions([{ key: 'user', question: 'Who?', defaultAnswer: 'Ash' }])).toMatch(/\{user\} already means/);
        expect(cleanOpeningQuestions([...QUESTIONS, { ...QUESTIONS[0] }])).toMatch(/two questions use the placeholder \{name\}/);
        expect(cleanOpeningQuestions([{ key: 'name', question: 'Who?', defaultAnswer: '' }])).toMatch(/needs a default answer/);
    });
});

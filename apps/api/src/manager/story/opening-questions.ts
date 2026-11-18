import type { OpeningQuestion } from '../../model/story/entities/story.entity.js';

/**
 * Opening questions (.scratch/opening-questions/spec.md): the rules for a Story's list, and the
 * filling of `{key}` placeholders with one Chat's answers. Pure.
 */

export const MAX_OPENING_QUESTIONS = 8;
export const OPENING_QUESTION_TEXT_MAX = 200;
export const OPENING_ANSWER_MAX = 200;
export const OPENING_QUESTION_KEY = /^[a-z][a-z0-9_]{0,29}$/;
/** Already meaning something: `{user}` in Memories and Beliefs, `{{user}}`/`{{char}}` in cards. */
export const RESERVED_KEYS: ReadonlySet<string> = new Set(['user', 'char']);

/** One Chat's answers, by key. */
export type OpeningAnswers = Record<string, string>;

/** The list as it will be stored, trimmed and lower-cased; a reason string when a rule is broken. */
export function cleanOpeningQuestions(questions: OpeningQuestion[]): OpeningQuestion[] | string {
    if (questions.length > MAX_OPENING_QUESTIONS) return `a Story can ask at most ${MAX_OPENING_QUESTIONS} Opening questions.`;
    const cleaned = questions.map((question) => ({
        key: question.key.trim().toLowerCase(),
        question: question.question.trim(),
        defaultAnswer: oneLine(question.defaultAnswer),
    }));
    const seen = new Set<string>();
    for (const [index, question] of cleaned.entries()) {
        const which = `question ${index + 1}`;
        if (!OPENING_QUESTION_KEY.test(question.key)) {
            return `${which}'s placeholder must start with a letter and use only a–z, 0–9 and _ (at most 30).`;
        }
        if (RESERVED_KEYS.has(question.key)) return `{${question.key}} already means something else; choose another placeholder.`;
        if (seen.has(question.key)) return `two questions use the placeholder {${question.key}}.`;
        seen.add(question.key);
        if (question.question === '') return `${which} needs the question.`;
        if (question.defaultAnswer === '') return `${which} needs a default answer.`;
        if (question.question.length > OPENING_QUESTION_TEXT_MAX || question.defaultAnswer.length > OPENING_QUESTION_TEXT_MAX) {
            return `${which} is longer than ${OPENING_QUESTION_TEXT_MAX} characters.`;
        }
    }
    return cleaned;
}

/** Trimmed, with every run of whitespace (line breaks too) one space. */
function oneLine(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
}

/**
 * One answer per question: the given one, on one line and cut to `OPENING_ANSWER_MAX`, or the
 * default when it is missing or blank. Answers to keys the Story doesn't ask are dropped.
 */
export function resolveOpeningAnswers(questions: OpeningQuestion[], given: Record<string, unknown> | null | undefined): OpeningAnswers {
    const answers: OpeningAnswers = {};
    for (const question of questions) {
        const raw = given?.[question.key];
        const answer = typeof raw === 'string' ? oneLine(raw).slice(0, OPENING_ANSWER_MAX) : '';
        answers[question.key] = answer === '' ? question.defaultAnswer : answer;
    }
    return answers;
}

/**
 * The text with each `{key}` of the Story's questions replaced by the Chat's answer, or the
 * question's default when the Chat has none for it. Any other `{…}` stays as written, and a
 * Story with no questions gives the text back unchanged.
 */
export function fillPlaceholders(text: string, questions: OpeningQuestion[] | null | undefined, answers: OpeningAnswers | null | undefined): string {
    if (!questions || questions.length === 0) return text;
    const byKey = new Map(questions.map((question) => [question.key, answers?.[question.key] ?? question.defaultAnswer]));
    return text.replace(/\{([a-z][a-z0-9_]*)\}/g, (whole, key: string) => byKey.get(key) ?? whole);
}

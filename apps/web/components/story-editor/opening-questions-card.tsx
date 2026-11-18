'use client';

import { useRef } from 'react';

import { OpeningQuestion } from '@/lib/story';
import { ADD_BUTTON_IN_CARD } from './add-button';
import { TextField } from './fields';
import { FoldingCard, NOTE } from './folding-card';
import { UndoNotice, useUndo } from './undo-notice';

/** The most a Story asks; the API refuses more. */
export const MAX_OPENING_QUESTIONS = 8;
const KEY_PATTERN = /^[a-z][a-z0-9_]{0,29}$/;
const RESERVED = new Set(['user', 'char']);

/** A placeholder key as typed: lower case, spaces as `_`, anything else left out, 30 at most. */
export function keyFromTyping(text: string): string {
    return text
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_]/g, '')
        .slice(0, 30);
}

/** Why a question's placeholder can't be saved yet, or null when it can. `earlier` holds the keys above it. */
export function keyProblem(key: string, earlier: readonly string[]): string | null {
    if (key === '') return 'Give it a placeholder to save it.';
    if (!KEY_PATTERN.test(key)) return 'A placeholder starts with a letter.';
    if (RESERVED.has(key)) return `{${key}} already means something else. Choose another.`;
    if (earlier.includes(key)) return `Another question already uses {${key}}.`;
    return null;
}

/** The questions the API will take: placeholder, question and default all good, in order. */
export function savableQuestions(questions: readonly OpeningQuestion[]): OpeningQuestion[] {
    const kept: OpeningQuestion[] = [];
    for (const question of questions) {
        if (keyProblem(question.key, kept.map((other) => other.key)) !== null) continue;
        if (question.question.trim() === '' || question.defaultAnswer.trim() === '') continue;
        kept.push(question);
    }
    return kept;
}

interface OpeningQuestionsCardProps {
    /** In the author's order, those still being written included. */
    questions: OpeningQuestion[];
    /** The Opening and the Role's Name and Description, to say which placeholders aren't used yet. */
    texts: string[];
    /** The list as it now reads; the editor saves the ones that are whole. */
    onChange(questions: OpeningQuestion[]): void;
}

/**
 * The Story's Opening questions, on the Story tab under the Opening (.scratch/opening-questions/spec.md):
 * what the user is asked when a Chat starts. Each answer fills `{key}` in the Opening and the Role;
 * skipping takes the default. A question is saved once its placeholder, question and default are whole.
 */
export function OpeningQuestionsCard({ questions, texts, onChange }: OpeningQuestionsCardProps) {
    const list = useRef<HTMLDivElement>(null);
    const undo = useUndo();
    const change = (index: number, fields: Partial<OpeningQuestion>) =>
        onChange(questions.map((question, at) => (at === index ? { ...question, ...fields } : question)));
    const move = (index: number, by: -1 | 1) => {
        const next = [...questions];
        [next[index], next[index + by]] = [next[index + by], next[index]];
        onChange(next);
        // Focus follows the question to its new place.
        requestAnimationFrame(() => {
            const at = index + by + 1;
            const button = (way: string) => list.current?.querySelector<HTMLButtonElement>(`[aria-label="Move question ${at} ${way}"]`);
            const same = button(by < 0 ? 'up' : 'down');
            (same && !same.disabled ? same : button(by < 0 ? 'down' : 'up'))?.focus();
        });
    };
    /** One tap removes a question; Undo puts the list back as it was. */
    const remove = (index: number) => {
        const before = questions;
        onChange(questions.filter((_, at) => at !== index));
        undo.offer({
            message: `Removed question ${index + 1}.`,
            undo: () => onChange(before),
            focusAfterUndo: () => list.current?.querySelector<HTMLElement>(`[aria-label="Remove question ${index + 1}"]`),
        });
    };
    const written = texts.join('\n');

    return (
        <FoldingCard foldKey="opening-questions" label="Opening questions" fieldPrefixes={[]} title="Opening questions">
            <p className={NOTE}>
                Optional. Asked when a Chat starts, like “What is your name?”. Write the placeholder, such as {'{name}'}, in the Opening or the Role,
                and each Chat fills in its answer. Skipping uses the default.
            </p>
            <div ref={list}>
                {questions.map((question, index) => {
                    const problem = keyProblem(question.key, questions.slice(0, index).map((other) => other.key));
                    const unused = problem === null && !written.includes(`{${question.key}}`);
                    return (
                        <div
                            className="mt-4 border-t border-line pt-4 first:mt-0 first:border-t-0 first:pt-0"
                            key={index}
                            role="group"
                            aria-label={`Question ${index + 1}`}
                        >
                            <div className="mb-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                                <span className="text-md font-semibold text-muted">Question {index + 1}</span>
                                <span className="flex flex-wrap gap-1">
                                    <button
                                        type="button"
                                        className="button button-quiet button-small"
                                        aria-label={`Move question ${index + 1} up`}
                                        data-move="up"
                                        disabled={index === 0}
                                        onClick={() => move(index, -1)}
                                    >
                                        Up
                                    </button>
                                    <button
                                        type="button"
                                        className="button button-quiet button-small"
                                        aria-label={`Move question ${index + 1} down`}
                                        data-move="down"
                                        disabled={index === questions.length - 1}
                                        onClick={() => move(index, 1)}
                                    >
                                        Down
                                    </button>
                                    <button
                                        type="button"
                                        className="button button-quiet button-small"
                                        aria-label={`Remove question ${index + 1}`}
                                        onClick={() => remove(index)}
                                    >
                                        Remove
                                    </button>
                                </span>
                            </div>
                            <TextField
                                label="Question"
                                value={question.question}
                                placeholder="e.g. What is your name?"
                                hint={question.question.trim() === '' ? 'What the user is asked. Write it to save the question.' : undefined}
                                onChange={(text) => change(index, { question: text })}
                            />
                            <TextField
                                label="Placeholder"
                                value={question.key}
                                placeholder="e.g. name"
                                autoCapitalize="none"
                                spellCheck={false}
                                autoComplete="off"
                                error={question.key === '' ? null : problem}
                                hint={
                                    question.key === ''
                                        ? 'Give it a placeholder to save it: a–z, 0–9 and _.'
                                        : problem
                                          ? undefined
                                          : unused
                                            ? `Write {${question.key}} in the Opening or the Role. Neither uses it yet.`
                                            : `Write {${question.key}} where the answer goes.`
                                }
                                onChange={(text) => change(index, { key: keyFromTyping(text) })}
                            />
                            <TextField
                                label="Default answer"
                                value={question.defaultAnswer}
                                placeholder="e.g. Ash"
                                hint={question.defaultAnswer.trim() === '' ? 'Used when the question is skipped. Write it to save the question.' : 'Used when the question is skipped.'}
                                onChange={(text) => change(index, { defaultAnswer: text })}
                            />
                        </div>
                    );
                })}
            </div>
            <UndoNotice undo={undo} />
            {questions.length < MAX_OPENING_QUESTIONS ? (
                <button type="button" className={ADD_BUTTON_IN_CARD} onClick={() => onChange([...questions, { key: '', question: '', defaultAnswer: '' }])}>
                    Add question
                </button>
            ) : (
                <p className={NOTE}>A Story can ask {MAX_OPENING_QUESTIONS} questions at most.</p>
            )}
        </FoldingCard>
    );
}

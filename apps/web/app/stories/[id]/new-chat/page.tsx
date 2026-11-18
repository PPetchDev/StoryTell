'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, use, useState } from 'react';

import { useApiQuery, useConnection } from '@/components/connection';
import { ArrowLeftIcon } from '@/components/icons';
import { ErrorState, Loading } from '@/components/query-state';
import { FIELD, FIELD_HINT, FIELD_INPUT, FIELD_LABEL } from '@/components/story-editor/fields';
import { ApiError, ApiUnreachableError } from '@/lib/api';
import { chatApi } from '@/lib/chat';
import { Story, storyTitle } from '@/lib/story';

/** The most an answer keeps; the API cuts longer ones. */
const ANSWER_MAX = 200;

/**
 * Starting a Chat of a Story that asks Opening questions (.scratch/opening-questions/spec.md): one
 * box per question, empty, with its default under it. Start sends what was typed, a blank box taking
 * its default; Skip sends nothing, so every question takes its default. One column, for a 320px phone.
 */
export default function NewChatPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const storyId = Number(id);
    const router = useRouter();
    const { reportUnreachable } = useConnection();
    const story = useApiQuery<Story>(`/stories/${id}`);
    const [answers, setAnswers] = useState<Record<string, string>>({});
    const [starting, setStarting] = useState<'answers' | 'skip' | null>(null);
    const [error, setError] = useState<string | null>(null);

    const start = async (kind: 'answers' | 'skip') => {
        if (starting) return;
        setStarting(kind);
        setError(null);
        try {
            const given = Object.fromEntries(Object.entries(answers).filter(([, answer]) => answer.trim() !== ''));
            const chat = await chatApi.create(storyId, kind === 'answers' ? given : undefined);
            // In place of this form, so Back from the Chat goes where New Chat was tapped.
            router.replace(`/stories/${storyId}/chats/${chat.id}`);
        } catch (caught) {
            if (caught instanceof ApiUnreachableError) reportUnreachable();
            else setError(caught instanceof ApiError ? caught.message : 'Could not start a Chat.');
            setStarting(null);
        }
    };
    const submit = (event: FormEvent) => {
        event.preventDefault();
        void start('answers');
    };

    if (story.status === 'loading') {
        return (
            <main>
                <Loading label="Loading the Story…" />
            </main>
        );
    }
    if (story.status === 'error') {
        return (
            <main>
                <ErrorState error={story.error} title="Couldn't load the Story." onRetry={story.retry} />
                <Link href="/">Back to Stories</Link>
            </main>
        );
    }

    const questions = story.data.openingQuestions ?? [];
    const playable = story.data.playable;
    return (
        <main className="max-w-[36rem]">
            <nav className="breadcrumbs" aria-label="Breadcrumb">
                <Link href={`/stories/${storyId}/chats`}>
                    <ArrowLeftIcon size={18} />
                    Chats
                </Link>
            </nav>
            <h1 className="mb-1 [overflow-wrap:anywhere]">New Chat</h1>
            <p className="muted mt-0 mb-4 text-md [overflow-wrap:anywhere]">{storyTitle(story.data)}</p>
            {!playable && (
                <p className="notice" role="status">
                    Not playable yet. Still to fill in: {story.data.missing.map((field) => field.label).join(', ')}.
                </p>
            )}
            <form onSubmit={submit} aria-label="Opening questions" data-opening-questions>
                {questions.length > 0 && <p className="muted mt-0 mb-3 text-md">Answer as many as you like. A blank one uses its default.</p>}
                {questions.map((question) => {
                    const inputId = `answer-${question.key}`;
                    return (
                        <div className={FIELD} key={question.key}>
                            <label htmlFor={inputId} className={`${FIELD_LABEL} text-text`}>
                                {question.question}
                            </label>
                            <input
                                id={inputId}
                                className={FIELD_INPUT}
                                value={answers[question.key] ?? ''}
                                placeholder={question.defaultAnswer}
                                maxLength={ANSWER_MAX}
                                autoComplete="off"
                                enterKeyHint="next"
                                aria-describedby={`${inputId}-default`}
                                onChange={(event) => setAnswers((current) => ({ ...current, [question.key]: event.target.value }))}
                            />
                            <p id={`${inputId}-default`} className={`${FIELD_HINT} [overflow-wrap:anywhere]`}>
                                Default: {question.defaultAnswer}
                            </p>
                        </div>
                    );
                })}
                {error && (
                    <p role="alert" className="turn-error">
                        {error}
                    </p>
                )}
                <div className="mt-5 flex flex-col gap-2">
                    <button type="submit" className="button w-full" disabled={!playable || starting !== null} aria-busy={starting === 'answers' || undefined}>
                        {starting === 'answers' ? 'Starting…' : 'Start'}
                    </button>
                    {questions.length > 0 && (
                        <button
                            type="button"
                            className="button button-quiet w-full"
                            disabled={!playable || starting !== null}
                            aria-busy={starting === 'skip' || undefined}
                            onClick={() => void start('skip')}
                        >
                            {starting === 'skip' ? 'Starting…' : 'Skip, use the defaults'}
                        </button>
                    )}
                </div>
            </form>
        </main>
    );
}

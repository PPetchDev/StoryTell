'use client';

import { use } from 'react';

import { BookView } from '@/components/chat/book-view';

/** The Book view (.scratch/chat-novel/spec.md): the Chat retold as a novel. */
export default function BookPage({ params }: { params: Promise<{ id: string; chatId: string }> }) {
    const { id, chatId } = use(params);
    return <BookView storyId={id} chatId={chatId} />;
}

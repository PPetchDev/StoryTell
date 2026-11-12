'use client';

import Link from 'next/link';
import { use } from 'react';

import { CharacterProfiles } from '@/components/chat/character-profile';
import { ChatScreen } from '@/components/chat/chat-screen';
import { useApiQuery } from '@/components/connection';
import { ErrorState, Loading } from '@/components/query-state';
import { portraitsOf } from '@/lib/character-colour';
import { Chat } from '@/lib/chat';
import { Story } from '@/lib/story';

export default function ChatPage({ params }: { params: Promise<{ id: string; chatId: string }> }) {
    const { id, chatId } = use(params);
    const chat = useApiQuery<Chat>(`/stories/${id}/chats/${chatId}`);
    // The cast's order picks each Character's colour; it loads alongside, so colours never flicker.
    const story = useApiQuery<Story>(`/stories/${id}`);

    // A skeleton while the Chat and its Story load, and the reason with Try again if the Chat can't be (audit M9).
    if (chat.status === 'loading' || story.status === 'loading') {
        return (
            <main>
                <Loading label="Loading the Chat…" lines={4} />
            </main>
        );
    }
    if (chat.status === 'error') {
        return (
            <main>
                <ErrorState error={chat.error} title="Couldn't open this Chat." onRetry={chat.retry} />
                <Link href={`/stories/${id}/chats`} className="inline-flex min-h-11 items-center">
                    Back to Chats
                </Link>
            </main>
        );
    }
    // Without the Story every speaker gets the neutral colour; the Chat still reads.
    const cast = story.status === 'ready' ? story.data.characters.map((character) => character.id) : [];
    // Each Character's Reference image goes beside their lines; without one, their initial does.
    const portraits = story.status === 'ready' ? portraitsOf(story.data.characters) : {};
    // The Scenes give the Scene strip each Scene's goal; without them it shows the name alone.
    const scenes = story.status === 'ready' ? story.data.scenes : [];
    // A tap on a Character's Portrait opens their profile; without the Story there are none to open.
    const characters = story.status === 'ready' ? story.data.characters : [];
    return (
        <CharacterProfiles characters={characters}>
            {/* Keyed by the Chat, so opening another (a new Branch) starts its screen afresh. */}
            <ChatScreen
                key={chat.data.id}
                initial={chat.data}
                cast={cast}
                characters={characters}
                portraits={portraits}
                scenes={scenes}
                looks={story.status === 'ready' ? story.data : null}
            />
        </CharacterProfiles>
    );
}

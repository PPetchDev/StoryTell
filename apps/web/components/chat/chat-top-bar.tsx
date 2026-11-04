'use client';

import Link from 'next/link';

import { useApiQuery } from '@/components/connection';
import { ConfirmButton } from '@/components/story-editor/fields';
import { Chat } from '@/lib/chat';
import { PersonaList } from '@/lib/persona';

/**
 * The worn identity (spec: stories 44–45): the Story's Role or any Persona, swappable at any
 * time. The next User Message is written as it; earlier ones keep the name they were sent under.
 */
function IdentitySwap({ chat, disabled, onSwap }: { chat: Chat; disabled: boolean; onSwap(personaId: number | null): void }) {
    const personas = useApiQuery<PersonaList>('/personas');
    const options = personas.status === 'ready' ? personas.data.personas.map(({ id, name }) => ({ id, name })) : [];
    // The worn Persona stays selectable while the list loads.
    if (chat.personaId !== null && !options.some((option) => option.id === chat.personaId)) {
        options.unshift({ id: chat.personaId, name: chat.identityName });
    }
    return (
        <label className="identity-swap">
            <span className="muted">Playing as</span>
            <select
                value={chat.personaId ?? ''}
                disabled={disabled}
                onChange={(event) => onSwap(event.target.value === '' ? null : Number(event.target.value))}
            >
                <option value="">{chat.roleName} (Role)</option>
                {options.map((option) => (
                    <option key={option.id} value={option.id}>
                        {option.name}
                    </option>
                ))}
            </select>
        </label>
    );
}

interface ChatTopBarProps {
    chat: Chat;
    /** A turn or a write is in flight, or a Message is being edited. */
    busy: boolean;
    onSwapIdentity(personaId: number | null): void;
    onOpenMemory(): void;
    onReset(): void;
}

/** Above the thread: the way back, the Chat's links, its title and its controls. */
export function ChatTopBar({ chat, busy, onSwapIdentity, onOpenMemory, onReset }: ChatTopBarProps) {
    return (
        <header>
            <nav className="breadcrumbs">
                <Link href={`/stories/${chat.storyId}/chats`}>← Chats</Link>
                <span className="muted">{chat.currentScene ? `Scene: ${chat.currentScene.name}` : 'Free play'}</span>
                <Link href={`/stories/${chat.storyId}/gallery?chat=${chat.id}`}>Gallery</Link>
                <Link href={`/stories/${chat.storyId}/chats/${chat.id}/dashboard`}>Dashboard →</Link>
            </nav>
            <div className="chat-head">
                <h1>{chat.title}</h1>
                <IdentitySwap chat={chat} disabled={busy} onSwap={onSwapIdentity} />
                <button type="button" className="button button-quiet" onClick={onOpenMemory}>
                    Memory
                </button>
                <ConfirmButton
                    label="Reset"
                    question="Clear every Message and start this Chat over from the Opening?"
                    confirmLabel="Reset"
                    onConfirm={onReset}
                    disabled={busy || !chat.playable}
                />
            </div>
        </header>
    );
}

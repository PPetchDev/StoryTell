'use client';

import { ChangeEvent, useRef, useState } from 'react';

import { useConnection } from '@/components/connection';
import { initialOf } from '@/components/portrait/character-portrait';
import { ApiError, ApiUnreachableError } from '@/lib/api';
import { preparedForUpload } from '@/lib/cover';
import { personaImageUrl } from '@/lib/persona';
import { Story, storyApi } from '@/lib/story';
import { ConfirmButton } from './fields';
import { EDITOR_CARD, NOTE } from './folding-card';

interface RolePictureProps {
    storyId: number;
    roleName: string;
    imagePath: string | null;
    /** The Story as the API answered, once a picture is saved or removed. */
    onSaved(story: Story): void;
}

/**
 * The Role's own picture, on the Role tab (.scratch/role-image/spec.md): uploaded from the phone,
 * made ready in the browser as a Cover is, and saved at once. It shows beside your lines in a Chat
 * written as the Role; no model ever sees it.
 */
export function RolePicture({ storyId, roleName, imagePath, onSaved }: RolePictureProps) {
    const { reportUnreachable } = useConnection();
    /** What is happening to the picture, in words, while it is: "Uploading…", "Removing…". */
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const fileInput = useRef<HTMLInputElement>(null);
    const pictureButton = useRef<HTMLButtonElement>(null);
    const name = roleName.trim() || 'the Role';

    const save = async (doing: string, write: () => Promise<Story>) => {
        setBusy(doing);
        setError(null);
        try {
            onSaved(await write());
        } catch (caught) {
            if (caught instanceof ApiUnreachableError) reportUnreachable();
            setError(caught instanceof ApiError ? caught.message : "Couldn't save the picture. Try again.");
        } finally {
            setBusy(null);
        }
    };

    const upload = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        // Cleared, so choosing the same file again still counts as a change.
        event.target.value = '';
        // Re-encoded first, as a Cover is: that drops what a phone writes into a photo, where it was taken included.
        if (file)
            void save('Uploading…', async () => {
                const prepared = await preparedForUpload(file);
                return storyApi.uploadRoleImage(storyId, prepared.picture, prepared.filename);
            });
    };

    return (
        <section className={EDITOR_CARD} aria-label="Role picture" data-role-picture>
            <h2 className="mt-0 mb-1 text-lg font-semibold">Picture</h2>
            <p className={NOTE}>Optional. Shown beside your lines in a Chat when you play this Role.</p>
            <div className="flex items-center gap-3">
                {imagePath ? (
                    // eslint-disable-next-line @next/next/no-img-element -- served by the API from the image folder, as a thumbnail
                    <img
                        className="size-16 shrink-0 rounded-full bg-surface-raised object-cover"
                        src={personaImageUrl(imagePath, 320)}
                        alt={`Picture of ${name}`}
                        draggable={false}
                    />
                ) : (
                    <span className="grid size-16 shrink-0 place-items-center rounded-full bg-accent-fill text-2xl leading-none font-bold text-accent-text" aria-hidden="true">
                        {initialOf(roleName)}
                    </span>
                )}
                <div className="toolbar">
                    <button
                        ref={pictureButton}
                        type="button"
                        className="button button-quiet button-small"
                        disabled={busy !== null}
                        aria-label={`${imagePath ? 'Change picture' : 'Add a picture'} of ${name}`}
                        onClick={() => fileInput.current?.click()}
                    >
                        {imagePath ? 'Change picture' : 'Add a picture'}
                    </button>
                    {imagePath && (
                        <ConfirmButton
                            label="Remove picture"
                            ariaLabel={`Remove picture of ${name}`}
                            danger
                            disabled={busy !== null}
                            question="Remove the picture?"
                            confirmLabel="Remove"
                            small
                            onConfirm={() => save('Removing…', () => storyApi.clearRoleImage(storyId))}
                            focusAfter={() => pictureButton.current}
                        />
                    )}
                </div>
                <input
                    ref={fileInput}
                    className="visually-hidden"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    aria-label={`Picture for ${name}`}
                    tabIndex={-1}
                    onChange={upload}
                />
            </div>
            <p className={busy ? 'mt-2 mb-0 text-md text-muted' : 'sr-only'} role="status">
                {busy}
            </p>
            {error && (
                <p className="field-error mt-2 mb-0" role="alert">
                    {error}
                </p>
            )}
        </section>
    );
}

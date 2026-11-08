'use client';

import { useState } from 'react';

import { useConnection } from '@/components/connection';
import { ApiUnreachableError } from '@/lib/api';
import { drawCardPicture, exportCard, shareOrDownload } from '@/lib/character-card';
import { Character } from '@/lib/story';
import styles from './story-editor.module.css';

interface Props {
    storyId: number;
    character: Character;
    /** Their Character colour, behind the initial when they have no Reference image. */
    colour: string;
}

/**
 * "Export as Character card" at the foot of a Character's card (spec: "Export"): the browser
 * draws the picture, the API writes the card into it, and the file is shared or downloaded.
 * No AI call.
 */
export function ExportCardButton({ storyId, character, colour }: Props) {
    const { reportUnreachable } = useConnection();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const run = async () => {
        setBusy(true);
        setError(null);
        try {
            const picture = await drawCardPicture(character, colour);
            await shareOrDownload(await exportCard(storyId, character.id, picture));
        } catch (failure) {
            if (failure instanceof ApiUnreachableError) reportUnreachable();
            else setError(failure instanceof Error ? failure.message : 'Something went wrong.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className={styles.exportCard}>
            <button type="button" className="button button-quiet" onClick={() => void run()} disabled={busy}>
                {busy ? 'Exporting…' : 'Export as Character card'}
            </button>
            {error && (
                <p className="field-error" role="alert">
                    Couldn&apos;t export the card: {error}
                </p>
            )}
        </div>
    );
}

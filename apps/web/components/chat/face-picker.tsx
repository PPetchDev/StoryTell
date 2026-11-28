'use client';

import { useState } from 'react';

import { ICON_BUTTON } from '@/components/chat/chat-classes';
import { FaceIcon } from '@/components/icons';
import { EMOTION_GRID, TILE_LABEL, tileLabel } from '@/components/portrait/emotion-tiles';
import { PortraitImage } from '@/components/portrait/portrait-image';
import { Sheet } from '@/components/sheet/sheet';
import { EMOTION_LABEL, EVERYDAY_EMOTIONS, Expression, FaceEmotion, INTIMATE_EMOTIONS } from '@/lib/expressions';
import { referenceImageUrl } from '@/lib/story';

interface FacePickerProps {
    /** The face picked for the Message about to be sent, or null. */
    face: FaceEmotion | null;
    onFace(next: FaceEmotion | null): void;
    /** The worn Role's or Persona's Expressions: each face shows its picture where it has one. */
    faces: Expression[];
    /** Whose face: the worn identity's name. */
    name: string;
    disabled?: boolean;
    onPointerDown?(event: React.PointerEvent): void;
}

/**
 * Your face (.scratch/your-faces/spec.md): beside 🎲, picks the face the user's character makes
 * as they send the next Message. The Narrator is told it, so the Characters can see it; it shows
 * beside the line. It goes with one send, like the Roll.
 */
export function FacePicker({ face, onFace, faces, name, disabled = false, onPointerDown }: FacePickerProps) {
    const [open, setOpen] = useState(false);
    const byEmotion = new Map(faces.map((one) => [one.emotion, one]));
    const picked = face ? byEmotion.get(face) : undefined;
    const choose = (next: FaceEmotion | null) => {
        onFace(next);
        setOpen(false);
    };
    const tile = (emotion: FaceEmotion) => {
        const expression = byEmotion.get(emotion);
        return (
            <li key={emotion}>
                <button
                    type="button"
                    className={[
                        'bare-button flex min-h-11 w-full flex-col items-center gap-1 rounded-lg px-1 py-1.5 text-sm',
                        'press focus-ring aria-pressed:bg-accent-soft aria-pressed:outline-2 aria-pressed:outline-accent',
                    ].join(' ')}
                    aria-label={EMOTION_LABEL[emotion]}
                    aria-pressed={face === emotion}
                    onClick={() => choose(emotion)}
                >
                    {expression ? (
                        <PortraitImage portrait={{ src: referenceImageUrl(expression.imagePath), crop: expression.crop }} className="size-12 flex-none" />
                    ) : (
                        <span className="grid size-12 flex-none place-items-center rounded-full border border-dashed border-faint text-muted" aria-hidden="true">
                            <FaceIcon size={20} />
                        </span>
                    )}
                    <span className={TILE_LABEL}>{tileLabel(emotion)}</span>
                </button>
            </li>
        );
    };
    return (
        <>
            <button
                type="button"
                className={ICON_BUTTON}
                aria-label={face ? `Your face: ${EMOTION_LABEL[face]}. Change it` : 'Pick your face for this message'}
                title={face ? `Your face: ${EMOTION_LABEL[face]}` : 'Your face for this message'}
                // It opens a sheet, so it is a popup, not a toggle (docs/ui-audit-2026-11-21.md, L2).
                aria-haspopup="dialog"
                disabled={disabled}
                onPointerDown={onPointerDown}
                onClick={() => setOpen(true)}
                data-face-picker=""
            >
                {picked ? (
                    <PortraitImage portrait={{ src: referenceImageUrl(picked.imagePath), crop: picked.crop }} className="size-7" />
                ) : (
                    <FaceIcon size={20} />
                )}
            </button>
            {open && (
                // A short title of its own: a long name ran under the grip and Close (docs/ui-audit-2026-11-21.md, M7).
                <Sheet label="Your face" title="Your face" onClose={() => setOpen(false)}>
                    <div className="grid grid-cols-[minmax(0,1fr)] gap-3 pb-1">
                        <p className="m-0 text-sm text-muted">The face {name} makes as you send this message. Everyone there sees it.</p>
                        <button type="button" className="button button-quiet justify-self-start" aria-pressed={face === null} onClick={() => choose(null)}>
                            No face
                        </button>
                        <ul className={`m-0 grid list-none gap-2 p-0 ${EMOTION_GRID}`} aria-label="Everyday feelings">
                            {EVERYDAY_EMOTIONS.map(tile)}
                        </ul>
                        {/* The same heading as the editor's (.scratch/stage-pictures/spec.md; docs/ui-audit-2026-11-21.md, L6). */}
                        <h3 className="m-0 text-base font-semibold">Intimate scenes (18+)</h3>
                        <ul className={`m-0 grid list-none gap-2 p-0 ${EMOTION_GRID}`} aria-label="Intimate feelings">
                            {INTIMATE_EMOTIONS.map(tile)}
                        </ul>
                    </div>
                </Sheet>
            )}
        </>
    );
}

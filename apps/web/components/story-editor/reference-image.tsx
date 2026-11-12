'use client';

import { useEffect, useRef, useState } from 'react';

import { announce } from '@/components/announcer';
import { useConnection } from '@/components/connection';
import { PortraitImage } from '@/components/portrait/portrait-image';
import { ApiError, ApiUnreachableError } from '@/lib/api';
import { candidateImageUrl, Character, PortraitCrop, REFERENCE_CANDIDATES, referenceImageUrl, ReferenceCandidate, Story, storyApi } from '@/lib/story';
import { ConfirmButton } from './fields';
import { FIELD_HINT } from './fields';
import { SUBSECTION, SUBSECTION_LEGEND } from './folding-card';
import { PortraitCropper } from './portrait-cropper';
import { UndoNotice, useUndo } from './undo-notice';

/**
 * On a desktop the Reference image is the Character card's left column: it spans every row and
 * stays in view under the sticky header as the fields scroll by.
 */
const DESKTOP_COLUMN = 'lg:sticky lg:top-[calc(var(--editor-top,0px)+--spacing(4))] lg:col-start-1 lg:row-span-full lg:m-0';
/** A picture of the Character: 2:3, rounded, on the page colour while it loads; lazy, so a folded card loads none (M31). */
const PICTURE = 'block aspect-[2/3] h-auto w-full rounded-sm bg-bg object-cover';

/** The error code of an image pool that is used up (docs/error-codes.md). */
const OUT_OF_IMAGE_CREDIT = '402.001.004';

type RoundState =
    | { kind: 'idle' }
    | { kind: 'generating' }
    | { kind: 'choosing'; candidates: ReferenceCandidate[]; failed: number; failureMessage: string | null }
    | { kind: 'picking'; candidates: ReferenceCandidate[] }
    | { kind: 'error'; message: string; outOfCredit: boolean };

/** What the current Reference image was drawn from, as far as this page knows. */
interface Look {
    appearance: string;
    imageStyle: string;
}

interface ReferenceImageProps {
    storyId: number;
    character: Character;
    /** The Story's Image style; the candidates follow it. */
    imageStyle: string;
    /** Sends pending field edits first, so a round is drawn from what the author just typed. */
    flush(): Promise<void>;
    /** Runs a write that answers with the whole Story, after pending edits; a failure goes to `onError`. */
    commit(run: () => Promise<Story>, onError: (message: string) => void): Promise<Story | undefined>;
}

function errorMessage(error: unknown): { message: string; outOfCredit: boolean } {
    if (error instanceof ApiError) {
        return { message: error.message, outOfCredit: error.code === OUT_OF_IMAGE_CREDIT };
    }
    return { message: error instanceof Error ? error.message : 'Something went wrong.', outOfCredit: false };
}

/**
 * A Character's Reference image (spec: "Reference image"): the current one, if any, a button
 * that makes a round of 3 candidates to pick from, and an offer to make a new one once the
 * Appearance or the Image style has changed since. Shown on the Character page only.
 */
export function ReferenceImage({ storyId, character, imageStyle, flush, commit }: ReferenceImageProps) {
    const { reportUnreachable } = useConnection();
    const [round, setRound] = useState<RoundState>({ kind: 'idle' });
    // The look the current image was made from. On a fresh page that is the look as loaded,
    // so the offer appears only after the author changes something here.
    const [madeFrom, setMadeFrom] = useState<Look>({ appearance: character.appearance, imageStyle });
    const [offerDismissed, setOfferDismissed] = useState(false);
    const [cropping, setCropping] = useState(false);
    const [savingCrop, setSavingCrop] = useState(false);
    const [cropError, setCropError] = useState<string | null>(null);

    const heading = character.name.trim() === '' ? 'this Character' : character.name;
    const box = useRef<HTMLFieldSetElement>(null);
    const undo = useUndo();

    // A round lands out of sight of a screen reader, and the Generate button that had focus is gone:
    // say how many came back, and put focus on the first (audit H12).
    const roundKind = round.kind;
    const candidateCount = round.kind === 'choosing' ? round.candidates.length : 0;
    useEffect(() => {
        if (roundKind !== 'choosing') return;
        announce(`${candidateCount} ${candidateCount === 1 ? 'candidate' : 'candidates'} ready. Pick one.`);
        box.current?.querySelector<HTMLElement>('[data-candidate]')?.focus();
    }, [roundKind, candidateCount]);
    const hasImage = character.referenceImagePath !== null;
    const lookChanged =
        hasImage &&
        (madeFrom.appearance.trim() !== character.appearance.trim() || madeFrom.imageStyle.trim() !== imageStyle.trim());
    const offerRegenerate = lookChanged && !offerDismissed && round.kind === 'idle';
    const busy = round.kind === 'generating' || round.kind === 'picking';

    const generate = async () => {
        setRound({ kind: 'generating' });
        setOfferDismissed(false);
        try {
            await flush();
            const answer = await storyApi.generateReferenceCandidates(storyId, character.id);
            setRound({
                kind: 'choosing',
                candidates: answer.candidates,
                failed: answer.failed,
                failureMessage: answer.failureMessage,
            });
        } catch (error) {
            if (error instanceof ApiUnreachableError) {
                reportUnreachable();
                return;
            }
            setRound({ kind: 'error', ...errorMessage(error) });
        }
    };

    const pick = (candidates: ReferenceCandidate[], candidateId: string) => {
        setRound({ kind: 'picking', candidates });
        const lookNow: Look = { appearance: character.appearance, imageStyle };
        void commit(
            () => storyApi.pickReferenceImage(storyId, character.id, candidateId),
            (message) => setRound({ kind: 'error', message, outOfCredit: false }),
        ).then((saved) => {
            if (!saved) return;
            setMadeFrom(lookNow);
            setOfferDismissed(false);
            setRound({ kind: 'idle' });
        });
    };

    const saveCrop = (crop: PortraitCrop) => {
        setSavingCrop(true);
        setCropError(null);
        void commit(
            () => storyApi.setPortraitCrop(storyId, character.id, crop),
            (message) => setCropError(message),
        ).then((saved) => {
            setSavingCrop(false);
            if (saved) setCropping(false);
        });
    };

    const clearCrop = () => {
        const before = character.portraitCrop;
        setCropError(null);
        void commit(
            () => storyApi.clearPortraitCrop(storyId, character.id),
            (message) => setCropError(message),
        ).then((saved) => {
            if (!saved || !before) return;
            undo.offer({
                message: `Reset the chat picture of ${heading} to a guess.`,
                undo: () => void commit(() => storyApi.setPortraitCrop(storyId, character.id, before), (message) => setCropError(message)),
                focusAfterUndo: () => box.current?.querySelector<HTMLElement>('[data-reset-face]'),
            });
        });
    };

    const remove = () => {
        void commit(
            () => storyApi.removeReferenceImage(storyId, character.id),
            (message) => setRound({ kind: 'error', message, outOfCredit: false }),
        );
    };

    return (
        <fieldset ref={box} className={`${SUBSECTION} ${DESKTOP_COLUMN}`}>
            <legend className={SUBSECTION_LEGEND}>Reference image</legend>
            <p className={`${FIELD_HINT} mb-2`}>
                Keeps {heading} looking the same in every Snapshot. In a Chat, the face you pick shows beside their
                lines. Drawn from Appearance in the Story&apos;s Image style.
            </p>

            {hasImage && (
                <figure className="mx-0 my-2">
                    <img
                        src={referenceImageUrl(character.referenceImagePath!)}
                        // The API's WebP thumbnails (audit L29): the figure is at most 12rem wide.
                        srcSet={`${referenceImageUrl(character.referenceImagePath!)}?w=320 1x, ${referenceImageUrl(character.referenceImagePath!)}?w=640 2x`}
                        alt={`Reference image of ${heading}`}
                        width={200}
                        height={300}
                        loading="lazy"
                        decoding="async"
                        className={`${PICTURE} max-w-48`}
                    />
                </figure>
            )}

            {hasImage && (
                <div className="mt-2 mb-3 flex flex-wrap items-center gap-2.5" role="group" aria-label={`Chat picture of ${heading}`}>
                    <PortraitImage
                        portrait={{ src: referenceImageUrl(character.referenceImagePath!), crop: character.portraitCrop }}
                        className="size-12 flex-none"
                    />
                    <div className="flex min-w-32 flex-1 flex-col gap-0.5">
                        <span className="font-semibold">Chat picture</span>
                        <span className="hint mt-0">
                            {character.portraitCrop ? 'The face you picked.' : 'A guess at the face, until you pick it.'}
                        </span>
                    </div>
                    {/* Full-size buttons, 8px apart (audit H25). */}
                    <div className="flex flex-wrap gap-2">
                        <button type="button" className="button" disabled={busy} onClick={() => setCropping(true)}>
                            {character.portraitCrop ? 'Change' : 'Pick the face'}
                        </button>
                        {character.portraitCrop && (
                            <button
                                type="button"
                                className="button button-quiet"
                                data-reset-face=""
                                aria-label={`Reset the chat picture of ${heading}`}
                                disabled={busy}
                                onClick={clearCrop}
                            >
                                Reset
                            </button>
                        )}
                    </div>
                </div>
            )}
            <UndoNotice undo={undo} />
            {cropError && !cropping && (
                <p className="field-error" role="alert">
                    Couldn&apos;t save the chat picture: {cropError}
                </p>
            )}
            {cropping && hasImage && (
                <PortraitCropper
                    name={heading}
                    src={referenceImageUrl(character.referenceImagePath!)}
                    initial={character.portraitCrop}
                    saving={savingCrop}
                    error={cropError}
                    onSave={saveCrop}
                    onClose={() => {
                        setCropping(false);
                        setCropError(null);
                    }}
                />
            )}

            {offerRegenerate && (
                <div className="notice flex flex-wrap items-center gap-2" role="status">
                    <span>
                        {madeFrom.imageStyle.trim() !== imageStyle.trim() && madeFrom.appearance.trim() === character.appearance.trim()
                            ? 'The Image style changed.'
                            : 'The Appearance changed.'}{' '}
                        Make a new Reference image?
                    </span>
                    <button type="button" className="button button-small" onClick={() => void generate()}>
                        Generate a new one
                    </button>
                    <button type="button" className="button button-quiet button-small" onClick={() => setOfferDismissed(true)}>
                        Not now
                    </button>
                </div>
            )}

            {(round.kind === 'choosing' || round.kind === 'picking') && (
                <div role="group" aria-label={`Reference image candidates for ${heading}`}>
                    {round.kind === 'choosing' && round.failed > 0 && (
                        <p className="field-error" role="alert">
                            {round.candidates.length} of {round.candidates.length + round.failed} candidates came back. {round.failureMessage}
                        </p>
                    )}
                    <p className={`${FIELD_HINT} mb-2`}>Pick one. The others are discarded.</p>
                    {/* Two to a row on a phone, each with a full-size button under it (audit H25). */}
                    <ul className="m-0 mb-3 grid list-none grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-3 p-0">
                        {round.candidates.map((candidate, index) => (
                            <li key={candidate.id} className="grid gap-2">
                                <img
                                    src={candidateImageUrl(storyId, character.id, candidate.id)}
                                    alt={`Candidate ${index + 1}`}
                                    width={200}
                                    height={300}
                                    decoding="async"
                                    className={PICTURE}
                                />
                                <button
                                    type="button"
                                    className="button px-3"
                                    data-candidate=""
                                    aria-disabled={round.kind === 'picking' || undefined}
                                    onClick={round.kind === 'picking' ? undefined : () => pick(round.candidates, candidate.id)}
                                >
                                    {round.kind === 'picking' ? 'Saving…' : `Use candidate ${index + 1}`}
                                </button>
                            </li>
                        ))}
                    </ul>
                    {round.kind === 'choosing' && (
                        <div className="toolbar">
                            <button type="button" className="button button-quiet" onClick={() => void generate()}>
                                Generate again
                            </button>
                            <button
                                type="button"
                                className="button button-quiet"
                                onClick={() => setRound({ kind: 'idle' })}
                            >
                                Discard candidates
                            </button>
                        </div>
                    )}
                </div>
            )}

            {round.kind === 'error' && (
                <p className="field-error flex flex-wrap items-center gap-x-3 gap-y-2" role="alert">
                    <span className="min-w-0 flex-1 basis-48">
                        {round.outOfCredit
                            ? 'Out of image credit, so no Reference image can be made until it is topped up. Play is unaffected.'
                            : `Couldn't make a Reference image: ${round.message}`}
                    </span>{' '}
                    <button type="button" className="button button-quiet" onClick={() => void generate()}>
                        Retry
                    </button>
                </p>
            )}

            {round.kind !== 'choosing' && round.kind !== 'picking' && (
                <div className="toolbar">
                    <button
                        type="button"
                        className={hasImage ? 'button button-quiet' : 'button'}
                        disabled={character.appearance.trim() === ''}
                        aria-disabled={busy || undefined}
                        aria-busy={round.kind === 'generating' || undefined}
                        onClick={busy ? undefined : () => void generate()}
                    >
                        {round.kind === 'generating'
                            ? `Generating ${REFERENCE_CANDIDATES} candidates…`
                            : hasImage
                              ? 'Generate a new Reference image'
                              : 'Generate Reference image'}
                    </button>
                    {hasImage && !busy && (
                        <ConfirmButton
                            label="Remove Reference image"
                            danger
                            question="Remove the Reference image?"
                            confirmLabel="Remove"
                            onConfirm={remove}
                        />
                    )}
                </div>
            )}
            {character.appearance.trim() === '' && !hasImage && (
                <p className={`${FIELD_HINT} mt-2`}>Write the Appearance first; the candidates are drawn from it.</p>
            )}
        </fieldset>
    );
}

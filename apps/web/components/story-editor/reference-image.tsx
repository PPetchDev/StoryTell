'use client';

import { useState } from 'react';

import { useConnection } from '@/components/connection';
import { ApiError, ApiUnreachableError } from '@/lib/api';
import { candidateImageUrl, Character, referenceImageUrl, ReferenceCandidate, Story, storyApi } from '@/lib/story';
import { ConfirmButton } from './fields';

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
 * that makes a round of 4 candidates to pick from, and an offer to make a new one once the
 * Appearance or the Image style has changed since. Shown on the Character page only.
 */
export function ReferenceImage({ storyId, character, imageStyle, flush, commit }: ReferenceImageProps) {
    const { reportUnreachable } = useConnection();
    const [round, setRound] = useState<RoundState>({ kind: 'idle' });
    // The look the current image was made from. On a fresh page that is the look as loaded,
    // so the offer appears only after the author changes something here.
    const [madeFrom, setMadeFrom] = useState<Look>({ appearance: character.appearance, imageStyle });
    const [offerDismissed, setOfferDismissed] = useState(false);

    const heading = character.name.trim() === '' ? 'this Character' : character.name;
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

    const remove = () => {
        void commit(
            () => storyApi.removeReferenceImage(storyId, character.id),
            (message) => setRound({ kind: 'error', message, outOfCredit: false }),
        );
    };

    return (
        <fieldset className="subsection reference-image">
            <legend>Reference image</legend>
            <p className="hint">
                Keeps {heading} looking the same in every Snapshot. Never shown in play. Drawn from Appearance in the
                Story&apos;s Image style.
            </p>

            {hasImage && (
                <figure className="reference-current">
                    <img
                        src={referenceImageUrl(character.referenceImagePath!)}
                        alt={`Reference image of ${heading}`}
                        width={200}
                        height={300}
                    />
                </figure>
            )}

            {offerRegenerate && (
                <div className="notice reference-offer" role="status">
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
                <div className="candidates" role="group" aria-label={`Reference image candidates for ${heading}`}>
                    {round.kind === 'choosing' && round.failed > 0 && (
                        <p className="field-error" role="alert">
                            {round.candidates.length} of 4 candidates came back. {round.failureMessage}
                        </p>
                    )}
                    <p className="hint">Pick one. The others are discarded.</p>
                    <ul className="candidate-grid">
                        {round.candidates.map((candidate, index) => (
                            <li key={candidate.id}>
                                <img
                                    src={candidateImageUrl(storyId, character.id, candidate.id)}
                                    alt={`Candidate ${index + 1}`}
                                    width={200}
                                    height={300}
                                />
                                <button
                                    type="button"
                                    className="button button-small"
                                    disabled={round.kind === 'picking'}
                                    onClick={() => pick(round.candidates, candidate.id)}
                                >
                                    {round.kind === 'picking' ? 'Saving…' : `Use candidate ${index + 1}`}
                                </button>
                            </li>
                        ))}
                    </ul>
                    {round.kind === 'choosing' && (
                        <div className="toolbar">
                            <button type="button" className="button button-quiet button-small" onClick={() => void generate()}>
                                Generate again
                            </button>
                            <button
                                type="button"
                                className="button button-quiet button-small"
                                onClick={() => setRound({ kind: 'idle' })}
                            >
                                Discard candidates
                            </button>
                        </div>
                    )}
                </div>
            )}

            {round.kind === 'error' && (
                <p className="field-error" role="alert">
                    <span>
                        {round.outOfCredit
                            ? 'Out of image credit, so no Reference image can be made until it is topped up. Play is unaffected.'
                            : `Couldn't make a Reference image: ${round.message}`}
                    </span>{' '}
                    <button type="button" className="button button-quiet button-small" onClick={() => void generate()}>
                        Retry
                    </button>
                </p>
            )}

            {round.kind !== 'choosing' && round.kind !== 'picking' && (
                <div className="toolbar">
                    <button
                        type="button"
                        className={hasImage ? 'button button-quiet' : 'button'}
                        disabled={busy || character.appearance.trim() === ''}
                        onClick={() => void generate()}
                    >
                        {round.kind === 'generating'
                            ? 'Generating 4 candidates…'
                            : hasImage
                              ? 'Generate a new Reference image'
                              : 'Generate Reference image'}
                    </button>
                    {hasImage && !busy && (
                        <ConfirmButton
                            label="Remove Reference image"
                            question="Remove the Reference image?"
                            confirmLabel="Remove"
                            onConfirm={remove}
                        />
                    )}
                </div>
            )}
            {character.appearance.trim() === '' && !hasImage && (
                <p className="hint">Write the Appearance first; the candidates are drawn from it.</p>
            )}
        </fieldset>
    );
}

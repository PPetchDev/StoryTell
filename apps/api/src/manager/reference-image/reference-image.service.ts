import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';

import { NoAppearanceError, ReferenceCandidateNotFoundError } from '../../errors/image.errors.js';
import { OutOfCreditError } from '../../errors/model-gateway.errors.js';
import { CharacterNotFoundError } from '../../errors/story.errors.js';
import { CharacterResponse } from '../../model/story/entities/character.entity.js';
import { ImageData, ModelGateway } from '../../service/model-gateway/model-gateway.js';
import { StoryDetail, StoryManagerService } from '../story/story.service.js';
import { CANDIDATE_COUNT, referenceImagePrompt } from './prompt.js';

export interface ReferenceCandidate {
    id: string;
}

/** What one round of generation came back with. */
export interface CandidateRound {
    candidates: ReferenceCandidate[];
    /** Calls of the round that failed while at least one succeeded; the message is the first failure's. */
    failed: number;
    failureMessage: string | null;
}

interface HeldRound {
    storyId: number;
    characterId: number;
    madeAt: number;
    images: Map<string, ImageData>;
}

/** A round not picked from within this long is dropped; the author generates again. */
const ROUND_TTL_MS = 30 * 60_000;
/** Rounds held at once, across every Character; the oldest goes first. */
const MAX_ROUNDS = 12;

/**
 * Reference image candidates (spec: "Reference image"). A round is held in memory until one
 * candidate is picked or a newer round for the same Character replaces it; unpicked candidates
 * are never written to the image folder. The picked image is handed to the Story authoring
 * module, which owns the file and the Character's path.
 */
@Injectable()
export class ReferenceImageManagerService {
    private readonly logger = new Logger(ReferenceImageManagerService.name);
    /** By Character id: one held round per Character. */
    private readonly rounds = new Map<number, HeldRound>();

    constructor(
        private readonly storyManager: StoryManagerService,
        private readonly gateway: ModelGateway,
    ) {}

    /** Makes CANDIDATE_COUNT candidates in parallel; a new round discards the Character's old one. */
    async generateCandidates(storyId: number, characterId: number): Promise<CandidateRound> {
        const story = await this.storyManager.getStory(storyId);
        const character = findCharacter(story, characterId);
        if (character.appearance.trim() === '') throw new NoAppearanceError();
        if (await this.imageCreditOut()) throw new OutOfCreditError('image');

        const prompt = referenceImagePrompt(character, story.style.imageStyle);
        const results = await Promise.allSettled(
            Array.from({ length: CANDIDATE_COUNT }, () =>
                this.gateway.generateImage({ kind: 'reference_image', prompt, servedFor: { storyId } }),
            ),
        );

        const images = new Map<string, ImageData>();
        const failures: unknown[] = [];
        for (const result of results) {
            if (result.status === 'fulfilled') images.set(randomBytes(8).toString('hex'), result.value.image);
            else failures.push(result.reason);
        }
        if (images.size === 0) throw failures[0];
        if (failures.length > 0) {
            this.logger.warn(`${failures.length} of ${CANDIDATE_COUNT} candidates failed: ${messageOf(failures[0])}`);
        }

        this.sweep();
        this.rounds.set(characterId, { storyId, characterId, madeAt: Date.now(), images });
        return {
            candidates: [...images.keys()].map((id) => ({ id })),
            failed: failures.length,
            failureMessage: failures.length > 0 ? messageOf(failures[0]) : null,
        };
    }

    async openCandidate(storyId: number, characterId: number, candidateId: string): Promise<ImageData> {
        await this.storyManager.getStory(storyId);
        return this.heldCandidate(storyId, characterId, candidateId);
    }

    /** Stores the picked candidate as the Character's Reference image and drops the round. */
    async pickCandidate(storyId: number, characterId: number, candidateId: string): Promise<StoryDetail> {
        const image = this.heldCandidate(storyId, characterId, candidateId);
        const story = await this.storyManager.replaceReferenceImage(storyId, characterId, image);
        this.rounds.delete(characterId);
        return story;
    }

    private heldCandidate(storyId: number, characterId: number, candidateId: string): ImageData {
        const round = this.rounds.get(characterId);
        const image = round?.storyId === storyId ? round.images.get(candidateId) : undefined;
        if (!image) throw new ReferenceCandidateNotFoundError();
        return image;
    }

    private async imageCreditOut(): Promise<boolean> {
        const remaining = (await this.gateway.remainingCredit()).image.remainingUsd;
        return remaining !== null && remaining <= 0;
    }

    /** Drops expired rounds, then the oldest ones past the cap. */
    private sweep(): void {
        const now = Date.now();
        for (const [characterId, round] of this.rounds) {
            if (now - round.madeAt > ROUND_TTL_MS) this.rounds.delete(characterId);
        }
        while (this.rounds.size >= MAX_ROUNDS) {
            const oldest = [...this.rounds.values()].sort((a, b) => a.madeAt - b.madeAt)[0];
            this.rounds.delete(oldest.characterId);
        }
    }
}

function findCharacter(story: StoryDetail, characterId: number): CharacterResponse {
    const character = story.characters.find((other) => other.id === characterId);
    if (!character) throw new CharacterNotFoundError();
    return character;
}

function messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

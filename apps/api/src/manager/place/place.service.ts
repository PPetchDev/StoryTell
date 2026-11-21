import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';

import { InvalidPlaceError, NoDayPlacePictureError, PlaceBeingDrawnError, PlaceNotFoundError } from '../../errors/story.errors.js';
import { OutOfCreditError } from '../../errors/model-gateway.errors.js';
import type { PlacePictureEntity, StageLight, StoryPlaceEntity } from '../../model/stage/stage.entities.js';
import { StageModelService } from '../../model/stage/stage.service.js';
import { ModelGateway } from '../../service/model-gateway/model-gateway.js';
import { ImageStoreService } from '../../store/image/image-store.service.js';
import { placePrompt, relightPrompt, stageKey } from '../chat/stage/stage.service.js';
import { StoryManagerService } from '../story/story.service.js';

/** At most this many Places on one Story (.scratch/places-ahead/spec.md). */
export const MAX_PLACES = 30;
export const PLACE_NAME_MAX = 120;
export const PLACE_LOOKS_MAX = 600;

const LIGHTS: readonly StageLight[] = ['day', 'evening', 'night'];

export interface PlacePictureView {
    status: 'drawing' | 'ready' | 'failed';
    /** Relative to the image folder; null until drawn. */
    imagePath: string | null;
}

export type PlacePictures = Record<StageLight, PlacePictureView | null>;

export interface PlaceView {
    id: number;
    name: string;
    looks: string;
    pictures: PlacePictures;
}

/** A place a Chat drew in play that is not one of the Story's Places, by the Judge's words. */
export interface MetPlaceView {
    key: string;
    pictures: PlacePictures;
}

export interface PlacesView {
    places: PlaceView[];
    met: MetPlaceView[];
}

/**
 * Places drawn ahead (.scratch/places-ahead/spec.md): the author names and describes a Story's
 * places before play and draws them, day first, evening and night as edits of day. A Place's key is
 * the key play uses for the place's pictures, so the Judge naming the Place finds them drawn.
 */
@Injectable()
export class PlaceManagerService {
    private readonly logger = new Logger(PlaceManagerService.name);

    constructor(
        private readonly storyManager: StoryManagerService,
        private readonly stage: StageModelService,
        private readonly imageStore: ImageStoreService,
        private readonly gateway: ModelGateway,
    ) {}

    async list(storyId: number): Promise<PlacesView> {
        await this.storyManager.getStory(storyId);
        return this.view(storyId);
    }

    /** The Place names, for the Judge to answer with. */
    async names(storyId: number): Promise<string[]> {
        return (await this.stage.placesOf(storyId)).map((place) => place.name);
    }

    async add(storyId: number, fields: { name: string; looks?: string }): Promise<PlacesView> {
        await this.storyManager.getStory(storyId);
        const places = await this.stage.placesOf(storyId);
        if (places.length >= MAX_PLACES) throw new InvalidPlaceError(`A Story has at most ${MAX_PLACES} Places.`);
        const checked = this.checked(places, fields.name, fields.looks ?? '', null);
        await this.stage.addPlace(storyId, checked);
        return this.view(storyId);
    }

    async change(storyId: number, placeId: number, fields: { name?: string; looks?: string }): Promise<PlacesView> {
        await this.storyManager.getStory(storyId);
        const place = await this.found(storyId, placeId);
        const checked = this.checked(await this.stage.placesOf(storyId), fields.name ?? place.name, fields.looks ?? place.looks, place.id);
        await this.stage.changePlace(place, checked);
        return this.view(storyId);
    }

    /** Removes the Place and its pictures, files included. */
    async remove(storyId: number, placeId: number): Promise<PlacesView> {
        await this.storyManager.getStory(storyId);
        const place = await this.found(storyId, placeId);
        await this.stage.removePlace(place.id);
        await this.removeFiles(await this.stage.removePlacePictures(storyId, place.placeKey));
        return this.view(storyId);
    }

    /** Removes the pictures of a place met in play, by its key; a Place's key is left alone. */
    async removeMet(storyId: number, key: string): Promise<PlacesView> {
        await this.storyManager.getStory(storyId);
        const placeKey = stageKey(key);
        if (!(await this.stage.placesOf(storyId)).some((place) => place.placeKey === placeKey)) {
            await this.removeFiles(await this.stage.removePlacePictures(storyId, placeKey));
        }
        return this.view(storyId);
    }

    /**
     * Draws the Place in a light now, replacing any picture there: day from its name and looks with
     * the Story's Setting, evening and night as edits of the day picture. Refused before any call
     * with the Venice pool used up, with no day picture for another light, or while it draws.
     */
    async draw(storyId: number, placeId: number, light: StageLight): Promise<PlacesView> {
        const story = await this.storyManager.getStory(storyId);
        const place = await this.found(storyId, placeId);
        const remaining = (await this.gateway.remainingCredit()).image.remainingUsd;
        if (remaining !== null && remaining <= 0) throw new OutOfCreditError('image');
        const day = light === 'day' ? null : await this.stage.readyPlace(storyId, place.placeKey, 'day');
        if (light !== 'day' && day === null) throw new NoDayPlacePictureError();
        const claim = await this.stage.claimPlaceDrawing(storyId, place.placeKey, light);
        if (claim === null) throw new PlaceBeingDrawnError();
        try {
            const result =
                day === null
                    ? await this.gateway.generateImage({ kind: 'place_picture', prompt: placePrompt(story.setting, described(place), 'day'), servedFor: { storyId } })
                    : await this.gateway.generateImage({
                          kind: 'place_picture',
                          prompt: relightPrompt(light),
                          referenceImages: [await this.imageStore.read(day)],
                          servedFor: { storyId },
                      });
            const ext = ImageStoreService.extensionFor(result.image.mimeType) ?? 'jpg';
            const imagePath = `stage/story-${storyId}/place-${randomBytes(6).toString('hex')}.${ext}`;
            await this.imageStore.write(imagePath, result.image.bytes);
            await this.stage.finishPlace(claim.id, imagePath);
            if (claim.replaces && claim.replaces !== imagePath) await this.removeFiles([claim.replaces]);
            this.logger.log(`Story ${storyId}: drew the Place "${place.placeKey}" (${light}) ahead`);
        } catch (error) {
            await this.stage.undoPlaceDrawing(claim.id, claim.replaces);
            throw error;
        }
        return this.view(storyId);
    }

    private async found(storyId: number, placeId: number): Promise<StoryPlaceEntity> {
        const place = await this.stage.placeOf(storyId, placeId);
        if (!place) throw new PlaceNotFoundError();
        return place;
    }

    private checked(places: StoryPlaceEntity[], rawName: string, rawLooks: string, self: number | null): { name: string; placeKey: string; looks: string } {
        const name = rawName.replace(/\s+/g, ' ').trim();
        const looks = rawLooks.trim();
        if (name === '') throw new InvalidPlaceError('A Place needs a name.');
        if (name.length > PLACE_NAME_MAX) throw new InvalidPlaceError(`A Place's name is at most ${PLACE_NAME_MAX} characters.`);
        if (looks.length > PLACE_LOOKS_MAX) throw new InvalidPlaceError(`How a Place looks is at most ${PLACE_LOOKS_MAX} characters.`);
        const placeKey = stageKey(name);
        if (places.some((other) => other.id !== self && other.placeKey === placeKey)) throw new InvalidPlaceError(`The Story has a Place called "${name}" already.`);
        return { name, placeKey, looks };
    }

    private async view(storyId: number): Promise<PlacesView> {
        const places = await this.stage.placesOf(storyId);
        const pictures = await this.stage.picturesOf(storyId);
        const byKey = new Map<string, PlacePictureEntity[]>();
        for (const picture of pictures) byKey.set(picture.placeKey, [...(byKey.get(picture.placeKey) ?? []), picture]);
        const named = new Set(places.map((place) => place.placeKey));
        return {
            places: places.map((place) => ({ id: place.id, name: place.name, looks: place.looks, pictures: inLights(byKey.get(place.placeKey) ?? []) })),
            met: [...byKey.entries()]
                .filter(([key, rows]) => !named.has(key) && rows.some((row) => row.status === 'ready'))
                .map(([key, rows]) => ({ key, pictures: inLights(rows) })),
        };
    }

    private async removeFiles(files: string[]): Promise<void> {
        for (const file of files) {
            await this.imageStore.remove(file).catch((error: unknown) => this.logger.warn(`Could not remove ${file}: ${error instanceof Error ? error.message : String(error)}`));
        }
    }
}

/** What the picture is drawn from: the name, and how it looks when the author said. */
function described(place: StoryPlaceEntity): string {
    return place.looks.trim() === '' ? place.name : `${place.name}: ${place.looks.trim()}`;
}

function inLights(rows: PlacePictureEntity[]): PlacePictures {
    const pictures: PlacePictures = { day: null, evening: null, night: null };
    for (const light of LIGHTS) {
        const row = rows.find((one) => one.light === light);
        if (row) pictures[light] = { status: row.status, imagePath: row.imagePath };
    }
    return pictures;
}

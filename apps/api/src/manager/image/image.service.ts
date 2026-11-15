import { Injectable } from '@nestjs/common';

import { ImageNotFoundError, InvalidThumbnailWidthError } from '../../errors/image.errors.js';
import { PersonaModelService } from '../../model/persona/persona.service.js';
import { StoryModelService } from '../../model/story/story.service.js';
import { ImageStoreService, StoredImage, THUMBNAIL_WIDTHS, ThumbnailWidth } from '../../store/image/image-store.service.js';

/** A Story's own folder inside one kind of image folder: `snapshots/story-12/…`, `covers/story-12/…`. */
// Any case and trailing dots or spaces: Windows reads `STORY-12.` as the same folder as `story-12`.
const STORY_FOLDER = /^[^/]+\/story-(\d+)[. ]*\//i;
/** A Persona's own folder: `personas/persona-7/…` (.scratch/persona-image/spec.md). */
const PERSONA_FOLDER = /^personas[. ]*\/persona-(\d+)[. ]*\//i;
/** Anything else under `personas` belongs to nobody, and is served to nobody. */
const PERSONAS_ROOT = /^personas[. ]*\//i;

@Injectable()
export class ImageManagerService {
    constructor(
        private readonly imageStore: ImageStoreService,
        private readonly storyModel: StoryModelService,
        private readonly personaModel: PersonaModelService,
    ) {}

    /**
     * The image, or with `width` its WebP thumbnail at that width (audit H33). An image in a
     * Story's folder is served only to that Story's Account (.scratch/accounts/spec.md: "Images"),
     * and a Persona's picture only to the Persona's; to anyone else it is not found.
     */
    async openImage(relativePath: string, width?: string): Promise<StoredImage> {
        const normal = relativePath.replace(/\\/g, '/');
        const story = STORY_FOLDER.exec(normal);
        if (story && !(await this.storyModel.exists(Number(story[1])))) throw new ImageNotFoundError();
        const persona = PERSONA_FOLDER.exec(normal);
        if (persona ? !(await this.personaModel.findOne(Number(persona[1]))) : PERSONAS_ROOT.test(normal)) throw new ImageNotFoundError();
        if (width === undefined) return this.imageStore.open(relativePath);
        const wanted = Number(width);
        if (!THUMBNAIL_WIDTHS.includes(wanted as ThumbnailWidth)) throw new InvalidThumbnailWidthError(THUMBNAIL_WIDTHS);
        return this.imageStore.thumbnail(relativePath, wanted as ThumbnailWidth);
    }
}

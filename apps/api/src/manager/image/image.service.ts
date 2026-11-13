import { Injectable } from '@nestjs/common';

import { ImageNotFoundError, InvalidThumbnailWidthError } from '../../errors/image.errors.js';
import { StoryModelService } from '../../model/story/story.service.js';
import { ImageStoreService, StoredImage, THUMBNAIL_WIDTHS, ThumbnailWidth } from '../../store/image/image-store.service.js';

/** A Story's own folder inside one kind of image folder: `snapshots/story-12/…`, `covers/story-12/…`. */
// Any case and trailing dots or spaces: Windows reads `STORY-12.` as the same folder as `story-12`.
const STORY_FOLDER = /^[^/]+\/story-(\d+)[. ]*\//i;

@Injectable()
export class ImageManagerService {
    constructor(
        private readonly imageStore: ImageStoreService,
        private readonly storyModel: StoryModelService,
    ) {}

    /**
     * The image, or with `width` its WebP thumbnail at that width (audit H33). An image in a
     * Story's folder is served only to that Story's Account (.scratch/accounts/spec.md: "Images");
     * to anyone else it is not found.
     */
    async openImage(relativePath: string, width?: string): Promise<StoredImage> {
        const story = STORY_FOLDER.exec(relativePath.replace(/\\/g, '/'));
        if (story && !(await this.storyModel.exists(Number(story[1])))) throw new ImageNotFoundError();
        if (width === undefined) return this.imageStore.open(relativePath);
        const wanted = Number(width);
        if (!THUMBNAIL_WIDTHS.includes(wanted as ThumbnailWidth)) throw new InvalidThumbnailWidthError(THUMBNAIL_WIDTHS);
        return this.imageStore.thumbnail(relativePath, wanted as ThumbnailWidth);
    }
}

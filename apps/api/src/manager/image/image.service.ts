import { Injectable } from '@nestjs/common';

import { InvalidThumbnailWidthError } from '../../errors/image.errors.js';
import { ImageStoreService, StoredImage, THUMBNAIL_WIDTHS, ThumbnailWidth } from '../../store/image/image-store.service.js';

@Injectable()
export class ImageManagerService {
    constructor(private readonly imageStore: ImageStoreService) {}

    /** The image, or with `width` its WebP thumbnail at that width (audit H33). */
    openImage(relativePath: string, width?: string): Promise<StoredImage> {
        if (width === undefined) return this.imageStore.open(relativePath);
        const wanted = Number(width);
        if (!THUMBNAIL_WIDTHS.includes(wanted as ThumbnailWidth)) throw new InvalidThumbnailWidthError(THUMBNAIL_WIDTHS);
        return this.imageStore.thumbnail(relativePath, wanted as ThumbnailWidth);
    }
}

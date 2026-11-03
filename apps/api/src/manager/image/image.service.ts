import { Injectable } from '@nestjs/common';

import { ImageStoreService, StoredImage } from '../../store/image/image-store.service.js';

@Injectable()
export class ImageManagerService {
    constructor(private readonly imageStore: ImageStoreService) {}

    openImage(relativePath: string): Promise<StoredImage> {
        return this.imageStore.open(relativePath);
    }
}

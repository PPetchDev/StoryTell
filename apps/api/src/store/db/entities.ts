import { StoryEntity } from '../../model/story/entities/story.entity.js';

// Every entity must be listed here, or @InjectRepository fails at boot.
export const entities = [StoryEntity];

import { CreateStory1762160000000 } from './1762160000000-CreateStory.js';
import { StoryAuthoring1762400000000 } from './1762400000000-StoryAuthoring.js';
import { CreateSettingsAndUsageRecord1762700000000 } from './1762700000000-CreateSettingsAndUsageRecord.js';

// Listed by hand, oldest first, so migrations load the same way from compiled JS, the
// TypeORM CLI and Vitest. Add every new migration here.
export const migrations = [CreateStory1762160000000, StoryAuthoring1762400000000, CreateSettingsAndUsageRecord1762700000000];

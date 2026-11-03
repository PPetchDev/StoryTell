import { SettingsEntity } from '../../model/settings/entities/settings.entity.js';
import { StoryEntity } from '../../model/story/entities/story.entity.js';
import { UsageRecordEntity } from '../../model/usage-record/entities/usage-record.entity.js';

// Every entity must be listed here, or @InjectRepository fails at boot.
export const entities = [StoryEntity, SettingsEntity, UsageRecordEntity];

import { CreateStory1762160000000 } from './1762160000000-CreateStory.js';
import { StoryAuthoring1762400000000 } from './1762400000000-StoryAuthoring.js';
import { CreateSettingsAndUsageRecord1762700000000 } from './1762700000000-CreateSettingsAndUsageRecord.js';
import { ChatsAndMessages1762800000000 } from './1762800000000-ChatsAndMessages.js';
import { CharacterReferenceImage1762900000000 } from './1762900000000-CharacterReferenceImage.js';
import { JudgeAndLedger1763000000000 } from './1763000000000-JudgeAndLedger.js';
import { MemoryAndExtraction1763100000000 } from './1763100000000-MemoryAndExtraction.js';
import { Personas1763300000000 } from './1763300000000-Personas.js';
import { Snapshots1763400000000 } from './1763400000000-Snapshots.js';
import { PortraitCrop1763500000000 } from './1763500000000-PortraitCrop.js';
import { StoryCover1763600000000 } from './1763600000000-StoryCover.js';
import { StorySoFar1763700000000 } from './1763700000000-StorySoFar.js';

// Listed by hand, oldest first, so migrations load the same way from compiled JS, the
// TypeORM CLI and Vitest. Add every new migration here.
export const migrations = [
    CreateStory1762160000000,
    StoryAuthoring1762400000000,
    CreateSettingsAndUsageRecord1762700000000,
    ChatsAndMessages1762800000000,
    CharacterReferenceImage1762900000000,
    JudgeAndLedger1763000000000,
    MemoryAndExtraction1763100000000,
    Personas1763300000000,
    Snapshots1763400000000,
    PortraitCrop1763500000000,
    StoryCover1763600000000,
    StorySoFar1763700000000,
];

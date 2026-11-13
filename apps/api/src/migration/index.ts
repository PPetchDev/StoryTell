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
import { ReplyVersions1763810000000 } from './1763810000000-ReplyVersions.js';
import { TimeOfDay1763850000000 } from './1763850000000-TimeOfDay.js';
import { SnapshotSize1763860000000 } from './1763860000000-SnapshotSize.js';
import { Lore1763870000000 } from './1763870000000-Lore.js';
import { BranchLink1763880000000 } from './1763880000000-BranchLink.js';
import { AuthorsNote1763890000000 } from './1763890000000-AuthorsNote.js';
import { SittingOut1763900000000 } from './1763900000000-SittingOut.js';
import { LoreSecondaryKeywords1763910000000 } from './1763910000000-LoreSecondaryKeywords.js';
import { LorePatterns1763920000000 } from './1763920000000-LorePatterns.js';
import { LoreRecursable1763930000000 } from './1763930000000-LoreRecursable.js';
import { LoreTimedEffects1763940000000 } from './1763940000000-LoreTimedEffects.js';
import { LoreChance1763950000000 } from './1763950000000-LoreChance.js';
import { LoreGroup1763960000000 } from './1763960000000-LoreGroup.js';
import { Samplers1763970000000 } from './1763970000000-Samplers.js';
import { Documents1763980000000 } from './1763980000000-Documents.js';
import { DocumentPassagesUsed1763990000000 } from './1763990000000-DocumentPassagesUsed.js';
import { ThaiReadings1764000000000 } from './1764000000000-ThaiReadings.js';
import { SavedReplies1764010000000 } from './1764010000000-SavedReplies.js';
import { ReplaceRules1764020000000 } from './1764020000000-ReplaceRules.js';
import { UsageCharacters1764030000000 } from './1764030000000-UsageCharacters.js';
import { Voices1764040000000 } from './1764040000000-Voices.js';
import { AutoRead1764050000000 } from './1764050000000-AutoRead.js';
import { Expressions1764060000000 } from './1764060000000-Expressions.js';
import { MessagePartEmotion1764070000000 } from './1764070000000-MessagePartEmotion.js';
import { StoryBackdrop1764080000000 } from './1764080000000-StoryBackdrop.js';
import { BondLevels1764090000000 } from './1764090000000-BondLevels.js';
import { StartingBondLevels1764100000000 } from './1764100000000-StartingBondLevels.js';
import { SceneBondGates1764110000000 } from './1764110000000-SceneBondGates.js';
import { MemoryEmbedding1764120000000 } from './1764120000000-MemoryEmbedding.js';
import { MemoriesUsed1764130000000 } from './1764130000000-MemoriesUsed.js';
import { Beliefs1764140000000 } from './1764140000000-Beliefs.js';
import { StartingBeliefs1764150000000 } from './1764150000000-StartingBeliefs.js';
import { Accounts1764160000000 } from './1764160000000-Accounts.js';

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
    ReplyVersions1763810000000,
    TimeOfDay1763850000000,
    SnapshotSize1763860000000,
    Lore1763870000000,
    BranchLink1763880000000,
    AuthorsNote1763890000000,
    SittingOut1763900000000,
    LoreSecondaryKeywords1763910000000,
    LorePatterns1763920000000,
    LoreRecursable1763930000000,
    LoreTimedEffects1763940000000,
    LoreChance1763950000000,
    LoreGroup1763960000000,
    Samplers1763970000000,
    Documents1763980000000,
    DocumentPassagesUsed1763990000000,
    ThaiReadings1764000000000,
    SavedReplies1764010000000,
    ReplaceRules1764020000000,
    UsageCharacters1764030000000,
    Voices1764040000000,
    AutoRead1764050000000,
    Expressions1764060000000,
    MessagePartEmotion1764070000000,
    StoryBackdrop1764080000000,
    BondLevels1764090000000,
    StartingBondLevels1764100000000,
    SceneBondGates1764110000000,
    MemoryEmbedding1764120000000,
    MemoriesUsed1764130000000,
    Beliefs1764140000000,
    StartingBeliefs1764150000000,
    Accounts1764160000000,
];

import { CharacterEntity } from '../../model/story/entities/character.entity.js';
import { RoleEntity } from '../../model/story/entities/role.entity.js';
import { SceneEntity } from '../../model/story/entities/scene.entity.js';
import { StartingBondEntity } from '../../model/story/entities/starting-bond.entity.js';
import { StoryEntity } from '../../model/story/entities/story.entity.js';

// Every entity must be listed here, or @InjectRepository fails at boot.
export const entities = [StoryEntity, RoleEntity, CharacterEntity, StartingBondEntity, SceneEntity];

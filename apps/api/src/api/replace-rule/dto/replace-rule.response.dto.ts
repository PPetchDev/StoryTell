import { ApiProperty } from '@nestjs/swagger';

import type { ChatReplaceRule } from '../../../manager/replace-rule/chat-rules.js';
import type { ReplaceRuleResponse } from '../../../model/replace-rule/entities/replace-rule.entity.js';

export class ChatReplaceRuleDTO implements ChatReplaceRule {
    @ApiProperty({ description: 'Never trimmed.' })
    find: string;

    @ApiProperty({ description: 'May be empty: the match is removed.' })
    replace: string;

    @ApiProperty()
    regex: boolean;

    @ApiProperty()
    ignoreCase: boolean;

    @ApiProperty({ description: 'Applied to AI Messages as shown.' })
    onAi: boolean;

    @ApiProperty({ description: 'Applied to my Messages before sending.' })
    onMine: boolean;
}

export class ReplaceRuleDTO extends ChatReplaceRuleDTO implements ReplaceRuleResponse {
    @ApiProperty()
    id: number;
}

export class ListReplaceRulesResponseBodyDTO {
    @ApiProperty({ type: [ReplaceRuleDTO], description: 'The app-wide Replace rules, in apply order.' })
    replaceRules: ReplaceRuleDTO[];
}

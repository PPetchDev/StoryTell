import type { ReplaceRuleEntity, ReplaceRuleResponse } from '../../model/replace-rule/entities/replace-rule.entity.js';

/** A Replace rule as the Chat screen reads it (spec: "Chat detail"). */
export type ChatReplaceRule = Omit<ReplaceRuleResponse, 'id'>;

/** The Chat's rules in apply order, app-wide then the Story's, each by position; parked rules left out. */
export function chatReplaceRules(appRules: ReplaceRuleEntity[], storyRules: ReplaceRuleEntity[]): ChatReplaceRule[] {
    return [...appRules, ...storyRules]
        .filter((rule) => rule.onAi || rule.onMine)
        .map((rule) => {
            const { id: _id, ...fields } = rule.toResponse();
            return fields;
        });
}

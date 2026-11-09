import { Injectable } from '@nestjs/common';

import { InvalidReplaceRuleError, ReplaceRuleNotFoundError, TooManyReplaceRulesError } from '../../errors/replace-rule.errors.js';
import { InvalidOrderError, StoryNotFoundError } from '../../errors/story.errors.js';
import { REPLACE_RULES_MAX, ReplaceRuleEntity, ReplaceRuleResponse } from '../../model/replace-rule/entities/replace-rule.entity.js';
import { ReplaceRuleModelService } from '../../model/replace-rule/replace-rule.service.js';
import { StoryModelService } from '../../model/story/story.service.js';
import { StoryDetail, StoryManagerService } from '../story/story.service.js';
import { checkReplaceRule } from './replace-rule-check.js';

/** What a write may set; only the fields sent change. */
export interface ReplaceRuleFields {
    find?: string;
    replace?: string;
    regex?: boolean;
    ignoreCase?: boolean;
    onAi?: boolean;
    onMine?: boolean;
}

type RuleValues = Required<ReplaceRuleFields>;

const RULE_KEYS = ['find', 'replace', 'regex', 'ignoreCase', 'onAi', 'onMine'] as const;

/**
 * Replace rules (.scratch/saved-replies-and-replace-rules/spec.md: "Replace rules: storage and
 * API"), app-wide or per Story. Every create and update runs the save checks on the rule as it
 * would be stored; a refusal saves nothing, so the last saved version stays in force. App-wide
 * writes answer the app-wide list; a Story's answer the whole Story and count as saving it.
 */
@Injectable()
export class ReplaceRuleManagerService {
    constructor(
        private readonly ruleModel: ReplaceRuleModelService,
        private readonly storyModel: StoryModelService,
        private readonly storyManager: StoryManagerService,
    ) {}

    async listAppWide(): Promise<ReplaceRuleResponse[]> {
        return (await this.ruleModel.findByScope(null)).map((rule) => rule.toResponse());
    }

    async addAppWide(fields: ReplaceRuleFields & { find: string }): Promise<ReplaceRuleResponse[]> {
        await this.add(null, fields);
        return this.listAppWide();
    }

    async updateAppWide(id: number, fields: ReplaceRuleFields): Promise<ReplaceRuleResponse[]> {
        await this.update(null, id, fields);
        return this.listAppWide();
    }

    async removeAppWide(id: number): Promise<ReplaceRuleResponse[]> {
        await this.remove(null, id);
        return this.listAppWide();
    }

    async reorderAppWide(ids: number[]): Promise<ReplaceRuleResponse[]> {
        await this.reorder(null, ids);
        return this.listAppWide();
    }

    async addToStory(storyId: number, fields: ReplaceRuleFields & { find: string }): Promise<StoryDetail> {
        await this.requireStory(storyId);
        await this.add(storyId, fields);
        return this.storySaved(storyId);
    }

    async updateInStory(storyId: number, id: number, fields: ReplaceRuleFields): Promise<StoryDetail> {
        await this.requireStory(storyId);
        await this.update(storyId, id, fields);
        return this.storySaved(storyId);
    }

    async removeFromStory(storyId: number, id: number): Promise<StoryDetail> {
        await this.requireStory(storyId);
        await this.remove(storyId, id);
        return this.storySaved(storyId);
    }

    async reorderInStory(storyId: number, ids: number[]): Promise<StoryDetail> {
        await this.requireStory(storyId);
        await this.reorder(storyId, ids);
        return this.storySaved(storyId);
    }

    private async add(storyId: number | null, fields: ReplaceRuleFields & { find: string }): Promise<void> {
        const rules = await this.ruleModel.findByScope(storyId);
        if (rules.length >= REPLACE_RULES_MAX) throw new TooManyReplaceRulesError();
        const rule: RuleValues = { find: fields.find, replace: '', regex: false, ignoreCase: false, onAi: true, onMine: false };
        assignSent(rule, fields);
        await check(rule);
        const position = Math.max(-1, ...rules.map((other) => other.position)) + 1;
        await this.ruleModel.save({ ...rule, storyId, position });
    }

    private async update(storyId: number | null, id: number, fields: ReplaceRuleFields): Promise<void> {
        const rule = await this.find(storyId, id);
        assignSent(rule, fields);
        await check(rule);
        await this.ruleModel.save(rule);
    }

    private async remove(storyId: number | null, id: number): Promise<void> {
        await this.ruleModel.remove((await this.find(storyId, id)).id);
    }

    private async reorder(storyId: number | null, ids: number[]): Promise<void> {
        const rules = await this.ruleModel.findByScope(storyId);
        const wanted = new Set(rules.map((rule) => rule.id));
        if (ids.length !== wanted.size || !ids.every((id) => wanted.delete(id))) {
            throw new InvalidOrderError('Replace rules', storyId === null ? 'app' : 'story');
        }
        await this.ruleModel.setOrder(ids);
    }

    private async find(storyId: number | null, id: number): Promise<ReplaceRuleEntity> {
        const rule = (await this.ruleModel.findByScope(storyId)).find((candidate) => candidate.id === id);
        if (!rule) throw new ReplaceRuleNotFoundError();
        return rule;
    }

    private async requireStory(storyId: number): Promise<void> {
        if (!(await this.storyModel.exists(storyId))) throw new StoryNotFoundError();
    }

    private async storySaved(storyId: number): Promise<StoryDetail> {
        await this.storyModel.touch(storyId);
        return this.storyManager.getStory(storyId);
    }
}

function assignSent(rule: RuleValues, fields: ReplaceRuleFields): void {
    for (const key of RULE_KEYS) {
        const value = fields[key];
        if (value !== undefined) Object.assign(rule, { [key]: value });
    }
}

async function check(rule: RuleValues): Promise<void> {
    const reason = await checkReplaceRule(rule);
    if (reason !== null) throw new InvalidReplaceRuleError(reason);
}

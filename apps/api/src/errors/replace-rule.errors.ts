import { AppError } from './app-error.js';
import { REPLACE_RULES_MAX } from '../model/replace-rule/entities/replace-rule.entity.js';

/** One more Replace rule than a scope (app-wide, or one Story) holds. */
export class TooManyReplaceRulesError extends AppError {
    constructor() {
        super('422.008.004', `You can keep at most ${REPLACE_RULES_MAX} Replace rules here. Remove one first.`);
    }
}

/** A Replace rule id that isn't in that scope. */
export class ReplaceRuleNotFoundError extends AppError {
    constructor() {
        super('404.008.005', 'Replace rule not found.');
    }
}

/**
 * A rule refused at save (spec: "Checks at save"): a regex that doesn't compile, a pattern that
 * matches empty text or is too slow, or an On my Messages rule that changes its own result again.
 * The message is the plain reason the editor shows under Find.
 */
export class InvalidReplaceRuleError extends AppError {
    constructor(reason: string) {
        super('422.008.006', reason);
    }
}

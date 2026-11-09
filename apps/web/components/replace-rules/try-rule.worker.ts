/// <reference lib="webworker" />
import { applyReplaceRules, ReplaceRuleLogic } from '@/lib/replace-rules';

/*
 * "Try it" runs a rule here, off the page's thread (.scratch/saved-replies-and-replace-rules/spec.md:
 * "Management UI"): a bad regex can hang whatever runs it, and the page terminates this worker
 * when it takes too long. It says it is ready first, so the time limit doesn't count its loading.
 */
const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = (event: MessageEvent<{ rule: ReplaceRuleLogic; text: string }>) => {
    scope.postMessage({ output: applyReplaceRules(event.data.text, [event.data.rule]) });
};

scope.postMessage({ ready: true });

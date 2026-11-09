import { Worker } from 'node:worker_threads';

import { applyReplaceRules, compileReplaceRule, ReplaceRuleLogic } from './apply-replace-rules.js';

/** A rule as the save check reads it: what it does, and whether it runs on my Messages. */
export interface CheckedReplaceRule extends ReplaceRuleLogic {
    onMine: boolean;
}

/** How long a regex rule may run over all the probe texts (spec: "Checks at save"). */
export const CHECK_TIME_LIMIT_MS = 250;

export const MATCHES_EMPTY = 'This would match between every letter';
export const TOO_SLOW = 'This pattern is too slow';
export const CHANGES_TWICE = 'This rule would change your text again if run twice';

const ENGLISH = `"You're late," Mira said, not looking up from the logbook. *She turns a page, slowly.*

The lamp room smelled of oil and salt. Rain ran down the glass in long, crooked lines, and somewhere below the sea threw itself at the rocks again and again. "The ferry was late," Ash said. "So was the storm."

*Mira snorts.* "The storm is never late. It's the only thing on this island that keeps its word." She closed the book and looked at him at last: grey eyes, tired, a shiver of a smile at one corner of her mouth. 'Boots off, keeper. You're dripping on my floor.'

Kai leaned in the doorway, grinning. "Don't mind her. She's been like this since the lamp went out — three nights, four? I've lost count." He tossed a coil of rope onto the bench. *It lands with a wet slap.* "Anyway. Supper's fish. Supper's always fish."

(OOC: the next scene should move to the tower.)
1. Check the wick.
2. Trim it.
3. Light it before dark!

She said: "Fine. Fine, fine, fine." And then, quieter, almost to herself — "We'll see how long this one lasts."`;

const THAI = `"มาช้านะ" มิราพูดโดยไม่เงยหน้าจากสมุดบันทึก *เธอพลิกหน้ากระดาษช้า ๆ*

ห้องตะเกียงมีกลิ่นน้ำมันและเกลือ ฝนไหลลงกระจกเป็นเส้นยาวคดเคี้ยว และที่ไหนสักแห่งข้างล่าง ทะเลซัดเข้าหาโขดหินครั้งแล้วครั้งเล่า "เรือข้ามฟากมาช้า" แอชตอบ "พายุก็เหมือนกัน"

*มิราหัวเราะในลำคอ* "พายุไม่เคยมาช้าหรอก มันเป็นสิ่งเดียวบนเกาะนี้ที่รักษาคำพูด" เธอปิดสมุดแล้วมองเขาในที่สุด ดวงตาสีเทาดูเหนื่อยล้า มุมปากมีรอยยิ้มจาง ๆ 'ถอดรองเท้าก่อน ผู้ดูแลประภาคาร น้ำหยดเต็มพื้นแล้ว'`;

/**
 * What the save check runs a rule over: a long English passage with quotes, asterisks and line
 * breaks; a Thai passage; long runs of one letter, of spaces, and of a letter followed by one odd
 * character, which is what makes a catastrophic pattern like `(a+)+$` take forever.
 */
export const PROBE_TEXTS: readonly string[] = [
    ENGLISH,
    THAI,
    'a'.repeat(1_000),
    ' '.repeat(1_000),
    `${'a'.repeat(1_000)}!`,
    `${' '.repeat(1_000)}!`,
    `${'ab'.repeat(500)}\n`,
];

/** The texts the twice-run check runs a rule over: the probes, its own `find` for a plain rule, and its own replacement. */
function twiceRunInputs(rule: CheckedReplaceRule): string[] {
    return [...PROBE_TEXTS, ...(rule.regex ? [] : [rule.find]), rule.replace];
}

/**
 * The regex half of the check, as plain JavaScript for a worker thread: the only reliable way
 * to stop a runaway regex is to terminate the thread running it. It says it has started before
 * running, so the time limit doesn't count the thread's start-up.
 */
const WORKER_SOURCE = `
const { parentPort, workerData } = require('node:worker_threads');
const { find, flags, replace, onMine, probes, twiceInputs } = workerData;
parentPort.postMessage('started');
const pattern = new RegExp(find, flags);
let result = null;
if (new RegExp(find, flags.replace('g', '')).test('')) result = 'empty';
for (const text of probes) {
    if (result) break;
    for (const match of text.matchAll(pattern)) {
        if (match[0] === '') { result = 'empty'; break; }
    }
    text.replace(pattern, replace);
}
if (!result && onMine) {
    for (const text of twiceInputs) {
        const once = text.replace(pattern, replace);
        if (once.replace(pattern, replace) !== once) { result = 'twice'; break; }
    }
}
parentPort.postMessage(result === null ? 'ok' : result);
`;

type WorkerVerdict = 'ok' | 'empty' | 'twice' | 'slow';

function runRegexCheck(rule: CheckedReplaceRule): Promise<WorkerVerdict> {
    return new Promise((resolve, reject) => {
        const worker = new Worker(WORKER_SOURCE, {
            eval: true,
            workerData: {
                find: rule.find,
                flags: rule.ignoreCase ? 'gi' : 'g',
                replace: rule.replace,
                onMine: rule.onMine,
                probes: PROBE_TEXTS,
                twiceInputs: twiceRunInputs(rule),
            },
        });
        let limit: ReturnType<typeof setTimeout> | undefined;
        // A thread that never even starts is a broken box, not a slow pattern.
        const startLimit = setTimeout(() => finish(() => reject(new Error('The Replace rule check did not start.'))), 10_000);
        let done = false;
        const finish = (settle: () => void) => {
            if (done) return;
            done = true;
            clearTimeout(startLimit);
            clearTimeout(limit);
            void worker.terminate();
            settle();
        };
        worker.on('message', (message: string) => {
            if (message === 'started') {
                clearTimeout(startLimit);
                limit = setTimeout(() => finish(() => resolve('slow')), CHECK_TIME_LIMIT_MS);
                return;
            }
            finish(() => resolve(message as WorkerVerdict));
        });
        worker.on('error', (error) => finish(() => reject(error)));
    });
}

/**
 * The checks a rule must pass to be saved (spec: "Checks at save"): a regex that compiles; no
 * match of empty text; fast enough on the probe texts; and, with On my Messages on, the same
 * result when run a second time on its own output. Answers why it is refused, or null.
 */
export async function checkReplaceRule(rule: CheckedReplaceRule): Promise<string | null> {
    if (!rule.regex) {
        // A literal match can't be slow or empty (`find` is never empty), so it runs here.
        if (!rule.onMine) return null;
        const twice = twiceRunInputs(rule).some((text) => {
            const once = applyReplaceRules(text, [rule]);
            return applyReplaceRules(once, [rule]) !== once;
        });
        return twice ? CHANGES_TWICE : null;
    }
    try {
        compileReplaceRule(rule);
    } catch (error) {
        // Compiling never runs the pattern, so it can't hang.
        return (error as Error).message;
    }
    const verdict = await runRegexCheck(rule);
    if (verdict === 'empty') return MATCHES_EMPTY;
    if (verdict === 'slow') return TOO_SLOW;
    if (verdict === 'twice') return CHANGES_TWICE;
    return null;
}

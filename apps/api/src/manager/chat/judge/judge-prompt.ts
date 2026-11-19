import { UnparseableOutputError } from '../../../errors/model-gateway.errors.js';
import { TimeOfDay, TIMES_OF_DAY } from '../../../model/chat/entities/chat.entity.js';
import { BOND_AXES, bondAxisScale, BondLevels, bondLevelsInWords, isBondLevel } from '../../../model/ledger/bond-axes.js';
import { Emotion, isEmotion } from '../../../model/story/emotion.js';
import { PromptMessage } from '../../../service/model-gateway/model-gateway.js';
import { exchangeUserLine } from '../exchange.js';
import { PASSED_BY_REPLIES } from '../scene-replies.js';
import { JudgedSuddenEvent, readJudgedSuddenEvent } from '../sudden-event/sudden-event.js';
import { DETAILS_EXTRA_TOKENS, DETAILS_SHAPE, JudgedDetails, readJudgedDetails } from '../details/details.js';
import { ENDING_EXTRA_TOKENS, JudgedEnding, readJudgedEnding } from '../ending/ending.js';
import { FACTS_EXTRA_TOKENS, JudgedFacts, readJudgedFacts } from '../details/facts.js';
import { JudgedNow, NOW_EXTRA_TOKENS, readJudgedNow } from '../details/now-notes.js';
import { ReplyPart } from '../turn/reply-parser.js';
import { JudgedRollOffer, readJudgedRollOffer, ROLL_OFFER_EXTRA_TOKENS } from '../roll-offer/roll-offer.js';
import { readJudgedSecrets, SECRETS_EXTRA_TOKENS } from '../secrets/secrets.js';

/**
 * The Bond, Arc, Scene and Time of day judge's prompt and output (spec: "Background judge"), from the turn
 * prototype after its re-judge fix. Pure logic over plain inputs: the manager gathers them.
 */

export interface JudgeCastMember {
    name: string;
    personality: string;
    /** The Arc directions copied into the Chat; empty when the author wrote none. */
    arcDirection: string;
    /** Sitting out of this Chat (.scratch/speaker-controls/spec.md): not in the story now, so no Bond or Arc changes. */
    sittingOut?: boolean;
}

export interface JudgeBond {
    fromName: string;
    /** null means toward the user. */
    toName: string | null;
    label: string;
    description: string;
    /** Its levels on the Bond axes; null or left out while it has none ("levels not set yet"). */
    levels?: BondLevels | null;
}

export interface JudgeArc {
    name: string;
    steps: string[];
}

export interface JudgePromptInput {
    cast: JudgeCastMember[];
    /** The worn identity's name. The judge refers to the user as "user". */
    identityName: string;
    bonds: JudgeBond[];
    arcs: JudgeArc[];
    /** `gatesOnly`: the Scene has Bond gates and no condition, so the app alone decides (.scratch/bond-axes/spec.md). */
    scene: {
        name: string;
        /**
         * What the Scene is about, as the author wrote it, so the condition is read as part of it: a
         * "real clue" is one about what the Scene is about. Blank or left out: no line, the section as before.
         */
        situation?: string;
        moveOnCondition: string;
        gatesOnly?: boolean;
        /**
         * The replies in the Scene, the one being judged included (.scratch/scene-flow/spec.md);
         * from `PASSED_BY_REPLIES` the Current Scene section adds the passed-by rule. Left out, it never does.
         */
        replies?: number;
        /**
         * Where a passed-by Scene goes, shown with the passed-by rule: the next Scene in order, or null
         * on the last Scene (free play). Left out: no line.
         */
        next?: { name: string; situation: string } | null;
    } | null;
    /** The Chat's Time of day; null while the story has not made one clear. Left out, it reads as null. */
    timeOfDay?: TimeOfDay | null;
    /**
     * The Chat's Story so far, so a part of a Scene's condition met long before the recent Messages
     * is in view (.scratch/scene-flow/spec.md, "The Judge's Scene rule"). Null or left out: no section.
     */
    storySoFar?: string | null;
    /** The Messages before the exchange, oldest first, as `Name: text` or the AI's `@Name:` text. */
    recent: string[];
    /** The exchange to judge: what the user wrote (null after a Continue) and the AI's reply as `@Name:` text. */
    userText: string | null;
    aiText: string;
    /**
     * The AI reply's parts, given only when the Story has an Expression (.scratch/expressions/spec.md,
     * "The Judge tags each line"): its speech lines are then numbered in place of `aiText`, and the
     * judge tags each with an emotion. Left out, the prompt is exactly as it was before Expressions.
     */
    expressionParts?: ReplyPart[];
    /**
     * The Sudden events section (.scratch/sudden-events/spec.md), already worded: the events that
     * can start, or the one under way with its rule. Null or left out for a Story with nothing to
     * say, and the prompt is then exactly as it was before Sudden events.
     */
    suddenEventSection?: string | null;
    /**
     * The Place, weather and outfits section (.scratch/info-box/spec.md), already worded, with its
     * rule. It goes last, after the exchange it is read from. Left out, the prompt is as it was before.
     */
    detailsSection?: string | null;
    /**
     * The Endings section (.scratch/endings/spec.md), already worded, with its rule: the Endings the
     * Chat can still reach. It goes after the exchange, before the details section. Left out, the
     * prompt is as it was before.
     */
    endingSection?: string | null;
    /**
     * The Established facts section (.scratch/story-quality/spec.md), already worded, with its rule:
     * the Chat's facts as they stand. It goes after the details section. Left out, the prompt
     * is as it was before.
     */
    factsSection?: string | null;
    /**
     * The Now notes section (.scratch/growing-cards/spec.md), already worded, with its rule. It goes
     * last, after the Established facts section. Left out, the prompt is as it was before.
     */
    nowSection?: string | null;
}

/** How a Character sitting out is marked in the judge's cast (.scratch/speaker-controls/spec.md). */
export const SITTING_OUT_MARK =
    ' [SITTING OUT: not in the story now. No Bond changes from them and no Arc steps for them; others may still change how they feel toward them.]';

/** How many Messages before the exchange the judge sees for context. */
export const JUDGE_CONTEXT_MESSAGES = 6;
export const JUDGE_MAX_TOKENS = 700;
/** What answering about a Sudden event adds to the judge's token cap. */
export const SUDDEN_EVENT_EXTRA_TOKENS = 100;
/** What tagging the lines adds to the judge's token cap. */
export const EXPRESSION_EXTRA_TOKENS = 200;

/** What each emotion means to the judge (.scratch/expressions/spec.md, "The emotions"). */
export const EMOTION_MEANINGS: Record<Emotion, string> = {
    neutral: 'calm, plain talk, no strong feeling',
    joy: 'happy, amused, laughing, pleased, excited',
    love: 'tender, affectionate, warm, fond',
    embarrassment: 'shy, embarrassed, ashamed, awkward',
    sadness: 'sad, hurt, grieving, disappointed',
    anger: 'angry, annoyed, disgusted, contemptuous',
    fear: 'afraid, nervous, anxious',
    surprise: 'surprised, shocked, confused, realising',
    // An intimate scene between adults (.scratch/stage-pictures/spec.md), in the order such a scene goes.
    teasing: 'only in an intimate or sexual moment: teasing, flirting, playfully seductive',
    desire: 'only in an intimate or sexual moment: aroused, wanting, seductive',
    flustered: 'only in an intimate or sexual moment: flustered and aroused, shy, breathless',
    longing: 'only in an intimate or sexual moment: yearning, pleading, aching to be closer',
    passion: 'only in an intimate or sexual moment: in its heat, overwhelmed, breathless with pleasure',
    afterglow: 'only in an intimate or sexual moment: just after it, satisfied, blissful, relaxed',
};

const SYSTEM = `You track hidden feelings (Bonds) and lasting personality changes (Arcs) for Characters in an interactive story. You judge only what CHANGED in the latest exchange.

Bond rules:
- A Bond is directional: one Character's feelings toward the user ("user") or toward another Character. Shape: a 1–3 word English label plus a 1–2 sentence description, and a level on four axes:
${BOND_AXES.map((axis) => `  ${bondAxisScale(axis)}`).join('\n')}
- Bonds shift GRADUALLY. Expect NO change on most turns — a normal conversation, flirting, or a feeling simply growing a little stronger is not a new label.
- Change a Bond's label only when the feeling changes in KIND (e.g. suspicion → trust, desire → betrayal), or on a major event (betrayal, rescue, confession, first intimacy, a serious threat). Never just rephrase or intensify the current label.
- Move a level only when the latest exchange clearly moves that feeling. Each axis moves at most ONE step per turn; Tension may rise two steps but falls only one. A change may move levels and keep the same label.
- When a Bond shows "levels not set yet", give a change for it setting all four levels to where the feeling stands now, keeping its label unless the feeling changed.
- "levels" gives the NEW level of each axis, as a number.
- At most one change per Bond per turn.
- Only Characters who witnessed the event, or plausibly learned of it, can change.
- Create a new pair only where real feelings have formed.
- Every change must cite the event in the latest exchange that caused it.

Arc rules:
- An Arc step is a lasting change to a Character's personality. It needs a SIGNIFICANT event you can cite and is far rarer than a Bond change — a Character gets perhaps one to three steps in a whole Chat.
- Never add a step that restates, continues or "deepens" the Character's last step. A new step needs a new event causing a DIFFERENT change.
- The core definition is never rewritten; you only add steps. A step can reverse an earlier one.

Scene rule:
- Judge whether the current Scene's move-on condition has now been met, with the Bonds and the story so far in view. Be strict about whether it happened, not about its wording: met means it has fully HAPPENED in the story by the end of the latest exchange, in substance, in any words or order.
- A part of the condition that happened in an earlier exchange still counts.
- Not met: getting closer, someone about to do it, saying they could or will do it, agreeing to do it later, or the story setting it up.
- When the condition names who must act (the user or a Character), only that one doing it counts. Someone else revealing or doing it instead does not.
- When the condition has several parts, every part must have happened.
- When in doubt, move_on is false.
- Write the reason first, saying what has and has not happened yet, then decide move_on from it.

Time of day rule:
- Give the in-story time of day only when the latest exchange moves it on to a new one, or first makes it clear: one of "dawn", "morning", "noon", "afternoon", "evening" or "night". Otherwise null. Read it from the story (light, meals, sleep, the sky); never guess.

Reply with JSON only:
{"bond_changes":[{"from":"Name","to":"user|Name","label":"...","description":"...","levels":{"trust":0,"affection":0,"desire":0,"tension":0},"cause":"..."}],
 "arc_steps":[{"character":"Name","step":"...","cause":"..."}],
 "scene":{"reason":"...","move_on":false,"passed_by":false,"went_to":null},
 "time_of_day":null}
Empty arrays when nothing changed.`;

const EXPRESSION_RULE = `Expression rule:
- In the latest exchange, each line a Character speaks is numbered: [1], [2], and so on. For each numbered line in the latest exchange, give the emotion its speaker shows in it, one of:
${Object.entries(EMOTION_MEANINGS)
    .map(([emotion, meaning]) => `  - "${emotion}": ${meaning}`)
    .join('\n')}
- When unsure, "neutral".

`;

/** The system prompt when the lines are tagged: the Expression rule before the reply shape, and the shape's `expressions` field. */
const SYSTEM_WITH_EXPRESSIONS = SYSTEM.replace('Reply with JSON only:', `${EXPRESSION_RULE}Reply with JSON only:`).replace(
    ' "time_of_day":null}',
    ' "time_of_day":null,\n "expressions":[{"line":1,"emotion":"joy"}]}',
);

/**
 * The reply shape with `facts` and `slips`, when the facts section is sent (every judgement on live,
 * so the system message still never changes from one call to the next). Their rule is in the user
 * message, but on DeepSeek V4 Flash a field only the user message asked for came back in no run of
 * five, and in four of five once the shape named it (.scratch/story-quality/spec.md, "Real-model check").
 */
function withFactsShape(system: string): string {
    return system.replace(/\}\nEmpty arrays when nothing changed\.$/, ',\n "facts":[{"topic":"...","fact":"..."}],\n "slips":[{"topic":"...","said":"..."}]}\nEmpty arrays when nothing changed.');
}
const SYSTEM_WITH_FACTS = withFactsShape(SYSTEM);
const SYSTEM_WITH_EXPRESSIONS_AND_FACTS = withFactsShape(SYSTEM_WITH_EXPRESSIONS);
if (SYSTEM_WITH_FACTS === SYSTEM || SYSTEM_WITH_EXPRESSIONS_AND_FACTS === SYSTEM_WITH_EXPRESSIONS) throw new Error('judge prompt: the reply shape no longer ends as expected');

/**
 * A Passed-by Scene (.scratch/scene-flow/spec.md, "Passed by"): offered in the Current Scene section
 * only from `PASSED_BY_REPLIES` replies in the Scene, so the system message stays the same. Its
 * `went_to` becomes the Scene advance's event; the reason, which restates the condition and can get
 * it wrong, is kept only for the log.
 */
export const PASSED_BY_RULE =
    'Passed-by rule: This Scene has gone on a long time. Set "passed_by": true only when the story has clearly gone somewhere the move-on condition can\'t happen soon, and nothing in the latest exchanges is heading back toward it; then also give "went_to": one short sentence saying where the story went instead, never what has or hasn\'t happened. When in doubt, passed_by is false.';

/**
 * The passed-by rule, then where passing by goes. Seen in live Chat 2: three Scenes in a row were
 * passed by during the wedding night and the morning after, and each next Scene needed a road the
 * story never took, so the Chat landed in a winter barn while the story stayed at the summer market.
 */
function passedByRule(next: { name: string; situation: string } | null | undefined): string {
    const lines = [
        PASSED_BY_RULE,
        'A private interlude (a love scene, a night together, a meal, a bath, a rest) is not the story going somewhere else: the story comes back from it.',
    ];
    if (next === null) lines.push('Passed by, the story goes on in free play: this is the last Scene.');
    if (next) {
        lines.push(
            `Passed by, the story goes on to the next Scene: ${next.name}.${next.situation.trim() ? ` ${next.situation.trim()}` : ''}`,
            'Set passed_by only when that Scene can begin from where the story is now, not when it needs a place, a season or an event the story has not reached.',
        );
    }
    return `\n${lines.join('\n')}`;
}

/**
 * What the Scene is about, and that its condition is read as part of it; nothing for a Scene with no
 * situation, so its section is as before. Seen in dev Chat 2: "The user catches a real clue" in the
 * hunt for the herd was met by a hint about river-stones for a gift.
 */
function sceneSituation(scene: { situation?: string; moveOnCondition: string; gatesOnly?: boolean }): string {
    const situation = scene.situation?.trim();
    if (!situation) return '';
    // Only a written condition is read: none, or gates only, has no words to fit.
    const rule = scene.gatesOnly || scene.moveOnCondition.trim() === ''
        ? ''
        : '\nRead the condition as part of what this Scene is about: something that only fits its words, about another matter, does not meet it.';
    return `\nWhat this Scene is about: ${situation}${rule}`;
}

/** The reply as `partsToText` writes it, with each speech line numbered in order: `[1] @Name: …`. */
export function numberedReplyText(parts: ReplyPart[]): string {
    let line = 0;
    return parts
        .map((part) => (part.kind === 'speech' ? `[${++line}] @${part.speakerName}: ${part.text}` : part.text))
        .join('\n\n');
}

function buildJudgePromptCore(input: JudgePromptInput): { messages: PromptMessage[]; maxTokens: number } {
    const cast = input.cast
        .map(
            (member) =>
                `- ${member.name}: ${member.personality}${
                    member.arcDirection.trim() ? ` (Author's Arc direction: ${member.arcDirection})` : ''
                }${member.sittingOut ? SITTING_OUT_MARK : ''}`,
        )
        .join('\n');
    const bonds =
        input.bonds
            .map(
                (bond) =>
                    `- ${bond.fromName} → ${bond.toName ?? 'user'}: "${bond.label}" — ${bond.description} (${
                        bond.levels ? bondLevelsInWords(bond.levels) : 'levels not set yet'
                    })`,
            )
            .join('\n') || '(none yet — everyone is a stranger)';
    const arcs = input.arcs
        .map((arc) => `- ${arc.name}: ${arc.steps.join(' → ') || 'no steps yet'}`)
        .join('\n');
    const user = `# Cast
${cast}
The user plays ${input.identityName} (refer to them as "user").

# Current Bonds
${bonds}

# Arc steps so far
${arcs}

# Current Scene
${input.scene ? `${input.scene.name}. Move-on condition: ${input.scene.gatesOnly ? '(gates only)' : input.scene.moveOnCondition || '(none)'}${sceneSituation(input.scene)}${(input.scene.replies ?? 0) >= PASSED_BY_REPLIES ? passedByRule(input.scene.next) : ''}` : 'none'}

# Time of day
${input.timeOfDay ?? 'not yet known'}

${input.suddenEventSection ? `${input.suddenEventSection}\n\n` : ''}${input.storySoFar?.trim() ? `# Story so far (earlier events, summarised)\n${input.storySoFar.trim()}\n\n` : ''}# Recent story (context)
${input.recent.join('\n\n') || '(start)'}

# LATEST EXCHANGE (judge this)
${exchangeUserLine(input.identityName, input.userText)}

${input.expressionParts ? numberedReplyText(input.expressionParts) : input.aiText}${input.endingSection ? `\n\n${input.endingSection}` : ''}${input.detailsSection ? `\n\n${input.detailsSection}` : ''}${input.factsSection ? `\n\n${input.factsSection}` : ''}${input.nowSection ? `\n\n${input.nowSection}` : ''}`;
    return {
        messages: [
            {
                role: 'system',
                content: input.factsSection
                    ? input.expressionParts
                        ? SYSTEM_WITH_EXPRESSIONS_AND_FACTS
                        : SYSTEM_WITH_FACTS
                    : input.expressionParts
                      ? SYSTEM_WITH_EXPRESSIONS
                      : SYSTEM,
            },
            { role: 'user', content: user },
        ],
        maxTokens:
            JUDGE_MAX_TOKENS +
            (input.expressionParts ? EXPRESSION_EXTRA_TOKENS : 0) +
            (input.suddenEventSection ? SUDDEN_EVENT_EXTRA_TOKENS : 0) +
            (input.endingSection ? ENDING_EXTRA_TOKENS : 0) +
            (input.detailsSection ? DETAILS_EXTRA_TOKENS : 0) +
            (input.factsSection ? FACTS_EXTRA_TOKENS : 0) +
            (input.nowSection ? NOW_EXTRA_TOKENS : 0),
    };
}

export interface JudgedBondChange {
    from: string;
    to: string;
    label: string;
    description: string;
    cause: string;
    /** The new level of each axis the judge gave, whole and in range; null when it gave no `levels` object. */
    levels: Partial<BondLevels> | null;
}

export interface JudgedArcStep {
    character: string;
    step: string;
    cause: string;
}

export interface JudgedScene {
    moveOn: boolean;
    /** The story has passed the Scene by (.scratch/scene-flow/spec.md); the parser always sets it, false when not given. */
    passedBy?: boolean;
    reason: string;
    /** Where the story went when it passed the Scene by; the parser always sets it, '' when not given. */
    wentTo?: string;
}

/** The judge's output, read loosely: every item that is not an object with the fields is dropped. */
export interface Judgement {
    bondChanges: JudgedBondChange[];
    arcSteps: JudgedArcStep[];
    /** One entry per move-on signal the judge gave; the backend applies at most one. */
    scenes: JudgedScene[];
    /** The Time of day the story moved on to; null when the judge gave none (unchanged). */
    timeOfDay: TimeOfDay | null;
    /** The emotion of each numbered speech line, as written; empty when the judge gave none. */
    expressions: JudgedExpression[];
    /** What it said about Sudden events (.scratch/sudden-events/spec.md); null or left out when nothing readable. */
    suddenEvent?: JudgedSuddenEvent | null;
    /** The Place, the Weather and the Outfits it gave (.scratch/info-box/spec.md); null or left out when none. */
    details?: JudgedDetails | null;
    /** The Ending it says the story reached (.scratch/endings/spec.md); null or left out when none. */
    ending?: JudgedEnding | null;
    /** The facts and slips it gave (.scratch/story-quality/spec.md); null or left out when none. */
    facts?: JudgedFacts | null;
    /** The Now notes it gave (.scratch/growing-cards/spec.md); empty or left out when none. */
    now?: JudgedNow[];
}

/** One numbered line's emotion (.scratch/expressions/spec.md). */
export interface JudgedExpression {
    line: number;
    emotion: Emotion;
}

const str = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/** Reads the judge's JSON. Throws `UnparseableOutputError` when there is no JSON object to read. */
function parseJudgementCore(text: string): Judgement {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new UnparseableOutputError('The judge wrote no JSON object.');
    let json: unknown;
    try {
        json = JSON.parse(match[0]);
    } catch (error) {
        throw new UnparseableOutputError(`The judge's JSON could not be read: ${(error as Error).message}`);
    }
    if (!isObject(json)) throw new UnparseableOutputError('The judge wrote no JSON object.');

    const bondChanges = list(json.bond_changes).flatMap((item): JudgedBondChange[] =>
        isObject(item) && str(item.from) && str(item.to) && str(item.label)
            ? [
                  {
                      from: str(item.from),
                      to: str(item.to),
                      label: str(item.label),
                      description: str(item.description),
                      cause: str(item.cause),
                      levels: readLevels(item.levels),
                  },
              ]
            : [],
    );
    const arcSteps = list(json.arc_steps).flatMap((item): JudgedArcStep[] =>
        isObject(item) && str(item.character) && str(item.step)
            ? [{ character: str(item.character), step: str(item.step), cause: str(item.cause) }]
            : [],
    );
    const scenes = (Array.isArray(json.scene) ? json.scene : [json.scene]).flatMap((item): JudgedScene[] =>
        isObject(item)
            ? [{ moveOn: item.move_on === true, passedBy: item.passed_by === true, reason: str(item.reason), wentTo: str(item.went_to) }]
            : [],
    );
    // Read loosely: an item without a whole `line` or a known emotion (any case) is dropped.
    const expressions = list(json.expressions).flatMap((item): JudgedExpression[] => {
        if (!isObject(item) || typeof item.line !== 'number' || !Number.isInteger(item.line)) return [];
        const emotion = str(item.emotion).toLowerCase();
        return isEmotion(emotion) ? [{ line: item.line, emotion }] : [];
    });
    return { bondChanges, arcSteps, scenes, timeOfDay: readTimeOfDay(json.time_of_day), expressions, suddenEvent: readJudgedSuddenEvent(json.sudden_event), details: readJudgedDetails(detailsWithGoals(json.details, json.goals)), ending: readJudgedEnding(json.ending), facts: readJudgedFacts(json.facts, json.slips), ...withNow(readJudgedNow(json.details, json.now)) };
}

/** The Now notes as a field of the judgement only when there are some, so a judgement without them reads as before. */
function withNow(now: JudgedNow[]): { now?: JudgedNow[] } {
    return now.length > 0 ? { now } : {};
}

/** Read loosely: an axis whose level is not a whole number in its range, or an unknown axis, is ignored. */
function readLevels(value: unknown): Partial<BondLevels> | null {
    if (!isObject(value) || Array.isArray(value)) return null;
    const levels: Partial<BondLevels> = {};
    for (const axis of BOND_AXES) {
        const level = value[axis];
        if (isBondLevel(axis, level)) levels[axis] = level;
    }
    return levels;
}

/** One of the six, in any case; a missing field, a null or anything else means unchanged. */
function readTimeOfDay(value: unknown): TimeOfDay | null {
    const time = str(value).toLowerCase();
    return (TIMES_OF_DAY as readonly string[]).includes(time) ? (time as TimeOfDay) : null;
}

/**
 * The judgement's details with any Goals it gave outside them (.scratch/character-minds/spec.md):
 * the rule asks for "goals" inside "details", but a top-level "goals" means the same and is read too.
 */
function detailsWithGoals(details: unknown, goals: unknown): unknown {
    if (!Array.isArray(goals)) return details;
    const base = typeof details === 'object' && details !== null && !Array.isArray(details) ? (details as Record<string, unknown>) : {};
    return { ...base, goals: [...(Array.isArray(base.goals) ? base.goals : []), ...goals] };
}

// ---------------------------------------------------------------------------------------------
// Roll offers (.scratch/judge-rolls/spec.md). Kept in a section of their own: the prompt and the
// judgement are built as before, then the offer's section, shape, tokens and field are added here.
// ---------------------------------------------------------------------------------------------

/** What a judgement asking about a Roll offer adds to the prompt's input. */
export interface RollOfferJudgeInput {
    /**
     * The "# Roll offer" section (`judgeRollOfferSection`), sent only when an offer is allowed for
     * this reply. It goes last. Null or left out: no section, and the user message is as before.
     */
    rollOfferSection?: string | null;
}

/**
 * The reply shape with `"roll_offer":null`, on the system message sent with the facts section:
 * every judgement on live, whether or not an offer is allowed, so the system message stays the same
 * from call to call. As with `withFactsShape`, a field the user message alone asks for is not
 * returned by DeepSeek V4 Flash. Null in the shape, not an example, so the default is no offer.
 */
function withRollOfferShape(system: string): string {
    return system.replace(/\}\nEmpty arrays when nothing changed\.$/, ',\n "roll_offer":null}\nEmpty arrays when nothing changed.');
}
const ROLL_OFFER_SYSTEMS = new Map([SYSTEM_WITH_FACTS, SYSTEM_WITH_EXPRESSIONS_AND_FACTS].map((system) => [system, withRollOfferShape(system)]));
if ([...ROLL_OFFER_SYSTEMS].some(([before, after]) => before === after)) throw new Error('judge prompt: the reply shape no longer ends as expected');

export function buildJudgePrompt(input: JudgePromptInput & RollOfferJudgeInput & SecretsJudgeInput): { messages: PromptMessage[]; maxTokens: number } {
    const prompt = buildJudgePromptCore(input);
    const section = input.rollOfferSection?.trim();
    const secrets = input.secretsShape ? input.secretsSection?.trim() : undefined;
    const sections = [section, secrets].filter((text): text is string => !!text);
    return {
        messages: prompt.messages.map((message) => {
            if (message.role === 'system') {
                const offered = ROLL_OFFER_SYSTEMS.get(message.content) ?? message.content;
                const content = input.secretsShape ? withSecretsShape(offered) : offered;
                return { ...message, content: input.detailsSection ? withDetailsShape(content) : content };
            }
            return sections.length > 0 && message.role === 'user' ? { ...message, content: [message.content, ...sections].join('\n\n') } : message;
        }),
        maxTokens: prompt.maxTokens + (section ? ROLL_OFFER_EXTRA_TOKENS : 0) + (secrets ? SECRETS_EXTRA_TOKENS : 0),
    };
}

/** The judgement with the Roll offer and the Secret reveals it gave, if any; read loosely, so anything else is none. */
export function parseJudgement(text: string): Judgement & { rollOffer?: JudgedRollOffer | null; secretsRevealed?: number[] } {
    const judgement = parseJudgementCore(text);
    // The core has already read the JSON, so this match parses.
    const json = JSON.parse(text.match(/\{[\s\S]*\}/)![0]) as Record<string, unknown>;
    const rollOffer = readJudgedRollOffer(json.roll_offer);
    // Only when it gave some (.scratch/secret-reveals/spec.md), so a judgement without them reads as before.
    const secretsRevealed = readJudgedSecrets(json.secrets_revealed);
    return { ...judgement, ...(rollOffer ? { rollOffer } : {}), ...(secretsRevealed.length > 0 ? { secretsRevealed } : {}) };
}

// ---------------------------------------------------------------------------------------------
// Secret reveals (.scratch/secret-reveals/spec.md). Added like the Roll offer: the prompt is built
// as before, then the field goes on the reply shape and the section at the end of the user message.
// ---------------------------------------------------------------------------------------------

/** What a judgement asking about Secret reveals adds to the prompt's input. */
export interface SecretsJudgeInput {
    /**
     * The Story has a Secret with a level: the reply shape names `secrets_revealed` on every call in
     * its Chats, whether or not one is on offer, so the system message stays the same from call to
     * call. False or left out: the prompt is exactly as before.
     */
    secretsShape?: boolean;
    /** The "# Secrets that may come out" section (`judgeSecretsSection`), sent only with the shape and only when a Secret is on offer. It goes last. */
    secretsSection?: string | null;
}

/** The reply shape with `details` (DETAILS_SHAPE), whenever the details section is sent: every judgement on live. */
function withDetailsShape(system: string): string {
    const shaped = system.replace(/\}\nEmpty arrays when nothing changed\.$/, `,\n ${DETAILS_SHAPE}}\nEmpty arrays when nothing changed.`);
    if (shaped === system) throw new Error('judge prompt: the reply shape no longer ends as expected');
    return shaped;
}

/**
 * The reply shape with `"secrets_revealed":[]`. As with the facts and the Roll offer, DeepSeek V4 Flash
 * leaves out a field only the user message asks for (.scratch/story-quality/spec.md, "Real-model
 * check"). Empty in the shape, not an example, so the default is no reveal.
 */
export function withSecretsShape(system: string): string {
    const shaped = system.replace(/\}\nEmpty arrays when nothing changed\.$/, ',\n "secrets_revealed":[]}\nEmpty arrays when nothing changed.');
    if (shaped === system) throw new Error('judge prompt: the reply shape no longer ends as expected');
    return shaped;
}

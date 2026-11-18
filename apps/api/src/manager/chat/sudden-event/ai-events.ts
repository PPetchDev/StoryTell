import { EventProposal, GaugeDirection, SUDDEN_EVENT_TURNS } from '../../../model/story/entities/sudden-event.entity.js';
import type { PromptMessage } from '../../../service/model-gateway/model-gateway.js';
import { EventDefinition, EventState, eventName, eventState, GAUGE_RULES, goalInWords } from './sudden-event.js';

/**
 * Sudden events the story makes up (.scratch/ai-events/spec.md): when the Judge may propose one,
 * what it is asked and how the reply shape names the field, how its answer is read and taken,
 * and what the Chat shows. Pure logic over plain inputs: the managers gather them. Kept apart
 * from the Judge's own prompt file, so its section and field are added around the prompt that
 * file builds.
 */

/** The fewest replies a model wrote in the Chat, the judged one included, before the first proposal. */
export const AI_EVENT_FIRST_AFTER = 8;
/** The fewest replies since the last proposal, and since the last step of any event, before another. */
export const AI_EVENT_GAP = 16;
/** The most proposals one Chat gets, declined ones included. */
export const MAX_AI_EVENTS_PER_CHAT = 4;
/** What answering about a new event adds to the judge's token cap. */
export const AI_EVENT_EXTRA_TOKENS = 150;

/** The longest each text of a proposal is kept; the Gauge's name as the author's is. */
const LIMITS = { name: 60, trigger: 300, gauge: 40, outcome: 400, reason: 300 } as const;

/** A Sudden event a Chat made up, as these rules read it: an event, plus its proposal. */
export interface ChatEvent extends EventDefinition {
    /** The AI Message whose judgement proposed it. */
    messageId: number | null;
    proposal: EventProposal | null;
    /** Why the Judge proposed it now. */
    reason: string;
}

/**
 * The Chat's Sudden events with its made-up ones: an accepted one reads as an authored event that
 * has started, so the Judge, the Narrator and the banner treat it the same. A made-up event never
 * waits for a trigger: it starts only when the user accepts it.
 */
export function chatEventState(
    storyEvents: readonly EventDefinition[],
    chatEvents: readonly ChatEvent[],
    steps: Parameters<typeof eventState>[1],
): EventState {
    const accepted = chatEvents.filter((event) => event.proposal === EventProposal.Accepted);
    const state = eventState([...storyEvents, ...accepted], steps);
    const own = new Set(chatEvents.map((event) => event.id));
    return { ...state, waiting: state.waiting.filter((event) => !own.has(event.id)) };
}

/** What decides whether the Judge is offered a new event for one reply. */
export interface AiEventOfferInput {
    /** The Story's switch. */
    on: boolean;
    /** The judged reply is an Epilogue: it starts nothing. */
    epilogue: boolean;
    /** An event is under way before this reply. */
    active: boolean;
    /** The replies a model wrote in the Chat, oldest first, up to and including the judged one. */
    replyIds: readonly number[];
    /** The Messages of the Chat's proposals so far (any outcome), the judged reply's own left out. */
    proposalMessageIds: readonly number[];
    /** The Messages of every event step in the Chat before this reply. */
    stepMessageIds: readonly number[];
}

/**
 * Whether the Judge may propose a new event for this reply: the switch on, not an Epilogue, none
 * under way, enough replies into the Chat, far enough from the last proposal and from the last
 * step of any event, and under the Chat's cap.
 */
export function aiEventOffered(input: AiEventOfferInput): boolean {
    if (!input.on || input.epilogue || input.active) return false;
    if (input.replyIds.length < AI_EVENT_FIRST_AFTER) return false;
    if (input.proposalMessageIds.length >= MAX_AI_EVENTS_PER_CHAT) return false;
    const newest = input.replyIds.length - 1;
    const since = (messageId: number): number => {
        const at = input.replyIds.indexOf(messageId);
        return at < 0 ? Infinity : newest - at;
    };
    return [...input.proposalMessageIds, ...input.stepMessageIds].every((messageId) => since(messageId) >= AI_EVENT_GAP);
}

/**
 * Words of physical intimacy: an exchange with one is an intimate moment, and no event is proposed
 * in it, whatever the Judge says. On the Judge's rule as well, not in its place.
 */
export const INTIMATE_WORDS =
    /\b(kiss(?:es|ed|ing)?|naked|nude|undress\w*|unbutton\w*|moan\w*|caress\w*|arous\w*|thrust\w*|orgasm\w*|climax\w*|nipples?|breasts?|lovemaking|make love|making love|made love|sex|sexual|aroused|straddl\w*|grind(?:s|ing)? against)\b/i;

/** Whether the latest exchange is an intimate moment. */
export function intimateExchange(text: string): boolean {
    return INTIMATE_WORDS.test(text);
}

/**
 * The Judge's section about a new event, sent only when one is offered. It never changes, so a
 * Chat sends the same words each time it is offered; the reply shape names its field.
 */
export function judgeNewEventSection(): string {
    const lower = GAUGE_RULES[GaugeDirection.Lower];
    const raise = GAUGE_RULES[GaugeDirection.Raise];
    return [
        '# A new Sudden event',
        'The author lets the story make up a Sudden event: a short moment of pressure in which the user has a few replies to move a Gauge (0 to 100) to its goal, and fails at once at its far end. None is under way. The user reads what you propose and chooses whether it starts.',
        'New event rule: give "new_event" only when the latest exchange itself opens a real moment of pressure the story would gain from: a confrontation, an accusation, a chase, a test of nerve or skill, a hard bargain, a sudden danger. Never during an intimate, romantic or sexual moment, a tender or quiet one, a meal or a rest; never for something already settled, or only near or planned. Almost always "new_event" is null; when in doubt, null.',
        'Shape: "new_event": {"reason": "...", "name": "...", "trigger": "...", "gauge": "...", "direction": "lower", "turns": 4, "success": "...", "failure": "..."}',
        '- reason: one short sentence the user reads, saying why this moment, in plain words.',
        '- name: two to five words. trigger: one sentence saying what is happening now.',
        '- gauge: one or two words for what is measured ("Suspicion", "Nerve", "Trust").',
        `- direction: "lower" when the user must bring it down (it starts at ${lower.start}, the goal is ${goalInWords(GaugeDirection.Lower)}, ${lower.fail} fails), "raise" when up (it starts at ${raise.start}, the goal is ${goalInWords(GaugeDirection.Raise)}, ${raise.fail} fails).`,
        `- turns: the user's replies, ${SUDDEN_EVENT_TURNS.min} to ${SUDDEN_EVENT_TURNS.max}.`,
        '- success, failure: one sentence each, what follows in the story.',
        "Never give away a Character's secret in the reason, the name or the trigger.",
    ].join('\n');
}

/** The line after the reply shape that says when `new_event` is more than null. */
export const NEW_EVENT_SHAPE_NOTE = '"new_event" stays null unless the message has a New event rule; then it is the object that rule shows.';

/**
 * The reply shape with `new_event` (the live lesson of 2026-11-18: on DeepSeek V4 Flash a field
 * only the user message asks for is not returned). Added last, to whichever system message the
 * call would send, whenever the Story's switch is on, so the system message stays the same from
 * call to call. Where the shape no longer ends as expected the note still goes on the end.
 */
export function withNewEventShape(system: string): string {
    const shaped = system.replace(/\}\nEmpty arrays when nothing changed\.$/, ',\n "new_event":null}\nEmpty arrays when nothing changed.');
    return `${shaped}\n${NEW_EVENT_SHAPE_NOTE}`;
}

/** Whether the Judge is asked about a new event for this reply: the Story's switch, and the section when offered. */
export interface AiEventAsk {
    on: boolean;
    offered: boolean;
}

/**
 * The judge's prompt with the new event added around it: the shape whenever the switch is on, and
 * the section after the exchange, with more room to answer, when one is offered. Switch off: the
 * prompt exactly as built.
 */
export function withAiEvents<P extends { messages: PromptMessage[]; maxTokens: number }>(prompt: P, ask: AiEventAsk): P {
    if (!ask.on) return prompt;
    const messages = prompt.messages.map((message, index) => {
        if (index === 0 && message.role === 'system') return { ...message, content: withNewEventShape(message.content) };
        if (ask.offered && index === prompt.messages.length - 1 && message.role === 'user') {
            return { ...message, content: `${message.content}\n\n${judgeNewEventSection()}` };
        }
        return message;
    });
    return { ...prompt, messages, maxTokens: prompt.maxTokens + (ask.offered ? AI_EVENT_EXTRA_TOKENS : 0) };
}

/** A new event the Judge proposed, read loosely. */
export interface JudgedNewEvent {
    name: string;
    trigger: string;
    gauge: string;
    direction: GaugeDirection;
    turns: number;
    success: string;
    failure: string;
    reason: string;
}

const text = (value: unknown, most: number): string => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, most).trim() : '');

/**
 * Reads `new_event`: it needs a trigger and a Gauge name; the name falls back to the Gauge's; the
 * texts are cut to their limits; the direction is "lower" unless it says "raise"; the replies are
 * rounded and held to 2–8, 4 when not a number. Anything else is null.
 */
export function readJudgedNewEvent(value: unknown): JudgedNewEvent | null {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
    const fields = value as Record<string, unknown>;
    const trigger = text(fields.trigger, LIMITS.trigger);
    const gauge = text(fields.gauge, LIMITS.gauge);
    if (!trigger || !gauge) return null;
    const turns =
        typeof fields.turns === 'number' && Number.isFinite(fields.turns)
            ? Math.min(SUDDEN_EVENT_TURNS.max, Math.max(SUDDEN_EVENT_TURNS.min, Math.round(fields.turns)))
            : SUDDEN_EVENT_TURNS.default;
    return {
        name: text(fields.name, LIMITS.name) || gauge,
        trigger,
        gauge,
        direction: text(fields.direction, 10).toLowerCase() === GaugeDirection.Raise ? GaugeDirection.Raise : GaugeDirection.Lower,
        turns,
        success: text(fields.success, LIMITS.outcome),
        failure: text(fields.failure, LIMITS.outcome),
        reason: text(fields.reason, LIMITS.reason),
    };
}

/**
 * The `new_event` of the judge's reply, read from its JSON as the judgement is; null when there is
 * none to read. Read here rather than in the judgement, so the Judge's own parser stays as it was.
 */
export function readNewEventFrom(reply: string): JudgedNewEvent | null {
    const match = reply.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
        const json: unknown = JSON.parse(match[0]);
        return typeof json === 'object' && json !== null ? readJudgedNewEvent((json as Record<string, unknown>).new_event) : null;
    } catch {
        return null;
    }
}

/**
 * Whether a proposed event is taken: only when it was offered, nothing else this judgement started
 * an event, and the exchange is not an intimate moment. `rejected` says why not, for the log.
 */
export function takeNewEvent(
    context: { offered: boolean; startedAnother: boolean; exchange: string },
    judged: JudgedNewEvent | null,
): { event: JudgedNewEvent | null; rejected: string[] } {
    if (!judged) return { event: null, rejected: [] };
    const why = !context.offered
        ? 'a new event when none was offered'
        : context.startedAnother
          ? 'a new event in the reply another event started'
          : intimateExchange(context.exchange)
            ? 'a new event in an intimate moment'
            : null;
    return why ? { event: null, rejected: [`Sudden event: ${why} ("${judged.name}")`] } : { event: judged, rejected: [] };
}

/** A proposal as the Chat screen shows it. */
export interface EventProposalView {
    id: number;
    name: string;
    trigger: string;
    gauge: string;
    direction: GaugeDirection;
    turns: number;
    /** Where the Gauge starts, the goal to reach and the end that fails at once. */
    start: number;
    goal: number;
    fail: number;
    reason: string;
}

/**
 * The proposal the Chat shows: the newest one still offered whose Message is the newest AI
 * Message, while no event is under way. One the user played past lapses by itself.
 */
export function shownProposal(chatEvents: readonly ChatEvent[], active: boolean, newestAiMessageId: number | null): ChatEvent | null {
    if (active || newestAiMessageId === null) return null;
    const offered = chatEvents.filter((event) => event.proposal === EventProposal.Offered && event.messageId === newestAiMessageId);
    return offered[offered.length - 1] ?? null;
}

export function eventProposalView(event: ChatEvent | null): EventProposalView | null {
    if (!event) return null;
    return {
        id: event.id,
        name: eventName(event),
        trigger: event.trigger.trim(),
        gauge: event.gauge.trim(),
        direction: event.direction,
        turns: event.turns,
        ...GAUGE_RULES[event.direction],
        reason: event.reason,
    };
}

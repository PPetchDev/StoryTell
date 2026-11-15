import { GaugeDirection } from '../../../model/story/entities/sudden-event.entity.js';
import { SuddenEventStepKind } from '../../../model/ledger/entities/sudden-event-step.entity.js';

/**
 * Sudden events (.scratch/sudden-events/spec.md): the rules of the Gauge, a Chat's event state
 * read from its steps, what the Judge is asked and how its answer is applied, and what the
 * Narrator is told. Pure logic over plain inputs: the managers gather them.
 */

/** The Gauge's scale. */
export const GAUGE_MIN = 0;
export const GAUGE_MAX = 100;
/** The most one reply moves the Gauge, either way. */
export const GAUGE_MAX_STEP = 30;

/** Where the Gauge starts, the goal the user must reach, and the end that fails at once, for each direction. */
export const GAUGE_RULES: Record<GaugeDirection, { start: number; goal: number; fail: number }> = {
    [GaugeDirection.Lower]: { start: 60, goal: 20, fail: GAUGE_MAX },
    [GaugeDirection.Raise]: { start: 40, goal: 80, fail: GAUGE_MIN },
};

/** A Story's Sudden event as these rules read it. */
export interface EventDefinition {
    id: number;
    name: string;
    trigger: string;
    gauge: string;
    direction: GaugeDirection;
    turns: number;
    success: string;
    failure: string;
}

/** A recorded step, oldest first in a list. */
export interface EventStep {
    suddenEventId: number;
    kind: SuddenEventStepKind;
    gauge: number;
    turnsLeft: number;
    reason: string;
    messageId: number;
}

export type EventOutcome = 'success' | 'failure';

/** A Chat's Sudden events, read from its steps and the Story's events as they are now. */
export interface EventState {
    /** The event under way, with its newest step; null when none is. */
    active: { event: EventDefinition; gauge: number; turnsLeft: number; reason: string } | null;
    /** The event that ended last, with the step that ended it; null when none has, or one started since. */
    ended: { event: EventDefinition; outcome: EventOutcome; gauge: number; reason: string; messageId: number } | null;
    /** The events that can still start: ready, and with no step in this Chat. In the author's order. */
    waiting: EventDefinition[];
}

/** Whether an event has what it needs to run: a trigger for the Judge to watch for, and a named Gauge. */
export function eventReady(event: Pick<EventDefinition, 'trigger' | 'gauge'>): boolean {
    return event.trigger.trim() !== '' && event.gauge.trim() !== '';
}

/** What the event is called where its name is blank: its Gauge's name. */
export function eventName(event: Pick<EventDefinition, 'name' | 'gauge'>): string {
    return event.name.trim() || event.gauge.trim() || 'Sudden event';
}

/**
 * The Chat's state from its steps, oldest first. Only the newest step says what is under way: a
 * start or a move of an event the Story still has. An event runs once per Chat, so one with any
 * step no longer waits.
 */
export function eventState(events: readonly EventDefinition[], steps: readonly EventStep[]): EventState {
    const happened = new Set(steps.map((step) => step.suddenEventId));
    const last = steps[steps.length - 1];
    const event = last ? (events.find((candidate) => candidate.id === last.suddenEventId) ?? null) : null;
    const running = last !== undefined && (last.kind === SuddenEventStepKind.Start || last.kind === SuddenEventStepKind.Move);
    return {
        active: event && running ? { event, gauge: last.gauge, turnsLeft: last.turnsLeft, reason: last.reason } : null,
        ended:
            event && last && !running
                ? {
                      event,
                      outcome: last.kind === SuddenEventStepKind.Success ? 'success' : 'failure',
                      gauge: last.gauge,
                      reason: last.reason,
                      messageId: last.messageId,
                  }
                : null,
        waiting: events.filter((candidate) => eventReady(candidate) && !happened.has(candidate.id)),
    };
}

/** "20 or lower" / "80 or higher": the goal in words. */
export function goalInWords(direction: GaugeDirection): string {
    const { goal } = GAUGE_RULES[direction];
    return direction === GaugeDirection.Lower ? `${goal} or lower` : `${goal} or higher`;
}

/** What the Judge answered about Sudden events, read loosely; null when it said nothing readable. */
export interface JudgedSuddenEvent {
    /** The number of the waiting event it says has started; null when it gave none. */
    start: number | null;
    /** The Gauge after the exchange; null when it gave none. */
    gauge: number | null;
    reason: string;
}

/** Reads the judgement's `sudden_event` object: whole numbers only, anything else is left out. */
export function readJudgedSuddenEvent(value: unknown): JudgedSuddenEvent | null {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
    const fields = value as Record<string, unknown>;
    const whole = (field: unknown): number | null => (typeof field === 'number' && Number.isFinite(field) ? Math.round(field) : null);
    const start = whole(fields.start);
    const gauge = whole(fields.gauge);
    if (start === null && gauge === null) return null;
    return { start, gauge, reason: typeof fields.reason === 'string' ? fields.reason.trim() : '' };
}

/**
 * The Judge's section about Sudden events, or null when the Story has none that can start and none
 * is under way: the judge's prompt is then exactly as it was. The rule and the JSON field are in
 * the section, so the system message never changes.
 */
export function judgeSuddenEventSection(state: Pick<EventState, 'active' | 'waiting'>): string | null {
    if (state.active) {
        const { event, gauge, turnsLeft } = state.active;
        const rules = GAUGE_RULES[event.direction];
        const lower = event.direction === GaugeDirection.Lower;
        const after = turnsLeft - 1;
        return [
            '# Sudden event under way',
            `${eventName(event)}. It began when: ${event.trigger.trim()}`,
            `Gauge: ${event.gauge.trim()}, now ${gauge} on a scale of ${GAUGE_MIN} to ${GAUGE_MAX}. The user is trying to bring it ${lower ? 'down' : 'up'} to ${goalInWords(event.direction)}; at ${rules.fail} they fail at once.`,
            after > 0 ? `Replies left after this one: ${after}.` : 'This is the last reply: after it the event ends.',
            `Sudden event rule: add "sudden_event": {"reason": "...", "gauge": 0} to your JSON, where "gauge" is ${event.gauge.trim()} after the latest exchange. Move it by what the user did in this exchange and how the Characters took it: at most ${GAUGE_MAX_STEP} either way, and the same number when the exchange changed nothing. Be fair, not kind: a weak or careless move from the user moves it the wrong way. Write the reason first: one short sentence the user will read, saying what moved it, in plain words and without giving away a Character's secret.`,
        ].join('\n');
    }
    if (state.waiting.length === 0) return null;
    return [
        '# Sudden events',
        'None is under way. Each of these starts when its trigger happens in the story:',
        ...state.waiting.map((event, index) => `${index + 1}. ${eventName(event)} — starts when: ${event.trigger.trim()}`),
        'Sudden event rule: add "sudden_event": {"reason": "...", "start": 1} to your JSON, with the event\'s number, only when the latest exchange clearly shows that trigger happening now. Not when it is only near, hinted at or planned; when in doubt, leave "sudden_event" out. At most one.',
    ].join('\n');
}

/** A step to record against the judged Message. */
export interface NewEventStep {
    suddenEventId: number;
    kind: SuddenEventStepKind;
    gauge: number;
    turnsLeft: number;
    reason: string;
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/**
 * What one judgement does to the Chat's Sudden events. Under way: the reply uses one of the
 * user's replies whatever the Judge said, the Gauge moves at most `GAUGE_MAX_STEP` and stays on its
 * scale, then the event ends with the goal reached (the goal wins when both ends are named), at the
 * failing end, or with no replies left. Not under way: a waiting event the Judge named starts.
 * Anything else changes nothing. `rejected` says why what the Judge gave was not taken, for the log.
 */
export function applySuddenEvent(
    state: Pick<EventState, 'active' | 'waiting'>,
    judged: JudgedSuddenEvent | null,
): { step: NewEventStep | null; rejected: string[] } {
    const rejected: string[] = [];
    if (state.active) {
        const { event, gauge: before, turnsLeft } = state.active;
        const rules = GAUGE_RULES[event.direction];
        if (judged?.start !== null && judged?.start !== undefined) rejected.push('Sudden event: a start while one is under way');
        const wanted = judged?.gauge ?? before;
        const gauge = clamp(clamp(wanted, before - GAUGE_MAX_STEP, before + GAUGE_MAX_STEP), GAUGE_MIN, GAUGE_MAX);
        if (gauge !== wanted) rejected.push(`Sudden event: Gauge ${before} → ${wanted} held to ${gauge}`);
        const left = Math.max(0, turnsLeft - 1);
        const lower = event.direction === GaugeDirection.Lower;
        const reached = lower ? gauge <= rules.goal : gauge >= rules.goal;
        const broke = gauge === rules.fail;
        const kind = reached
            ? SuddenEventStepKind.Success
            : broke || left === 0
              ? SuddenEventStepKind.Failure
              : SuddenEventStepKind.Move;
        const reason = judged?.gauge !== null && judged?.gauge !== undefined ? judged.reason : '';
        return { step: { suddenEventId: event.id, kind, gauge, turnsLeft: left, reason }, rejected };
    }
    if (!judged) return { step: null, rejected };
    if (judged.start === null) {
        rejected.push('Sudden event: a Gauge with none under way');
        return { step: null, rejected };
    }
    const event = state.waiting[judged.start - 1];
    if (!event) {
        rejected.push(`Sudden event: start ${judged.start} names no waiting event`);
        return { step: null, rejected };
    }
    return {
        step: {
            suddenEventId: event.id,
            kind: SuddenEventStepKind.Start,
            gauge: GAUGE_RULES[event.direction].start,
            turnsLeft: event.turns,
            reason: judged.reason,
        },
        rejected,
    };
}

/** What the Narrator is told about the Chat's Sudden event for one reply. */
export type PromptSuddenEvent =
    | { status: 'active'; name: string; gauge: string; direction: GaugeDirection; value: number; turnsLeft: number }
    | { status: 'ended'; name: string; gauge: string; outcome: EventOutcome; value: number; follows: string };

/**
 * The event as the turn about to be written reads it: the one under way, or the one that ended
 * with the newest AI Message (`newestAiMessageId`), whose outcome this reply shows. An event that
 * ended earlier is told no more: its outcome is in the story by then.
 */
export function promptSuddenEvent(state: Pick<EventState, 'active' | 'ended'>, newestAiMessageId: number | null): PromptSuddenEvent | null {
    if (state.active) {
        const { event, gauge, turnsLeft } = state.active;
        return { status: 'active', name: eventName(event), gauge: event.gauge.trim(), direction: event.direction, value: gauge, turnsLeft };
    }
    if (state.ended && state.ended.messageId === newestAiMessageId) {
        const { event, outcome, gauge } = state.ended;
        return {
            status: 'ended',
            name: eventName(event),
            gauge: event.gauge.trim(),
            outcome,
            value: gauge,
            follows: (outcome === 'success' ? event.success : event.failure).trim(),
        };
    }
    return null;
}

/**
 * The Sudden event block of a turn's trailing message, or null when there is nothing to tell. It
 * sits after "Where things stand". Under way, the Narrator plays the pressure and leaves the
 * outcome to the Gauge; just ended, it shows the outcome. Either way the Gauge and its numbers
 * stay out of the story, and the rule about the worn identity stands.
 */
export function suddenEventBlock(event: PromptSuddenEvent | null | undefined, identity: string): string | null {
    if (!event) return null;
    if (event.status === 'active') {
        const way = event.direction === GaugeDirection.Lower ? 'down' : 'up';
        const left = event.turnsLeft === 1 ? 'this reply is the last one they have' : `${event.turnsLeft} replies are left`;
        return `A sudden event is under way: ${event.name}. ${event.gauge} stands at ${event.value} of ${GAUGE_MAX}; ${identity} is trying to bring it ${way} to ${goalInWords(event.direction)}, and ${left}. Keep its pressure in the scene: let the Characters press, and let what ${identity} just did or failed to do count. Don't settle it yourself, and never mention the gauge, its numbers or a "sudden event" in the story.`;
    }
    const result = event.outcome === 'success' ? `${identity} came through it` : `it went against ${identity}`;
    const follows = event.follows ? ` What follows: ${event.follows}` : '';
    return `The sudden event ${event.name} has just ended: ${result} (${event.gauge} ended at ${event.value} of ${GAUGE_MAX}).${follows} Show that outcome in this reply and let it change how the Characters treat ${identity}. Never mention the gauge or its numbers, and never write what ${identity} says, thinks, feels, decides or does.`;
}

/** What the Story so far trigger reserves for the Sudden event block of a Story that has one. */
export const SUDDEN_EVENT_RESERVE_TOKENS = 150;

/** The Chat's Sudden event as the Chat screen shows it. */
export interface SuddenEventView {
    id: number;
    name: string;
    gauge: string;
    direction: GaugeDirection;
    status: 'active' | EventOutcome;
    /** The Gauge now, 0 to 100. */
    value: number;
    /** Where it started, the goal to reach and the end that fails at once. */
    start: number;
    goal: number;
    fail: number;
    /** The replies the user still has; 0 once it has ended. */
    turnsLeft: number;
    /** Why the Gauge last moved, or why the event began; may be empty. */
    reason: string;
}

/** The event the Chat screen shows: the one under way, or the one that ended with the newest AI Message. */
export function suddenEventView(state: Pick<EventState, 'active' | 'ended'>, newestAiMessageId: number | null): SuddenEventView | null {
    const of = (event: EventDefinition) => ({
        id: event.id,
        name: eventName(event),
        gauge: event.gauge.trim(),
        direction: event.direction,
        ...GAUGE_RULES[event.direction],
    });
    if (state.active) {
        const { event, gauge, turnsLeft, reason } = state.active;
        return { ...of(event), status: 'active', value: gauge, turnsLeft, reason };
    }
    if (state.ended && state.ended.messageId === newestAiMessageId) {
        const { event, outcome, gauge, reason } = state.ended;
        return { ...of(event), status: outcome, value: gauge, turnsLeft: 0, reason };
    }
    return null;
}

'use client';

import { GAUGE_DIRECTION_LABELS, GAUGE_RULES, GaugeDirection, gaugeGoalInWords, SUDDEN_EVENT_TURN_LABELS, SuddenEvent } from '@/lib/story';
import { ConfirmButton, SegmentedField, TextField, Toolbar } from './fields';
import { cardToggle, FoldingCard, NOTE } from './folding-card';

type TextKey = 'name' | 'trigger' | 'gauge' | 'success' | 'failure';

interface SuddenEventCardProps {
    event: SuddenEvent;
    index: number;
    onText(field: TextKey, value: string): void;
    onDirection(direction: GaugeDirection): void;
    onTurns(turns: number): void;
    /** Removes the event; focus moves to the next card once the promise it returns settles. */
    onRemove(): void | Promise<unknown>;
}

/** The DOM id of one of a Sudden event's fields, for a folded card's "needed" mark and for tests. */
const fieldId = (eventId: number, field: string) => `field-suddenEvent.${eventId}.${field}`;

/**
 * One Sudden event on the Scenes tab (.scratch/sudden-events/spec.md): its name, the trigger the
 * Judge watches for, the Gauge and which way the user must move it, how many replies they get, and
 * what follows either way. It runs once it has a trigger and a Gauge name; until then the card says so.
 */
export function SuddenEventCard({ event, index, onText, onDirection, onTurns, onRemove }: SuddenEventCardProps) {
    const heading = event.name.trim() || event.gauge.trim() || `Sudden event ${index + 1}`;
    const ready = event.trigger.trim() !== '' && event.gauge.trim() !== '';
    const rules = GAUGE_RULES[event.direction];
    const gauge = event.gauge.trim() || 'The Gauge';
    return (
        <FoldingCard
            foldKey={`suddenEvent:${event.id}`}
            label={`Sudden event ${index + 1}`}
            fieldPrefixes={[]}
            title={<span>{heading}</span>}
            tools={
                <Toolbar>
                    <ConfirmButton
                        label="Remove"
                        danger
                        question={`Remove ${heading}?`}
                        warning="A Chat in the middle of it simply plays on without it."
                        confirmLabel="Remove"
                        ariaLabel={`Remove Sudden event ${index + 1}`}
                        onConfirm={onRemove}
                        focusAfter={() => cardToggle(`Sudden event ${index + 1}`) ?? cardToggle(`Sudden event ${index}`)}
                    />
                </Toolbar>
            }
        >
            {!ready && <p className={NOTE}>It starts running once it has a trigger and a Gauge name.</p>}
            <TextField
                label="Name"
                value={event.name}
                hint="Shown at the top of the Chat while it runs."
                placeholder="The interrogation"
                domId={fieldId(event.id, 'name')}
                onChange={(v) => onText('name', v)}
            />
            <TextField
                label="Starts when"
                value={event.trigger}
                multiline
                rows={2}
                hint="One sentence. The moment it happens in a Chat, the event begins."
                placeholder="A Character questions {user} about where they were last night."
                domId={fieldId(event.id, 'trigger')}
                onChange={(v) => onText('trigger', v)}
            />
            <TextField
                label="Gauge"
                value={event.gauge}
                hint="What is measured, in a word or two: Suspicion, Trust, Nerve."
                placeholder="Suspicion"
                domId={fieldId(event.id, 'gauge')}
                onChange={(v) => onText('gauge', v.slice(0, 40))}
            />
            <SegmentedField
                label="Goal"
                value={event.direction}
                options={GAUGE_DIRECTION_LABELS}
                hint={`${gauge} starts at ${rules.start} of 100. To succeed, bring it to ${gaugeGoalInWords(event.direction)}; at ${rules.fail} it fails at once.`}
                domId={fieldId(event.id, 'direction')}
                onChange={onDirection}
            />
            <SegmentedField
                label="Replies"
                value={String(event.turns)}
                options={SUDDEN_EVENT_TURN_LABELS}
                hint="How many replies you get before it ends. Each one moves the Gauge by how you played it."
                domId={fieldId(event.id, 'turns')}
                onChange={(v) => onTurns(Number(v))}
            />
            <TextField
                label="After a success"
                value={event.success}
                multiline
                rows={2}
                hint="Optional. What follows, for the Narrator to show in the next reply."
                domId={fieldId(event.id, 'success')}
                onChange={(v) => onText('success', v)}
            />
            <TextField
                label="After a failure"
                value={event.failure}
                multiline
                rows={2}
                hint="Optional. What follows when the Gauge hits its far end or the replies run out."
                domId={fieldId(event.id, 'failure')}
                onChange={(v) => onText('failure', v)}
            />
        </FoldingCard>
    );
}

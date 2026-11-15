'use client';

import { Ending } from '@/lib/story';
import { ConfirmButton, TextField, Toolbar } from './fields';
import { cardToggle, FoldingCard, NOTE } from './folding-card';

type TextKey = 'name' | 'condition' | 'epilogue';

interface EndingCardProps {
    ending: Ending;
    index: number;
    onText(field: TextKey, value: string): void;
    /** Removes the Ending; focus moves to the next card once the promise it returns settles. */
    onRemove(): void | Promise<unknown>;
}

/** The DOM id of one of an Ending's fields, for tests. */
const fieldId = (endingId: number, field: string) => `field-ending.${endingId}.${field}`;

/**
 * One Ending on the Scenes tab (.scratch/endings/spec.md): its name, the condition the Judge
 * watches for, and what its Epilogue should tell. It can be reached once it has a condition;
 * until then the card says so.
 */
export function EndingCard({ ending, index, onText, onRemove }: EndingCardProps) {
    const heading = ending.name.trim() || `Ending ${index + 1}`;
    const ready = ending.condition.trim() !== '';
    return (
        <FoldingCard
            foldKey={`ending:${ending.id}`}
            label={`Ending ${index + 1}`}
            fieldPrefixes={[]}
            title={<span>{heading}</span>}
            tools={
                <Toolbar>
                    <ConfirmButton
                        label="Remove"
                        danger
                        question={`Remove ${heading}?`}
                        warning="A Chat that reached it has then reached no Ending."
                        confirmLabel="Remove"
                        ariaLabel={`Remove Ending ${index + 1}`}
                        onConfirm={onRemove}
                        focusAfter={() => cardToggle(`Ending ${index + 1}`) ?? cardToggle(`Ending ${index}`)}
                    />
                </Toolbar>
            }
        >
            {!ready && <p className={NOTE}>It can be reached once it says when.</p>}
            <TextField
                label="Name"
                value={ending.name}
                hint="Shown in the Chat when the story reaches it, and on the Story's Chats."
                placeholder="The light returns"
                domId={fieldId(ending.id, 'name')}
                onChange={(v) => onText('name', v)}
            />
            <TextField
                label="Reached when"
                value={ending.condition}
                multiline
                rows={2}
                hint="One sentence. The moment all of it has happened in a Chat, that Chat has reached this Ending."
                placeholder="The lamp is lit again and Mira asks {user} to stay."
                domId={fieldId(ending.id, 'condition')}
                onChange={(v) => onText('condition', v)}
            />
            <TextField
                label="The epilogue should tell"
                value={ending.epilogue}
                multiline
                rows={2}
                hint="Optional. What the closing passage is about, for the Narrator, when you ask for the epilogue."
                placeholder="The first ship to pass the reef safely, and who stood at the rail."
                domId={fieldId(ending.id, 'epilogue')}
                onChange={(v) => onText('epilogue', v)}
            />
        </FoldingCard>
    );
}

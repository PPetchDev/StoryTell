'use client';

import { useId } from 'react';

import { BOND_AXES, BOND_AXIS_NAMES, BOND_AXIS_RANGE, BondAxis } from '@/lib/bonds';
import { Character, CharacterSecret, CharacterSecretFields, MAX_SECRETS } from '@/lib/story';
import { BondLevelField } from './bond-level-field';
import { ConfirmButton, FIELD, FIELD_HEAD, FIELD_HINT, FIELD_INPUT, FIELD_LABEL, TextField } from './fields';
import { SUBSECTION, SUBSECTION_LEGEND } from './folding-card';

const ANY_TIME = '';

interface CharacterSecretsProps {
    character: Character;
    /** The Role's name, as the level reads ("toward Ash"). */
    roleName: string;
    /** One Secret's text or level, shown at once and saved like any other field. */
    onChange(secretId: number, fields: CharacterSecretFields): void;
    onAdd(): void | Promise<unknown>;
    onRemove(secretId: number): void | Promise<unknown>;
}

/** The feeling a Secret waits for, or "Any time": a select styled like the editor's other fields. */
function NeedsField({ secret, roleName, onChange }: { secret: CharacterSecret; roleName: string; onChange(fields: CharacterSecretFields): void }) {
    const id = useId();
    return (
        <div className={FIELD}>
            <div className={FIELD_HEAD}>
                <span className={FIELD_LABEL}>
                    <label htmlFor={id}>Told once</label>
                </span>
            </div>
            <select
                id={id}
                className={FIELD_INPUT}
                value={secret.axis ?? ANY_TIME}
                onChange={(event) => {
                    const value = event.target.value;
                    if (value === ANY_TIME) return onChange({ axis: null, atLeast: null });
                    const axis = value as BondAxis;
                    const { min, max } = BOND_AXIS_RANGE[axis];
                    // A new feeling keeps the level where it fits its scale, or starts one step up.
                    const atLeast = secret.atLeast === null ? Math.min(max, 1) : Math.min(max, Math.max(min, secret.atLeast));
                    onChange({ axis, atLeast });
                }}
            >
                <option value={ANY_TIME}>No level: kept like the Secrets above</option>
                {BOND_AXES.map((axis) => (
                    <option key={axis} value={axis}>
                        {`Their ${BOND_AXIS_NAMES[axis]} toward ${roleName} has grown`}
                    </option>
                ))}
            </select>
        </div>
    );
}

/**
 * A Character's Secrets one by one (.scratch/secret-reveals/spec.md): each a text and, if the author
 * wants, how far the Character's feelings toward the Role must grow before they will tell it, picked
 * by its word. Once that is reached the Narrator may let it come out when the moment fits.
 */
export function CharacterSecrets({ character, roleName, onChange, onAdd, onRemove }: CharacterSecretsProps) {
    const secrets = character.secretList ?? [];
    const heading = character.name.trim() || 'this Character';
    return (
        <fieldset className={[SUBSECTION, 'lg:col-span-2'].join(' ')} data-secret-list>
            <legend className={SUBSECTION_LEGEND}>Secrets told in time</legend>
            <p className={`${FIELD_HINT} mb-2`}>
                Optional. One secret each. Pick how far {heading}&apos;s feelings toward {roleName} must grow first: once they have, {heading} may tell it when the
                moment fits, and the player sees it in their profile.
            </p>
            <ol className="m-0 mb-2 grid list-none gap-4 p-0">
                {secrets.map((secret, index) => (
                    <li key={secret.id} className="grid gap-1 rounded-md border border-line p-3" aria-label={`Secret ${index + 1}`} data-secret>
                        <TextField
                            label={`Secret ${index + 1}`}
                            value={secret.text}
                            multiline
                            rows={2}
                            onChange={(text) => onChange(secret.id, { text })}
                        />
                        <div className="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] items-start gap-x-3">
                            <NeedsField secret={secret} roleName={roleName} onChange={(fields) => onChange(secret.id, fields)} />
                            {secret.axis !== null && secret.atLeast !== null && (
                                <BondLevelField label="At least" axis={secret.axis} value={secret.atLeast} onChange={(atLeast) => onChange(secret.id, { atLeast })} />
                            )}
                        </div>
                        <div className="flex justify-end">
                            <ConfirmButton
                                label="Remove"
                                small
                                question={`Remove secret ${index + 1}?`}
                                warning="If a Chat has revealed it, it is no longer revealed there."
                                confirmLabel="Remove"
                                ariaLabel={`Remove secret ${index + 1}`}
                                onConfirm={() => onRemove(secret.id)}
                            />
                        </div>
                    </li>
                ))}
            </ol>
            <button type="button" className="button button-quiet mt-2" disabled={secrets.length >= MAX_SECRETS} onClick={() => void onAdd()}>
                Add secret
            </button>
        </fieldset>
    );
}

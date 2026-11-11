import { BOND_AXIS_NAMES, BondAxis, BondLevels, bondLevelWord } from '../../../model/ledger/bond-axes.js';

/**
 * Bond gates (.scratch/bond-axes/spec.md, "Bond gates and the Scene"; CONTEXT.md: "Bond gate"): a
 * Scene's conditions that one Bond has reached at least a level on one Bond axis. Checked by the
 * app with no model call. Pure logic.
 */

export interface BondGate {
    fromCharacterId: number;
    /** null means toward the user. */
    toCharacterId: number | null;
    axis: BondAxis;
    atLeast: number;
}

/** A current Bond as the check reads it. */
export interface GateBond {
    fromCharacterId: number;
    toCharacterId: number | null;
    /** null while the Bond has no levels yet. */
    levels: BondLevels | null;
}

/** Whether each gate holds on the Bonds as they are: a Bond that hasn't formed, or has no levels yet, holds no gate. */
export function gatesHold(gates: readonly BondGate[], bonds: readonly GateBond[]): boolean[] {
    return gates.map((gate) => {
        const bond = bonds.find((candidate) => candidate.fromCharacterId === gate.fromCharacterId && candidate.toCharacterId === gate.toCharacterId);
        return bond?.levels != null && bond.levels[gate.axis] >= gate.atLeast;
    });
}

/** "Nara toward you, Trust at least trusts": a gate as the user, the Judge and the Narrator read it. */
export function bondGateInWords(fromName: string, towardName: string, axis: BondAxis, atLeast: number): string {
    return `${fromName} toward ${towardName}, ${BOND_AXIS_NAMES[axis]} at least ${bondLevelWord(axis, atLeast)}`;
}

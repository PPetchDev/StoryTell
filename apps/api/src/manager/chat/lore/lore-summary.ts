import type { LoreTriggers } from '../../../model/story/entities/lore-entry.entity.js';

/**
 * The More triggers summary (.scratch/lore-triggers/spec.md: "The Lore card in the editor"):
 * every trigger setting not at its default, in this order, joined by " · ", or "None". These
 * exact words are the summary everywhere: the editor's fold header
 * (apps/web/lib/lore.ts `loreTriggerSummary`) and the Story assistant's rendered Story.
 */
export function loreTriggerSummary(entry: LoreTriggers): string {
    const parts: string[] = [];
    if (entry.secondaryKeywords.length > 0) {
        parts.push(`${entry.secondaryMode === 'unless' ? 'Unless' : 'Also needs'}: ${entry.secondaryKeywords.join(', ')}`);
    }
    if (entry.patterns.length > 0) parts.push(entry.patterns.length === 1 ? '1 pattern' : `${entry.patterns.length} patterns`);
    if (entry.sticky > 0) parts.push(`Stays ${entry.sticky}`);
    if (entry.cooldown > 0) parts.push(`Rests ${entry.cooldown}`);
    if (entry.delay > 0) parts.push(`Waits ${entry.delay}`);
    if (entry.chance < 100) parts.push(`${entry.chance}%`);
    if (entry.group.trim() !== '') parts.push(`Group: ${entry.group.trim()}`);
    if (!entry.recursable) parts.push('Not from other entries');
    return parts.length > 0 ? parts.join(' · ') : 'None';
}

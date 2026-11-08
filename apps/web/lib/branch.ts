/**
 * The one-shot hand-off from a Branch to the new Chat's screen (.scratch/branch/spec.md, "Web"):
 * the title it branched from, for the quiet status line, and the User Message's text for the
 * composer when it was branched from one. Kept in the browser's session storage under the new
 * Chat's id, never in the URL, and taken (read once, then removed), so a reload never puts the
 * draft back a second time.
 */
export interface BranchHandoff {
    from: string;
    draft: string | null;
}

const key = (chatId: number) => `storytell.branch-handoff.${chatId}`;

export function handOffBranch(chatId: number, handoff: BranchHandoff): void {
    try {
        sessionStorage.setItem(key(chatId), JSON.stringify(handoff));
    } catch {
        // Storage refused (a private window): the Branch opens with an empty composer.
    }
}

export function takeBranchHandoff(chatId: number): BranchHandoff | null {
    try {
        const raw = sessionStorage.getItem(key(chatId));
        if (raw === null) return null;
        sessionStorage.removeItem(key(chatId));
        const parsed = JSON.parse(raw) as Partial<BranchHandoff>;
        return { from: String(parsed.from ?? ''), draft: typeof parsed.draft === 'string' ? parsed.draft : null };
    } catch {
        return null;
    }
}

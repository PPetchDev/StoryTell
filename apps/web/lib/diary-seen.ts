/**
 * The Diary entries the user has already been shown (.scratch/diary/spec.md): one they asked for
 * in a profile is seen as it is written, so the Chat screen's "Diary: <name>" toast is only for
 * the entries the Characters write by themselves. Entry ids are unique across Chats.
 */
const seen = new Set<number>();

export function markDiaryEntrySeen(entryId: number): void {
    seen.add(entryId);
}

export function diaryEntrySeen(entryId: number): boolean {
    return seen.has(entryId);
}

// The types of export-chat.mjs, for its test (apps/api/test/eval-long-account.spec.ts), which is TypeScript.

export const PSQL: string;

/** The one statement sent for a Chat: a read-only SELECT that builds its copy as JSON. */
export function exportSql(chatId: number): string;

/** The copy from what psql printed. Throws when there is none, or it is of another Chat. */
export function parseExport(printed: string, chatId: number): any;

/** What the export touches, handed in so its test reaches no VM. */
export interface ExportWorld {
    read(sql: string): string;
    write(name: string, text: string): void;
    log(line: string): void;
}

export function exportChats(ids: number[], world: ExportWorld): { id: number; messages: number }[];
